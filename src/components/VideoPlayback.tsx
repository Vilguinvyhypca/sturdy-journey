"use client";

import { useRef, useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { muxPlaybackIdFromUrl, type MuxPlaybackTokens } from "@/lib/media";
import { trackExperience } from "./ExperienceTracker";

export function VideoPlayback({ src, mediaId, muxTokens, className = "" }: { src: string; mediaId: string; muxTokens?: MuxPlaybackTokens; className?: string }) {
  const [status, setStatus] = useState<"loading" | "buffering" | "ready" | "error">("loading");
  const started = useRef(false);
  const failed = useRef(false);
  const muxPlaybackId = muxPlaybackIdFromUrl(src);
  function playing() {
    setStatus("ready");
    if (!started.current) { started.current = true; trackExperience("video_start", { mediaType: "video", mediaId }); }
  }
  function playbackError() {
    setStatus("error");
    if (!failed.current) { failed.current = true; trackExperience("video_error", { mediaType: "video", mediaId, errorType: "playback_error" }); }
  }
  function playbackComplete() { trackExperience("video_complete", { mediaType: "video", mediaId }); }

  return <div className={`relative h-full w-full overflow-hidden bg-slate-950 ${className}`}>
    {muxPlaybackId ? <MuxPlayer
      playbackId={muxPlaybackId}
      tokens={muxTokens}
      streamType="on-demand"
      autoPlay
      accentColor="#4f46e5"
      className="h-full w-full object-contain"
      onCanPlay={() => setStatus("ready")}
      onPlaying={playing}
      onWaiting={() => setStatus("buffering")}
      onError={playbackError}
      onEnded={playbackComplete}
    /> : <video
      src={src}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className="h-full w-full object-contain"
      onCanPlay={() => setStatus("ready")}
      onPlaying={playing}
      onWaiting={() => setStatus("buffering")}
      onStalled={() => setStatus("buffering")}
      onError={playbackError}
      onEnded={playbackComplete}
    />}
    {status !== "ready" && <div aria-live="polite" className="pointer-events-none absolute inset-x-0 top-0 flex justify-center p-3"><span className="rounded-full bg-slate-950/80 px-3 py-1.5 text-sm font-semibold text-white">{status === "error" ? "This video could not be played." : status === "buffering" ? "Buffering video…" : "Loading video…"}</span></div>}
  </div>;
}
