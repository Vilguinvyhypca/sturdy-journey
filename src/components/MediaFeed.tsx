"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
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
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const visible = items.filter((item) => filter === "all" || item.type === filter);

  useEffect(() => {
    fetch("/api/media")
      .then((response) => response.json())
      .then((data: { media: MediaItem[] }) => setItems(data.media))
      .catch(() => undefined)
      .finally(() => setLoading(false));
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

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-indigo-600">Personal library</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">MediaSpace</h1><p className="mt-2 text-slate-500">All your photos and videos, in one calm place.</p></div><div className="flex items-center gap-3"><AuthControls />{session && <UploadButton onSelect={addMedia} />}</div></header>
    <section className="mt-7 flex flex-wrap gap-2">{(["all", "photo", "video"] as const).map((type) => <button key={type} onClick={() => setFilter(type)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${filter === type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{type === "all" ? "Everything" : `${type}s`}</button>)}</section>
    {uploadError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{uploadError}</p>}
    <section className="mt-7 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"><div className="rounded-2xl border border-dashed border-indigo-300 bg-indigo-50 p-5 text-indigo-950"><p className="text-lg font-bold">Create an album</p><p className="mt-1 text-sm text-indigo-800">Group a moment, trip, or project.</p><button className="mt-4 text-sm font-bold text-indigo-700">New album</button></div>{loading ? <div className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-500">Loading media...</div> : visible.map((item) => <MediaCard key={item.id} item={item} onSelect={setSelected} />)}</section>
    {selected?.type === "photo" && <PhotoViewer item={selected} onClose={() => setSelected(null)} />}{selected?.type === "video" && <VideoPlayer item={selected} onClose={() => setSelected(null)} />}
  </main>;
}
