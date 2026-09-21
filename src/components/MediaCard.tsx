"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { MediaItem } from "@/lib/media";
import { VideoThumbnail } from "./VideoThumbnail";

export function MediaCard({ item, onSelect, selectionMode = false, isSelected = false, onToggleSelection }: { item: MediaItem; onSelect: (item: MediaItem) => void; selectionMode?: boolean; isSelected?: boolean; onToggleSelection?: (item: MediaItem) => void }) {
  const [photoLoaded, setPhotoLoaded] = useState(item.type === "video");
  const href = `/${item.type === "photo" ? "photos" : "videos"}/${encodeURIComponent(item.id)}`;
  return <Link href={href} aria-label={selectionMode ? `${isSelected ? "Deselect" : "Select"} uploaded ${item.type}` : `Open ${item.title}`} aria-pressed={selectionMode ? isSelected : undefined} onClick={(event) => {
    if (event.defaultPrevented) return;
    if (selectionMode) { event.preventDefault(); onToggleSelection?.(item); return; }
    if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      onSelect(item);
    }
  }} className={`group relative aspect-square overflow-hidden bg-slate-200 text-left ${selectionMode ? "cursor-pointer" : ""}`}>
    <span className="sr-only">{item.title}</span>
    <div className="relative h-full w-full overflow-hidden">
      {item.type === "photo" && !photoLoaded && <span aria-hidden="true" className="absolute inset-0 animate-pulse bg-slate-200" />}
      {item.type === "video" ? <VideoThumbnail src={item.url} title={item.title} muxTokens={item.muxTokens} /> : <Image src={item.url} alt={item.title} fill sizes="(max-width: 640px) 33vw, 400px" quality={70} unoptimized={item.url.startsWith("/api/private-media?") || item.url.startsWith("/api/local-media?")} onLoad={() => setPhotoLoaded(true)} onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.retried) return;
        image.dataset.retried = "true";
        image.src = `${item.url}${item.url.includes("?") ? "&" : "?"}retry=${Date.now()}`;
      }} className={`h-full w-full object-cover transition duration-500 group-hover:scale-105 ${photoLoaded ? "opacity-100" : "opacity-0"}`} />}
      {item.type === "video" && <span className="absolute right-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-xs font-bold text-white">▶</span>}
      {item.visibility && item.visibility !== "public" && <span className="absolute bottom-2 left-2 rounded-full bg-slate-950/75 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">{item.visibility}</span>}
      {selectionMode && <span aria-hidden="true" className={`absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full border-2 text-sm font-black ${isSelected ? "border-indigo-600 bg-indigo-600 text-white" : "border-white bg-slate-950/50 text-transparent"}`}>✓</span>}
    </div>
  </Link>;
}
