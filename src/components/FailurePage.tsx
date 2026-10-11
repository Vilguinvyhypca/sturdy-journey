"use client";

import { useEffect, useRef } from "react";

// Self-contained: also renders when the root layout and its styles fail.
export function FailurePage({ missing = false }: { missing?: boolean }) {
  const retry = useRef<HTMLAnchorElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    document.title = `${missing ? "Page not found" : "A little pause"} · Hymecymeyseh`;
    if (retry.current && !missing) retry.current.href = window.location.href;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      void video.current?.play().catch(() => { /* Native controls remain available. */ });
    }
  }, [missing]);

  return (
    <main style={{ position: "fixed", inset: 0, zIndex: 10000, boxSizing: "border-box", overflowY: "auto", background: "#0c0c12", color: "#f6f3ff", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: "28px 20px" }}>
      <title>{missing ? "Page not found" : "A little pause"} · Hymecymeyseh</title>
      <meta name="robots" content="noindex" />
      <style>{`@font-face { font-family: FailureMonofett; src: url('/fonts/monofett.ttf') format('truetype'); font-display: swap; } .failure-link:focus-visible { outline:3px solid white; outline-offset:5px; }`}</style>
      <div style={{ maxWidth: 440, margin: "auto" }}>
        <div style={{ fontFamily: "FailureMonofett, monospace", fontSize: "clamp(28px, 8vw, 40px)", background: "linear-gradient(90deg,#ff3b30,#ff9500,#ffcc00,#34c759,#00c7be,#007aff,#af52de,#ff2d55)", backgroundClip: "text", color: "transparent" }}>Hymecymeyseh</div>
        <h1 style={{ fontSize: 36, margin: "16px 0 8px" }}>{missing ? "Page not found." : "A little pause."}</h1>
        <p style={{ color: "#b8afcc", lineHeight: 1.6 }}>{missing ? "We couldn’t find that page. Head home to keep exploring." : "Something interrupted the app. Enjoy this while we get you back."}</p>
        <video ref={video} className="failure-video" src="/offline-video.mp4" controls muted loop playsInline aria-label="Video to watch while the app is unavailable" style={{ display: "block", maxWidth: "100%", height: "min(52svh, 460px)", margin: "0 auto 24px", borderRadius: 18, background: "#18151e" }} />
        {/* A full document load recovers from broken client navigation and runtime state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a ref={retry} className="failure-link" href="/" style={{ display: "inline-block", padding: "13px 28px", background: "#d2c0ff", color: "#201333", borderRadius: 999, textDecoration: "none", fontWeight: 650 }}>{missing ? "Go home" : "Try again"}</a>
      </div>
    </main>
  );
}
