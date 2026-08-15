"use client";

import { useEffect, useState } from "react";
import type { Album } from "@/lib/database";
import type { MediaItem } from "@/lib/media";

export function AlbumPicker({ item, onSaved }: { item: MediaItem; onSaved: (albumIds: string[], albumName: string) => void }) {
  const [open, setOpen] = useState(false);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [chosen, setChosen] = useState<string[]>(item.albumIds ?? []);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/albums")
      .then((response) => response.json())
      .then((data: { albums?: Album[] }) => setAlbums(data.albums ?? []))
      .catch(() => setMessage("Could not load albums."));
  }, [open]);

  function toggle(albumId: string) {
    setChosen((current) => current.includes(albumId) ? current.filter((id) => id !== albumId) : [...current, albumId]);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: item.id, albumIds: chosen }) });
    const data = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setMessage(data.error ?? "Could not save the album selection.");
      return;
    }
    onSaved(chosen, albums.find((album) => album.id === chosen[0])?.name ?? "Uploads");
    setOpen(false);
  }

  return <div className="relative">
    <button onClick={() => setOpen((current) => !current)} className="rounded-lg px-3 py-2 text-indigo-700 hover:bg-indigo-50">Organize</button>
    {open && <div className="absolute bottom-12 right-0 z-10 w-72 rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
      <p className="text-sm font-bold text-slate-900">Add to albums</p>
      <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
        {albums.length === 0 && <p className="text-sm text-slate-500">Create an album first.</p>}
        {albums.map((album) => <label key={album.id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={chosen.includes(album.id)} onChange={() => toggle(album.id)} />{album.name}</label>)}
      </div>
      {message && <p className="mt-3 text-sm text-rose-600">{message}</p>}
      <div className="mt-4 flex justify-end gap-2"><button onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">Cancel</button><button onClick={save} disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button></div>
    </div>}
  </div>;
}
