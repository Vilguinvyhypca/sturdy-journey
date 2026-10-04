"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useEffect } from "react";

type EventName = "page_view" | "page_load" | "page_exit" | "media_open" | "video_start" | "video_complete" | "video_error" | "search" | "filter" | "load_more" | "outbound_click" | "share_link" | "client_error";
type EventPayload = {
  mediaType?: "photo" | "video";
  mediaId?: string;
  filter?: string;
  resultCount?: number;
  queryLength?: number;
  durationMs?: number;
  loadMs?: number;
  errorType?: string;
  source?: string;
  campaign?: string;
  referrerHost?: string;
  destinationHost?: string;
};

let lastPageView: { path: string; at: number } | undefined;
let administratorSession = false;
let fallbackSessionId: string | undefined;
let initialLoadRecorded = false;
let sourceRecordedInMemory = false;

function createSessionId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // This identifier is only for grouping anonymous analytics events, never for authorization.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const value = Math.floor(Math.random() * 16);
    return (character === "x" ? value : (value & 3) | 8).toString(16);
  });
}

function sessionId() {
  try {
    const current = sessionStorage.getItem("ms-experience-session");
    if (current) return current;
    const created = createSessionId();
    sessionStorage.setItem("ms-experience-session", created);
    return created;
  } catch {
    fallbackSessionId ??= createSessionId();
    return fallbackSessionId;
  }
}

export function trackExperience(name: EventName, payload: EventPayload = {}, path = window.location.pathname) {
  if (administratorSession || path.startsWith("/admin") || path.startsWith("/api/")) return;
  const event = { sessionId: sessionId(), name, path, ...payload };
  try {
    void fetch("/api/experience", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => undefined);
  } catch { /* Analytics failures must never interrupt the visitor experience. */ }
}

function sendExitEvent(payload: EventPayload, path: string) {
  if (administratorSession || path.startsWith("/admin")) return;
  const body = JSON.stringify({ sessionId: sessionId(), name: "page_exit", path, ...payload });
  try {
    if (navigator.sendBeacon("/api/experience", new Blob([body], { type: "application/json" }))) return;
  } catch { /* Fall back to a keepalive request where sendBeacon is unavailable. */ }
  trackExperience("page_exit", payload, path);
}

function landingSource() {
  const query = new URLSearchParams(window.location.search);
  const source = query.get("utm_source")?.slice(0, 100) || undefined;
  const medium = query.get("utm_medium")?.slice(0, 100);
  const campaign = query.get("utm_campaign")?.slice(0, 100) || undefined;
  const referrerHost = (() => {
    try {
      const referrer = new URL(document.referrer);
      return referrer.origin === window.location.origin ? undefined : referrer.hostname.slice(0, 253);
    } catch { return undefined; }
  })();
  return {
    source: source ? `${source}${medium ? ` / ${medium}` : ""}` : undefined,
    campaign,
    referrerHost,
  };
}

export function ExperienceTracker() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdministrator = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin === true;
  useEffect(() => { administratorSession = isAdministrator; }, [isAdministrator]);
  useEffect(() => {
    if (isAdministrator || pathname.startsWith("/admin") || pathname.startsWith("/api/")) return;
    const now = Date.now();
    if (lastPageView?.path === pathname && now - lastPageView.at < 500) return;
    lastPageView = { path: pathname, at: now };
    let sourceWasRecorded = sourceRecordedInMemory;
    try { sourceWasRecorded = sessionStorage.getItem("ms-experience-source-recorded") === "1"; } catch { /* Session storage can be unavailable in private browsing. */ }
    trackExperience("page_view", { ...(sourceWasRecorded ? {} : landingSource()) }, pathname);
    if (!initialLoadRecorded) {
      initialLoadRecorded = true;
      const recordLoadTime = () => {
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        if (nav?.loadEventEnd) trackExperience("page_load", { loadMs: Math.round(nav.loadEventEnd) }, pathname);
      };
      if (document.readyState === "complete") recordLoadTime();
      else window.addEventListener("load", recordLoadTime, { once: true });
    }
    if (!sourceWasRecorded) {
      sourceRecordedInMemory = true;
      try { sessionStorage.setItem("ms-experience-source-recorded", "1"); } catch { /* Keep tracking without landing attribution. */ }
    }
    let activeMs = 0;
    let activeSince = document.visibilityState === "visible" ? Date.now() : null;
    let exitRecorded = false;
    const updateVisibility = () => {
      if (document.visibilityState === "hidden" && activeSince !== null) {
        activeMs += Date.now() - activeSince;
        activeSince = null;
      } else if (document.visibilityState === "visible" && activeSince === null) {
        activeSince = Date.now();
      }
    };
    const recordExit = () => {
      if (exitRecorded) return;
      exitRecorded = true;
      if (activeSince !== null) { activeMs += Date.now() - activeSince; activeSince = null; }
      const durationMs = Math.round(activeMs);
      if (durationMs >= 1_000) sendExitEvent({ durationMs }, pathname);
    };
    document.addEventListener("visibilitychange", updateVisibility);
    window.addEventListener("pagehide", recordExit);
    return () => {
      recordExit();
      document.removeEventListener("visibilitychange", updateVisibility);
      window.removeEventListener("pagehide", recordExit);
    };
  }, [pathname, isAdministrator]);

  useEffect(() => {
    function onError() { trackExperience("client_error", { errorType: "script_error" }); }
    function onRejection() { trackExperience("client_error", { errorType: "unhandled_rejection" }); }
    function onClick(event: MouseEvent) {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      try {
        const destination = new URL(anchor.href, window.location.href);
        if (destination.origin !== window.location.origin) {
          trackExperience("outbound_click", { destinationHost: destination.hostname.slice(0, 253) });
        }
      } catch { /* Ignore malformed links. */ }
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("click", onClick);
    };
  }, []);

  return null;
}
