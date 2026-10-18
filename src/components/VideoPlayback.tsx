"use client";

import { useRef, useState } from "react";
import MuxPlayer, { type MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { muxPlaybackIdFromUrl, type MuxPlaybackTokens } from "@/lib/media";
import { trackExperience } from "./ExperienceTracker";

export function VideoPlayback({ src, mediaId, muxTokens, startMuted = true, className = "" }: { src: string; mediaId: string; muxTokens?: MuxPlaybackTokens; startMuted?: boolean; className?: string }) {
  const [status, setStatus] = useState<"loading" | "buffering" | "ready" | "error">("loading");
  const nativePlayer = useRef<HTMLVideoElement>(null);
  const muxPlayer = useRef<MuxPlayerRefAttributes>(null);
  const attempted = useRef(false);
  const [blocked, setBlocked] = useState(false);
  const started = useRef(false);
  const failed = useRef(false);
  const muxPlaybackId = muxPlaybackIdFromUrl(src);
  const localVideo = src.startsWith("/api/local-media?") || src.startsWith("/api/local-playback?");
  const poster = localVideo ? `/api/local-thumbnail?id=${encodeURIComponent(mediaId)}` : undefined;

  async function startPlayback() {
    const player = muxPlayer.current ?? nativePlayer.current;
    if (!player) return;
    try {
      await player.play();
      setBlocked(false);
    } catch (error) {
      // A browser policy is not a broken video. Leave an explicit way to start it.
      if (error instanceof Error && error.name === "NotAllowedError") setBlocked(true);
    }
  }
  function canPlay() {
    if (!attempted.current) {
      attempted.current = true;
      void startPlayback();
    }
  }
  function playing() {
    setBlocked(false);
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
      ref={muxPlayer}
      preload="auto"
      playbackId={muxPlaybackId}
      tokens={muxTokens}
      streamType="on-demand"
      autoPlay
      muted={startMuted}
      playsInline
      accentColor="#4f46e5"
      className="h-full w-full object-contain"
      onCanPlay={canPlay}
      onPlaying={playing}
      onWaiting={() => setStatus("buffering")}
      onError={playbackError}
      onEnded={playbackComplete}
    /> : <video
      ref={nativePlayer}
      poster={poster}
      src={src}
      controls
      autoPlay
      muted={startMuted}
      playsInline
      preload="auto"
      className="h-full w-full object-contain"
      onCanPlay={canPlay}
      onPlaying={playing}
      onWaiting={() => setStatus("buffering")}
      onStalled={() => setStatus("buffering")}
      onError={playbackError}
      onEnded={playbackComplete}
    />}
    {blocked && <div className="absolute inset-0 grid place-items-center"><button type="button" onClick={() => void startPlayback()} className="rounded-full bg-black/75 px-6 py-4 text-lg font-bold text-white" aria-label="Play video">▶ Play video</button></div>}
    {!blocked && status !== "ready" && <div role="status" aria-live="polite" className="pointer-events-none absolute inset-0 grid place-items-center p-3"><span className="flex max-w-full flex-col items-center gap-3 px-4 py-5 text-sm font-semibold text-white">{status !== "error" && <span aria-hidden="true" className="brand-wordmark video-loading-wordmark">Hymecymeyseh</span>}{status === "error" ? "This video could not be played." : status === "buffering" ? "Buffering video…" : "Loading video…"}</span></div>}
  </div>;
}
