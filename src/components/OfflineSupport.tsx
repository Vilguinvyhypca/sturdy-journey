"use client";

import { useEffect } from "react";

export function OfflineSupport() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const showOffline = () => {
      if (!navigator.onLine && navigator.serviceWorker.controller) {
        window.location.replace(`/offline.html?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
      }
    };
    navigator.serviceWorker.register("/offline-sw.js", { updateViaCache: "none" })
      .then(showOffline)
      .catch(() => { /* Offline support is optional when registration is unavailable. */ });
    window.addEventListener("offline", showOffline);
    navigator.serviceWorker.addEventListener("controllerchange", showOffline);
    return () => {
      window.removeEventListener("offline", showOffline);
      navigator.serviceWorker.removeEventListener("controllerchange", showOffline);
    };
  }, []);

  return null;
}
