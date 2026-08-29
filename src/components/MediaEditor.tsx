"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { MediaItem, MediaVisibility } from "@/lib/media";

export function MediaEditor({ item, onSaved }: { item: MediaItem; onSaved: (item: MediaItem) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [description, setDescription] = useState(item.description ?? "");
  const [visibility, setVisibility] = useState<MediaVisibility>(item.visibility ?? "public");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function openEditor() {
    setTitle(item.title);
    setDescription(item.description ?? "");
    setVisibility(item.visibility ?? "public");
    setError("");
    setOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/media", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, title, description, visibility }),
      });
      const data = await response.json().catch(() => ({})) as { media?: MediaItem; error?: string };
      if (!response.ok || !data.media) throw new Error(data.error || "The media details could not be saved.");
      onSaved(data.media);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The media details could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return <>
    <button type="button" onClick={openEditor} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Edit details</button>
    {open && <div className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/80 p-4" onClick={() => setOpen(false)}>
      <form onSubmit={save} className="my-auto w-full max-w-lg rounded-2xl bg-white p-5 text-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <h2 className="text-xl font-bold">Edit media details</h2>
        <p className="mt-1 text-sm text-slate-500">These details appear in the viewer and help describe public video pages to search engines.</p>
        <label className="mt-5 block text-sm font-semibold" htmlFor="media-title">Title</label>
        <input id="media-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        <div className="mt-1 text-right text-xs text-slate-400">{title.length}/120</div>
        <label className="mt-3 block text-sm font-semibold" htmlFor="media-description">Description</label>
        <textarea id="media-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} rows={5} className="mt-2 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-indigo-500" />
        <div className="mt-1 text-right text-xs text-slate-400">{description.length}/500</div>
        <label className="mt-3 block text-sm font-semibold" htmlFor="media-visibility">Visibility</label>
        <select id="media-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as MediaVisibility)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-indigo-500">
          <option value="public">Public — shown in the library, feed, and search engines</option>
          <option value="unlisted">Unlisted — available only through its direct link</option>
          <option value="private">Private — visible only to the administrator</option>
        </select>
        <p className="mt-2 text-xs leading-5 text-amber-700">Application privacy controls access inside MediaSpace. Existing Mux and Vercel Blob files still use public delivery URLs until signed playback and private storage are configured.</p>
        {error && <p className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={saving} className="rounded-lg px-4 py-2 hover:bg-slate-100">Cancel</button><button type="submit" disabled={saving || !title.trim()} className="rounded-lg bg-indigo-600 px-4 py-2 font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? "Saving…" : "Save details"}</button></div>
      </form>
    </div>}
  </>;
}
