"use client";

import { useEffect, useRef, useState } from "react";

export function VideoThumbnail({ src, title }: { src: string; title: string }) {
  const muxPlaybackId = src.startsWith("mux:") ? src.slice("mux:".length) : null;
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const previewVideo = useRef<HTMLVideoElement>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heldToPreview = useRef(false);

  useEffect(() => {
    if (muxPlaybackId) return;
    const target = container.current;
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "300px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!nearViewport) return;
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.muted = true;
    video.preload = "metadata";
    video.src = src;
    const captureFrame = () => {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width || !canvas.height) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      setThumbnail(canvas.toDataURL("image/jpeg", 0.8));
    };
    const seekToFrame = () => { video.currentTime = Math.min(0.5, Number.isFinite(video.duration) ? video.duration / 2 : 0.5); };
    video.addEventListener("loadedmetadata", seekToFrame);
    video.addEventListener("seeked", captureFrame);
    video.load();
    return () => {
      video.removeEventListener("loadedmetadata", seekToFrame);
      video.removeEventListener("seeked", captureFrame);
      video.src = "";
    };
  }, [nearViewport, src, muxPlaybackId]);

  useEffect(() => {
    const video = previewVideo.current;
    if (!video) return;
    if (previewing) {
      void video.play().catch(() => setPreviewing(false));
      return;
    }
    video.pause();
    video.currentTime = 0;
  }, [previewing]);

  useEffect(() => () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
  }, []);

  const stopPreview = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
    setPreviewing(false);
  };

  if (muxPlaybackId) return <div ref={container} className="h-full w-full"><img src={`https://image.mux.com/${muxPlaybackId}/thumbnail.jpg?time=0.5&width=640&fit_mode=preserve`} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /></div>;

  return <div ref={container} className="h-full w-full" onPointerEnter={(event) => {
    if (event.pointerType === "mouse") setPreviewing(true);
  }} onPointerLeave={stopPreview} onPointerDown={(event) => {
    if (event.pointerType !== "touch") return;
    heldToPreview.current = false;
    holdTimer.current = setTimeout(() => {
      heldToPreview.current = true;
      setPreviewing(true);
    }, 450);
  }} onPointerUp={(event) => {
    const wasPreviewing = heldToPreview.current;
    heldToPreview.current = false;
    stopPreview();
    if (wasPreviewing) event.preventDefault();
  }} onPointerCancel={stopPreview}>
    {previewing ? <video ref={previewVideo} src={src} poster={thumbnail ?? undefined} muted playsInline preload="metadata" className="h-full w-full object-cover" onEnded={() => {
      const video = previewVideo.current;
      if (video) video.currentTime = 0;
    }} /> : thumbnail ? <img src={thumbnail} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-700 to-slate-950 text-sm font-bold text-white">{nearViewport ? "Loading video preview" : "Video"}</div>}
  </div>;
}
