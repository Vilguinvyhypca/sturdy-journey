"use client";

import { useEffect } from "react";

export function OfflineSupport() {
  useEffect(() => {
    const showFailure = () => {
      window.location.replace(`/offline.html?returnTo=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`);
    };
    // React boundaries handle render failures; these catch uncaught async/event errors.
    const onError = (event: ErrorEvent) => { if (event.error || event.message) showFailure(); };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", showFailure);
    const cleanupErrors = () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", showFailure);
    };
    if (!("serviceWorker" in navigator)) return cleanupErrors;

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
      cleanupErrors();
      window.removeEventListener("offline", showOffline);
      navigator.serviceWorker.removeEventListener("controllerchange", showOffline);
    };
  }, []);

  return null;
}
