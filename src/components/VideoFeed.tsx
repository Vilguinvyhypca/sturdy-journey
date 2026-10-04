"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import MuxPlayer, { type MuxPlayerRefAttributes } from "@mux/mux-player-react";
import { muxPlaybackIdFromUrl, type MediaItem } from "@/lib/media";
import { trackExperience } from "./ExperienceTracker";

function FeedVideo({ item, active, muted, onToggleMuted }: { item: MediaItem; active: boolean; muted: boolean; onToggleMuted: () => void }) {
  const muxPlayer = useRef<MuxPlayerRefAttributes | null>(null);
  const nativePlayer = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const muxPlaybackId = muxPlaybackIdFromUrl(item.url);
  const muxThumbnail = muxPlaybackId ? item.muxTokens?.thumbnail ? `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?token=${encodeURIComponent(item.muxTokens.thumbnail)}` : `https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=0.5&width=720&fit_mode=preserve` : null;
  const startPlayback = useCallback(() => {
    const player = muxPlayer.current ?? nativePlayer.current;
    if (!active || !player) return;
    player.muted = muted;
    player.play().catch(() => undefined);
  }, [active, muted]);

  useEffect(() => {
    const player = muxPlayer.current ?? nativePlayer.current;
    if (player) player.muted = muted;

    if (!active) {
      player?.pause();
      return;
    }

    startPlayback();
  }, [active, muted, startPlayback]);

  function togglePlayback() {
    const player = muxPlayer.current ?? nativePlayer.current;
    if (!player) return;
    if (player.paused) player.play().catch(() => undefined);
    else player.pause();
  }

  return <div className="relative h-full w-full overflow-hidden bg-black" onClick={togglePlayback}>
    {active ? muxPlaybackId ? <MuxPlayer
      ref={muxPlayer}
      playbackId={muxPlaybackId}
      tokens={item.muxTokens}
      streamType="on-demand"
      autoPlay
      muted={muted}
      loop
      playsInline
      preload="auto"
      nohotkeys
      className="h-full w-full object-contain"
      style={{ "--controls": "none", "--media-object-fit": "contain" }}
      metadataVideoId={item.id}
      metadataVideoTitle={item.title}
      onCanPlay={() => { setStatus("ready"); startPlayback(); }}
      onPlaying={() => { setPlaying(true); setStatus("ready"); trackExperience("video_start", { mediaType: "video", mediaId: item.id }); }}
      onPause={() => setPlaying(false)}
      onError={() => { setStatus("error"); trackExperience("video_error", { mediaType: "video", mediaId: item.id, errorType: "feed_playback_error" }); }}
    /> : <video
      key="active-video"
      ref={nativePlayer}
      src={item.url}
      autoPlay
      muted={muted}
      loop
      playsInline
      preload="auto"
      className="h-full w-full object-contain"
      onCanPlay={() => { setStatus("ready"); startPlayback(); }}
      onPlaying={() => { setPlaying(true); setStatus("ready"); trackExperience("video_start", { mediaType: "video", mediaId: item.id }); }}
      onPause={() => setPlaying(false)}
      onError={() => { setStatus("error"); trackExperience("video_error", { mediaType: "video", mediaId: item.id, errorType: "feed_playback_error" }); }}
    /> : muxPlaybackId ? <div role="img" aria-label={`${item.title} video preview`} className="h-full w-full bg-contain bg-center bg-no-repeat" style={{ backgroundImage: `url("${muxThumbnail}")` }} /> : <video key="video-preview" src={item.url} muted playsInline preload="metadata" className="h-full w-full object-contain" />}

    {active && status === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="h-9 w-9 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-label="Loading video" /></div>}
    {active && status === "error" && <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center text-sm font-bold text-white">This video could not be played.</div>}
    {active && !playing && status === "ready" && <div className="pointer-events-none absolute inset-0 grid place-items-center"><span className="grid h-16 w-16 place-items-center rounded-full bg-black/45 pl-1 text-3xl text-white backdrop-blur" aria-hidden="true">▶</span></div>}

    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between bg-gradient-to-b from-black/75 to-transparent px-4 pb-16 pt-4 text-white" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
      <Link href="/" onClick={(event) => event.stopPropagation()} className="pointer-events-auto rounded-full bg-black/35 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-black/60">← Gallery</Link>
      <span className="rounded-full bg-black/35 px-3 py-2 text-xs font-bold uppercase tracking-[.16em] backdrop-blur">Video feed</span>
    </div>

    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-4 pb-5 pt-28 text-white" style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-black leading-tight sm:text-2xl">{item.title}</h1>
          {item.description && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-6 text-white/85">{item.description}</p>}
          <Link href={`/videos/${encodeURIComponent(item.id)}`} onClick={(event) => event.stopPropagation()} className="pointer-events-auto mt-3 inline-block text-sm font-bold text-white underline decoration-white/50 underline-offset-4 hover:decoration-white">Open video page</Link>
        </div>
        <button type="button" onClick={(event) => { event.stopPropagation(); onToggleMuted(); }} className="pointer-events-auto shrink-0 rounded-full bg-black/45 px-4 py-3 text-sm font-bold backdrop-blur hover:bg-black/70" aria-label={muted ? "Turn sound on" : "Mute video"}>{muted ? "Sound on" : "Mute"}</button>
      </div>
    </div>
  </div>;
}

export function VideoFeed() {
  const [videos, setVideos] = useState<MediaItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const feedItems = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    fetch("/api/media")
      .then(async (response) => {
        if (!response.ok) throw new Error("The video feed could not be loaded.");
        return response.json() as Promise<{ media?: MediaItem[] }>;
      })
      .then((data) => setVideos((data.media ?? []).filter((item) => item.type === "video")))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "The video feed could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (videos.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((first, second) => second.intersectionRatio - first.intersectionRatio)[0];
      if (!visible) return;
      const index = Number((visible.target as HTMLElement).dataset.feedIndex);
      if (Number.isInteger(index)) setActiveIndex(index);
    }, { threshold: [0.6, 0.8] });
    feedItems.current.forEach((item) => { if (item) observer.observe(item); });
    return () => observer.disconnect();
  }, [videos]);

  if (loading) return <main className="grid min-h-[100dvh] place-items-center bg-black text-white"><div className="text-center"><span className="mx-auto block h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" /><p className="mt-4 text-sm font-bold">Loading video feed…</p></div></main>;
  if (error) return <main className="grid min-h-[100dvh] place-items-center bg-black p-6 text-center text-white"><div><p className="font-bold">{error}</p><Link href="/" className="mt-5 inline-block rounded-full bg-white px-5 py-3 text-sm font-bold text-black">Return to gallery</Link></div></main>;
  if (videos.length === 0) return <main className="grid min-h-[100dvh] place-items-center bg-black p-6 text-center text-white"><div><h1 className="text-2xl font-black">No videos yet</h1><p className="mt-2 text-white/70">Upload a video to begin the feed.</p><Link href="/" className="mt-5 inline-block rounded-full bg-white px-5 py-3 text-sm font-bold text-black">Return to gallery</Link></div></main>;

  return <main className="h-[100dvh] snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black" aria-label="Video feed">
    {videos.map((video, index) => <article key={video.id} ref={(element) => { feedItems.current[index] = element; }} data-feed-index={index} className="h-[100dvh] snap-start snap-always" aria-label={`${video.title}, video ${index + 1} of ${videos.length}`}>
      <div className="mx-auto h-full w-full max-w-[56.25dvh] bg-slate-950 shadow-2xl">
        <FeedVideo item={video} active={index === activeIndex} muted={muted} onToggleMuted={() => setMuted((value) => !value)} />
      </div>
    </article>)}
  </main>;
}
