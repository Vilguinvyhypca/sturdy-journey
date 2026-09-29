"use client";

import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { isAnalyticsRoute, isAnalyticsUrl } from "@/lib/analytics-policy";

const preferenceKey = "mediaspace:analytics-consent:v1";
const preferenceEvent = "mediaspace:analytics-consent";
type SDK = typeof import("@fullstory/browser");
let sdk: SDK | undefined;
let started = false;

function stopCapture() {
  if (sdk?.isInitialized()) sdk.Fullstory("shutdown");
}

function preference() {
  try {
    const value = localStorage.getItem(preferenceKey);
    return value === "accepted" || value === "declined" ? value : null;
  } catch { return null; }
}

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(preferenceEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(preferenceEvent, callback);
  };
}

function choose(value: "accepted" | "declined") {
  stopCapture();
  try { localStorage.setItem(preferenceKey, value); } catch { return; }
  window.dispatchEvent(new Event(preferenceEvent));
}

export function VisitorAnalytics({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const { status } = useSession();
  const wasSignedIn = useRef(false);
  const consent = useSyncExternalStore(subscribe, preference, () => null);
  const orgId = process.env.NEXT_PUBLIC_FULLSTORY_ORG_ID?.trim();
  const configured = process.env.NEXT_PUBLIC_FULLSTORY_ENABLED === "true" && Boolean(orgId);
  const eligible = configured && status === "unauthenticated" && isAnalyticsRoute(pathname);

  useLayoutEffect(() => {
    let cancelled = false;
    stopCapture();
    if (status === "authenticated") wasSignedIn.current = true;
    if (wasSignedIn.current || !eligible || consent !== "accepted" || !orgId || !isAnalyticsUrl(new URL(location.href))) return;

    // Stop before links or browser history can expose a non-public destination.
    const beforeNavigation = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
      if (anchor instanceof HTMLAnchorElement && anchor.target === "_blank") return;
      // Media cards prevent default navigation and open an overlay in this page.
      if (anchor?.hasAttribute("data-media-overlay")) return;
      if (anchor instanceof HTMLAnchorElement && !isAnalyticsUrl(new URL(anchor.href))) stopCapture();
    };
    const onHistory = () => { if (!isAnalyticsUrl(new URL(location.href))) stopCapture(); };
    const stop = () => stopCapture();
    document.addEventListener("click", beforeNavigation, true);
    window.addEventListener("popstate", onHistory);
    window.addEventListener("hashchange", onHistory);
    window.addEventListener("pagehide", stop);

    void import("@fullstory/browser").then((loaded) => {
      if (cancelled || preference() !== "accepted" || !isAnalyticsUrl(new URL(location.href))) return;
      sdk = loaded;
      if (!sdk.isInitialized()) sdk.init({ orgId, startCaptureManually: true });
      sdk.Fullstory("setConfig", { console: false });
      sdk.Fullstory(started ? "restart" : "start");
      started = true;
    }).catch(() => {
      // Analytics failures must never prevent visitors from using the gallery.
    });

    return () => {
      cancelled = true;
      stopCapture();
      document.removeEventListener("click", beforeNavigation, true);
      window.removeEventListener("popstate", onHistory);
      window.removeEventListener("hashchange", onHistory);
      window.removeEventListener("pagehide", stop);
    };
  }, [eligible, consent, orgId, pathname, query, status]);

  return <>
    <div className={`contents ${eligible ? "fs-mask" : "fs-exclude"}`}>{children}</div>
    {eligible && <aside aria-label="Visitor analytics preferences" className="fs-exclude fixed bottom-3 left-3 z-[80] max-w-sm rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-900 shadow-lg">
      {consent === null ? <>
        <p>Allow Fullstory analytics? It uses cookies and records clicks, scrolling, and page interactions to help us improve the gallery. Data is sent to Fullstory.</p>
        <div className="mt-3 flex gap-3">
          <button type="button" onClick={() => choose("accepted")} className="rounded-lg border border-slate-400 px-3 py-2 font-semibold">Allow analytics</button>
          <button type="button" onClick={() => choose("declined")} className="rounded-lg border border-slate-400 px-3 py-2 font-semibold">Decline</button>
        </div>
      </> : <button type="button" onClick={() => choose(consent === "accepted" ? "declined" : "accepted")} className="font-semibold underline">
        {consent === "accepted" ? "Turn off visitor analytics" : "Allow visitor analytics"}
      </button>}
    </aside>}
  </>;
}
