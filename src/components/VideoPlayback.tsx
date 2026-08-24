"use client";

import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";

export function VideoPlayback({ src, className = "" }: { src: string; className?: string }) {
  const [status, setStatus] = useState<"loading" | "buffering" | "ready" | "error">("loading");
  const muxPlaybackId = src.startsWith("mux:") ? src.slice("mux:".length) : null;

  return <div className={`relative h-full w-full overflow-hidden bg-slate-950 ${className}`}>
    {muxPlaybackId ? <MuxPlayer
      playbackId={muxPlaybackId}
      streamType="on-demand"
      autoPlay
      accentColor="#4f46e5"
      className="h-full w-full object-contain"
      onCanPlay={() => setStatus("ready")}
      onPlaying={() => setStatus("ready")}
      onWaiting={() => setStatus("buffering")}
      onError={() => setStatus("error")}
    /> : <video
      src={src}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className="h-full w-full object-contain"
      onCanPlay={() => setStatus("ready")}
      onPlaying={() => setStatus("ready")}
      onWaiting={() => setStatus("buffering")}
      onStalled={() => setStatus("buffering")}
      onError={() => setStatus("error")}
    />}
    {status !== "ready" && <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3"><span className="rounded-full bg-slate-950/80 px-3 py-1.5 text-sm font-semibold text-white">{status === "error" ? "This video could not be played." : status === "buffering" ? "Buffering video…" : "Loading video…"}</span></div>}
  </div>;
}
