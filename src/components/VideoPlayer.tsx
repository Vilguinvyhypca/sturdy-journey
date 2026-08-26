"use client";

import { useEffect } from "react";
import Link from "next/link";
import type { MediaItem } from "@/lib/media";
import { AlbumPicker } from "./AlbumPicker";
import { MediaDetails } from "./MediaDetails";
import { MediaEditor } from "./MediaEditor";
import { ShareMediaButton } from "./ShareMediaButton";
import { VideoPlayback } from "./VideoPlayback";

export function VideoPlayer({ item, onClose, onDelete, onOrganize, onUpdate }: { item: MediaItem; onClose: () => void; onDelete?: () => void; onOrganize?: (albumIds: string[], albumName: string) => void; onUpdate?: (item: MediaItem) => void }) {
  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black" role="dialog" aria-modal="true" aria-label={`Video viewer: ${item.title}`} onClick={onClose}>
    <div className="relative h-[100dvh] w-full max-w-[56.25dvh] overflow-hidden bg-slate-950 shadow-2xl" onClick={(event) => event.stopPropagation()}>
      <VideoPlayback src={item.url} />
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/75 to-transparent px-4 pb-14 pt-[max(1rem,env(safe-area-inset-top))] text-white">
        <div className="flex items-center justify-between gap-3"><p className="min-w-0 truncate font-bold">{item.title}</p><button type="button" onClick={onClose} className="pointer-events-auto shrink-0 rounded-full bg-black/45 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-black/65" aria-label="Close video viewer">Close</button></div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-20 text-white">
        <MediaDetails item={item} className="px-0 pt-0 text-white/80" />
        <div className="mt-3 flex flex-wrap justify-end gap-2"><Link href={`/videos/${encodeURIComponent(item.id)}`} className="rounded-lg bg-white/10 px-3 py-2 text-white hover:bg-white/20">Open page</Link><ShareMediaButton mediaId={item.id} href={`/videos/${encodeURIComponent(item.id)}`} />{onUpdate && <MediaEditor item={item} onSaved={onUpdate} />}{onOrganize && <AlbumPicker item={item} onSaved={onOrganize} />}{onDelete && <button onClick={onDelete} className="rounded-lg bg-white/10 px-3 py-2 text-rose-200 hover:bg-white/20">Delete</button>}</div>
      </div>
    </div>
  </div>;
}
