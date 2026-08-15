"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Album } from "@/lib/database";

export function AlbumsManager() {
  const { data: session } = useSession();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Album | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  useEffect(() => {
    fetch("/api/albums")
      .then((response) => response.json())
      .then((data: { albums?: Album[] }) => setAlbums(data.albums ?? []))
      .catch(() => setMessage("Albums are not available yet."))
      .finally(() => setLoading(false));
  }, []);

  async function createAlbum(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const response = await fetch("/api/albums", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    const data = await response.json() as { album?: Album; error?: string };
    if (!response.ok || !data.album) {
      setMessage(data.error ?? "Could not create the album.");
      return;
    }
    setAlbums((current) => [data.album!, ...current]);
    setName("");
    setDescription("");
  }

  function startEditing(album: Album) {
    setEditing(album);
    setEditName(album.name);
    setEditDescription(album.description);
    setMessage("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const response = await fetch(`/api/albums/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: editName, description: editDescription }) });
    const data = await response.json() as { album?: Album; error?: string };
    if (!response.ok || !data.album) { setMessage(data.error ?? "Could not update the album."); return; }
    setAlbums((current) => current.map((album) => album.id === editing.id ? data.album! : album));
    setEditing(null);
  }

  async function removeAlbum(album: Album) {
    if (!confirm(`Delete the album “${album.name}”? Your media files will stay safe.`)) return;
    const response = await fetch(`/api/albums/${album.id}`, { method: "DELETE" });
    if (!response.ok) { setMessage("Could not delete the album."); return; }
    setAlbums((current) => current.filter((currentAlbum) => currentAlbum.id !== album.id));
  }

  return <main className="mx-auto min-h-screen max-w-4xl px-5 py-8 sm:px-8">
    <Link href="/" className="text-sm font-bold uppercase tracking-[.2em] text-indigo-600 hover:underline">MediaSpace</Link>
    <h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">Albums</h1>
    <p className="mt-2 text-slate-500">Group photos and videos by a moment, trip, or project.</p>

    {session && <form onSubmit={createAlbum} className="mt-8 grid gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-5 sm:grid-cols-[1fr_1fr_auto]">
      <input value={name} onChange={(event) => setName(event.target.value)} maxLength={80} required placeholder="Album name" className="rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
      <input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} placeholder="Description (optional)" className="rounded-xl border border-indigo-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-indigo-500" />
      <button className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Create album</button>
    </form>}
    {message && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{message}</p>}

    <section className="mt-8 grid gap-4 sm:grid-cols-2">
      {loading && <p className="text-slate-500">Loading albums...</p>}
      {!loading && albums.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 p-5 text-slate-500">No albums yet. {session ? "Create your first one above." : "Sign in as the administrator to create one."}</p>}
      {albums.map((album) => <article key={album.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><Link href={`/albums/${album.id}`} className="block transition hover:text-indigo-700"><p className="text-lg font-black text-slate-900">{album.name}</p>{album.description && <p className="mt-1 text-sm text-slate-500">{album.description}</p>}<p className="mt-4 text-sm font-semibold text-indigo-600">Open album → · {album.mediaCount} {album.mediaCount === 1 ? "item" : "items"}</p></Link>{session && <div className="mt-4 flex gap-3 border-t border-slate-100 pt-3 text-sm font-bold"><button onClick={() => startEditing(album)} className="text-indigo-700 hover:underline">Edit</button><button onClick={() => removeAlbum(album)} className="text-rose-600 hover:underline">Delete</button></div>}</article>)}
    </section>
    {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-5"><form onSubmit={saveEdit} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-black">Edit album</h2><label className="mt-5 block text-sm font-bold text-slate-700">Name<input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={80} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500" /></label><label className="mt-4 block text-sm font-bold text-slate-700">Description<input value={editDescription} onChange={(event) => setEditDescription(event.target.value)} maxLength={500} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 font-normal outline-none focus:border-indigo-500" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setEditing(null)} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">Cancel</button><button className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-indigo-700">Save changes</button></div></form></div>}
  </main>;
}
