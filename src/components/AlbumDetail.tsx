"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Album } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { MediaCard } from "./MediaCard";
import { PhotoViewer } from "./PhotoViewer";
import { VideoPlayer } from "./VideoPlayer";

export function AlbumDetail({ id }: { id: string }) {
  const [album, setAlbum] = useState<Album | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [message, setMessage] = useState("Loading album...");

  useEffect(() => {
    fetch(`/api/albums/${id}`)
      .then(async (response) => ({ response, data: await response.json() as { album?: Album; media?: MediaItem[]; error?: string } }))
      .then(({ response, data }) => {
        if (!response.ok || !data.album) setMessage(data.error ?? "Could not load this album.");
        else { setAlbum(data.album); setMedia(data.media ?? []); setMessage(""); }
      })
      .catch(() => setMessage("Could not load this album."));
  }, [id]);

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
    <div className="flex items-center justify-between gap-4"><Link href="/albums" className="text-sm font-bold text-indigo-600 hover:underline">← All albums</Link><Link href="/" className="text-sm font-bold text-indigo-600 hover:underline">MediaSpace</Link></div>
    {album && <><p className="mt-7 text-sm font-bold uppercase tracking-[.2em] text-indigo-600">Album</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">{album.name}</h1>{album.description && <p className="mt-2 text-slate-500">{album.description}</p>}</>}
    {message && <p className="mt-8 rounded-xl border border-slate-200 p-5 text-slate-500">{message}</p>}
    {album && media.length === 0 && <p className="mt-8 rounded-xl border border-dashed border-slate-300 p-5 text-slate-500">This album is empty. Sign in, open a photo or video, and choose Organize to add it here.</p>}
    <section className="mt-8 grid grid-cols-3 gap-0">{media.map((item) => <MediaCard key={item.id} item={item} onSelect={setSelected} />)}</section>
    {selected?.type === "photo" && <PhotoViewer item={selected} onClose={() => setSelected(null)} />}
    {selected?.type === "video" && <VideoPlayer item={selected} onClose={() => setSelected(null)} />}
  </main>;
}
