"use client";

import { useEffect, useState } from "react";

export function VideoThumbnail({ src, title }: { src: string; title: string }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null);

  useEffect(() => {
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
  }, [src]);

  if (thumbnail) return <img src={thumbnail} alt={title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />;
  return <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-700 to-slate-950 text-sm font-bold text-white">Loading video preview</div>;
}
