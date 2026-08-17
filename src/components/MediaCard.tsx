"use client";

import { useState } from "react";
import Image from "next/image";
import type { MediaItem } from "@/lib/media";
import { VideoThumbnail } from "./VideoThumbnail";

export function MediaCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  const [photoLoaded, setPhotoLoaded] = useState(item.type === "video");
  return <button aria-label={`Open uploaded ${item.type}`} onClick={(event) => {
    if (event.defaultPrevented) return;
    onSelect(item);
  }} className="group aspect-square overflow-hidden bg-slate-200 text-left">
    <div className="relative h-full w-full overflow-hidden">
      {item.type === "photo" && !photoLoaded && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-200" />}
      {item.type === "video" ? <VideoThumbnail src={item.url} title="Uploaded video" /> : <Image src={item.url} alt="" fill sizes="(max-width: 640px) 33vw, 400px" quality={70} onLoad={() => setPhotoLoaded(true)} onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.retried) return;
        image.dataset.retried = "true";
        image.src = `${item.url}${item.url.includes("?") ? "&" : "?"}retry=${Date.now()}`;
      }} className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${photoLoaded ? "opacity-100" : "opacity-0"}`} />}
      {item.type === "video" && <span className="absolute right-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-xs font-bold text-white">▶</span>}
    </div>
  </button>;
}
