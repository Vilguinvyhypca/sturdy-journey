"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Album } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { AuthControls } from "./AuthControls";
import { MediaCard } from "./MediaCard";
import { PhotoViewer } from "./PhotoViewer";
import { UploadButton } from "./UploadButton";
import { VideoPlayer } from "./VideoPlayer";

export function MediaFeed() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumFilter, setAlbumFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const visible = items.filter((item) => (filter === "all" || item.type === filter) && (!albumFilter || item.albumIds?.includes(albumFilter)));

  useEffect(() => {
    fetch("/api/media")
      .then((response) => response.json())
      .then((data: { media: MediaItem[] }) => setItems(data.media))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/albums")
      .then((response) => response.json())
      .then((data: { albums?: Album[] }) => setAlbums(data.albums ?? []))
      .catch(() => undefined);
  }, []);

  async function addMedia(file: File) {
    setUploadError("");
    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const data = await response.json() as { media?: MediaItem; error?: string };
    if (!response.ok || !data.media) {
      setUploadError(data.error ?? "Upload failed. Please try again.");
      return;
    }
    setItems((current) => [data.media!, ...current]);
    setFilter("all");
  }
  async function deleteSelectedMedia() {
    if (!selected || !confirm("Delete this media permanently?")) return;
    const response = await fetch(`/api/media?pathname=${encodeURIComponent(selected.id)}`, { method: "DELETE" });
    if (!response.ok) {
      setUploadError("Could not delete this media. Please try again.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== selected.id));
    setSelected(null);
  }
  function updateSelectedAlbums(albumIds: string[], albumName: string) {
    if (!selected) return;
    const updated = { ...selected, albumIds, album: albumName };
    setSelected(updated);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-indigo-600">Personal library</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">MediaSpace</h1><p className="mt-2 text-slate-500">All your photos and videos, in one calm place.</p></div><div className="flex items-center gap-3"><AuthControls />{session && <UploadButton onSelect={addMedia} />}</div></header>
    <section className="mt-7 flex flex-wrap items-center gap-2">{(["all", "photo", "video"] as const).map((type) => <button key={type} onClick={() => setFilter(type)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${filter === type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{type === "all" ? "Everything" : `${type}s`}</button>)}{albums.length > 0 && <select value={albumFilter} onChange={(event) => setAlbumFilter(event.target.value)} className="ml-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50"><option value="">All albums</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select>}</section>
    {uploadError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{uploadError}</p>}
    <section className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-5 text-indigo-950"><p className="text-lg font-bold">Create an album</p><p className="mt-1 text-sm text-indigo-800">Group a moment, trip, or project.</p><Link href="/albums" className="mt-4 inline-block text-sm font-bold text-indigo-700 hover:underline">New album →</Link></div>{loading ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-500">Loading media...</div> : visible.map((item) => <MediaCard key={item.id} item={item} onSelect={setSelected} />)}{!loading && visible.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-slate-500">No media matches this album yet.</p>}</section>
    {selected?.type === "photo" && <PhotoViewer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} />}{selected?.type === "video" && <VideoPlayer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} />}
  </main>;
}
