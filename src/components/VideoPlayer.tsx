"use client";

import { useEffect } from "react";
import type { MediaItem } from "@/lib/media";
import { AlbumPicker } from "./AlbumPicker";
import { MediaDetails } from "./MediaDetails";
import { ShareMediaButton } from "./ShareMediaButton";
import { VideoPlayback } from "./VideoPlayback";

export function VideoPlayer({ item, onClose, onDelete, onOrganize }: { item: MediaItem; onClose: () => void; onDelete?: () => void; onOrganize?: (albumIds: string[], albumName: string) => void }) {
  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/90 p-3 sm:p-5" role="dialog" aria-modal="true" aria-label={`Video viewer: ${item.title}`} onClick={onClose}>
    <div className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center justify-between gap-4 bg-slate-950 px-4 py-3 text-white"><p className="min-w-0 truncate font-bold">{item.title}</p><button type="button" onClick={onClose} className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-bold text-white hover:bg-white/15" aria-label="Close video viewer">Close</button></div>
      <VideoPlayback src={item.url} />
      <MediaDetails item={item} />
      <div className="flex flex-wrap justify-end gap-2 p-4"><ShareMediaButton mediaId={item.id} />{onOrganize && <AlbumPicker item={item} onSaved={onOrganize} />}{onDelete && <button onClick={onDelete} className="rounded-lg px-3 py-2 text-rose-600 hover:bg-rose-50">Delete</button>}</div>
    </div>
  </div>;
}
