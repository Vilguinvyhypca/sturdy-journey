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
import { readUploadDetails } from "@/lib/upload-details";
import { upload } from "@vercel/blob/client";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

const galleryPageSize = 48;
const maximumVideoDurationSeconds = 5 * 60;

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

async function fingerprintFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function MediaFeed() {
  const { data: session } = useSession();
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [items, setItems] = useState<MediaItem[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumFilter, setAlbumFilter] = useState("");
  const [sort, setSort] = useState<"uploaded" | "newest" | "oldest">("uploaded");
  const [visibleCount, setVisibleCount] = useState(galleryPageSize);
  const [loading, setLoading] = useState(true);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadState, setUploadState] = useState<{ total: number; completed: number; startedAt: number; estimatedRemaining: number | null } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const filteredItems = items.filter((item) => (filter === "all" || item.type === filter) && (!albumFilter || item.albumIds?.includes(albumFilter)));
  const visible = sort === "uploaded" ? filteredItems : [...filteredItems].sort((first, second) => {
    const firstDate = first.capturedAt ? Date.parse(first.capturedAt) : Number.NaN;
    const secondDate = second.capturedAt ? Date.parse(second.capturedAt) : Number.NaN;
    if (Number.isNaN(firstDate)) return 1;
    if (Number.isNaN(secondDate)) return -1;
    return sort === "newest" ? secondDate - firstDate : firstDate - secondDate;
  });
  const displayedItems = visible.slice(0, visibleCount);
  const photoCount = items.filter((item) => item.type === "photo").length;
  const videoCount = items.length - photoCount;
  const itemsWithKnownSize = items.filter((item) => typeof item.fileSizeBytes === "number");
  const knownStorageBytes = itemsWithKnownSize.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0);

  useEffect(() => {
    fetch("/api/media")
      .then((response) => response.json())
      .then((data: { media: MediaItem[] }) => {
        setItems(data.media);
        const sharedMediaId = new URLSearchParams(window.location.search).get("media");
        const sharedItem = data.media.find((item) => item.id === sharedMediaId);
        if (sharedItem) setSelected(sharedItem);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!uploadState) return;
    const updateElapsed = () => setElapsedSeconds(Math.floor((Date.now() - uploadState.startedAt) / 1000));
    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(timer);
  }, [uploadState]);

  useEffect(() => {
    fetch("/api/albums")
      .then((response) => response.json())
      .then((data: { albums?: Album[] }) => setAlbums(data.albums ?? []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setVisibleCount(galleryPageSize);
  }, [filter, albumFilter, sort]);

  async function addMedia(files: File[]) {
    setUploadError("");
    const uploaded: MediaItem[] = [];
    let failed = 0;
    let rejectedForLength = 0;
    const startedAt = Date.now();
    setUploadState({ total: files.length, completed: 0, startedAt, estimatedRemaining: null });
    try {
      for (const [index, file] of files.entries()) {
        setUploadProgress(`Preparing ${index + 1} of ${files.length}`);
        try {
          const details = await readUploadDetails(file);
          if (file.type.startsWith("video/") && details.durationSeconds !== null && details.durationSeconds > maximumVideoDurationSeconds) {
            rejectedForLength += 1;
            throw new Error("Videos must be five minutes or shorter.");
          }
          const isLocalDevelopment = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
          if (isLocalDevelopment) {
            const formData = new FormData();
            formData.append("file", file);
            if (details.capturedAt) formData.append("capturedAt", details.capturedAt);
            if (details.durationSeconds !== null) formData.append("durationSeconds", String(details.durationSeconds));
            const response = await fetch("/api/upload", { method: "POST", body: formData });
            const data = await response.json() as { media?: MediaItem; error?: string };
            if (!response.ok || !data.media) failed += 1;
            else uploaded.push(data.media);
          } else {
            const contentHash = await fingerprintFile(file);
            const blob = await upload(`media/${file.name}`, file, {
              access: "public",
              handleUploadUrl: "/api/upload",
              clientPayload: JSON.stringify({
                contentHash,
                capturedAt: details.capturedAt,
                durationSeconds: details.durationSeconds,
                fileSizeBytes: details.fileSizeBytes,
                title: file.name.replace(/\.[^/.]+$/, ""),
              }),
              multipart: true,
              onUploadProgress: ({ percentage }) => setUploadProgress(`Uploading ${index + 1} of ${files.length} (${Math.round(percentage)}%)`),
            });
            uploaded.push({
              id: blob.pathname,
              title: file.name.replace(/\.[^/.]+$/, ""),
              type: file.type.startsWith("video/") ? "video" : "photo",
              url: blob.url,
              createdAt: "Just now",
              album: "Uploads",
              contentHash,
              capturedAt: details.capturedAt,
              durationSeconds: details.durationSeconds,
              fileSizeBytes: details.fileSizeBytes,
            });
          }
        } catch {
          failed += 1;
        }
        const completed = index + 1;
        const elapsed = (Date.now() - startedAt) / 1000;
        const estimatedRemaining = completed < files.length ? Math.ceil((elapsed / completed) * (files.length - completed)) : 0;
        setUploadState({ total: files.length, completed, startedAt, estimatedRemaining });
      }
    } finally {
      setUploadState(null);
    }
    setItems((current) => [...uploaded, ...current]);
    setFilter("all");
    setUploadProgress("");
    if (rejectedForLength) {
      setUploadError(rejectedForLength === 1 ? "One video was skipped because videos must be five minutes or shorter." : `${rejectedForLength} videos were skipped because videos must be five minutes or shorter.`);
    } else if (failed) {
      setUploadError(failed === 1 ? "One file could not be uploaded." : `${failed} files could not be uploaded.`);
    }
  }
  async function scanExistingMedia() {
    setScanning(true);
    setScanMessage("");
    const response = await fetch("/api/media/fingerprints", { method: "POST" });
    const data = await response.json() as { scanned?: number; total?: number; error?: string };
    setScanning(false);
    if (!response.ok) { setScanMessage(data.error ?? "Could not scan existing media."); return; }
    setScanMessage(`${data.scanned ?? 0} of ${data.total ?? 0} files scanned. Fingerprints and available details are saved.`);
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
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-indigo-600">Personal library</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">MediaSpace</h1><p className="mt-2 text-slate-500">All your photos and videos, in one calm place.</p></div><div className="flex flex-wrap items-center gap-3"><AuthControls />{session && <><button onClick={scanExistingMedia} disabled={scanning || Boolean(uploadState)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{scanning ? "Scanning..." : "Scan media library"}</button><UploadButton onSelect={addMedia} uploading={Boolean(uploadState)} /></>}</div></header>
    <section className="mt-7 flex flex-wrap items-center gap-2">{(["all", "photo", "video"] as const).map((type) => <button key={type} onClick={() => setFilter(type)} className={`rounded-full px-4 py-2 text-sm font-semibold capitalize ${filter === type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{type === "all" ? "Everything" : `${type}s`}</button>)}{albums.length > 0 && <select aria-label="Filter by album" value={albumFilter} onChange={(event) => setAlbumFilter(event.target.value)} className="ml-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50"><option value="">All albums</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select>}<select aria-label="Sort media" value={sort} onChange={(event) => setSort(event.target.value as "uploaded" | "newest" | "oldest")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50"><option value="uploaded">Recently uploaded</option><option value="newest">Date taken: newest</option><option value="oldest">Date taken: oldest</option></select></section>
    {uploadProgress && <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{uploadProgress}</p>}{scanMessage && <p className={`mt-4 rounded-lg p-3 text-sm font-medium ${scanMessage.startsWith("Could") || scanMessage.startsWith("Fingerprint") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{scanMessage}</p>}{uploadError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{uploadError}</p>}
    {!loading && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-500"><span>{items.length} files</span><span>{photoCount} photos</span><span>{videoCount} videos</span>{itemsWithKnownSize.length > 0 && <span>{formatFileSize(knownStorageBytes)} tracked storage</span>}{itemsWithKnownSize.length < items.length && session && <span className="text-indigo-700">Scan media library to calculate all storage.</span>}</div>}
    <section className="mt-5 grid grid-cols-3 gap-0"><div className="aspect-square border border-dashed border-indigo-300 bg-indigo-50 p-3 text-indigo-950 sm:p-5"><p className="text-sm font-bold sm:text-lg">Create an album</p><p className="mt-1 hidden text-sm text-indigo-800 sm:block">Group a moment, trip, or project.</p><Link href="/albums" className="mt-3 inline-block text-xs font-bold text-indigo-700 hover:underline sm:mt-4 sm:text-sm">New album →</Link></div>{loading ? <div className="aspect-square border border-slate-200 bg-white p-3 text-sm text-slate-500 sm:p-5">Loading media...</div> : displayedItems.map((item) => <MediaCard key={item.id} item={item} onSelect={setSelected} />)}{!loading && visible.length === 0 && <p className="col-span-2 border border-dashed border-slate-300 p-3 text-sm text-slate-500 sm:p-5">No media matches this album yet.</p>}</section>
    {!loading && visible.length > 0 && <div className="mt-5 flex flex-col items-center gap-3 text-sm text-slate-500"><p>Showing {displayedItems.length} of {visible.length} files</p>{displayedItems.length < visible.length && <button onClick={() => setVisibleCount((count) => count + galleryPageSize)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50">Load {Math.min(galleryPageSize, visible.length - displayedItems.length)} more</button>}</div>}
    {selected?.type === "photo" && <PhotoViewer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} />}{selected?.type === "video" && <VideoPlayer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} />}
    {uploadState && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-5"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-3"><span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /><div><p className="font-black text-slate-900">Uploading media</p><p className="text-sm text-slate-500">File {Math.min(uploadState.completed + 1, uploadState.total)} of {uploadState.total}</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(uploadState.completed / uploadState.total) * 100}%` }} /></div><div className="mt-4 flex justify-between text-sm text-slate-600"><span>Elapsed {formatDuration(elapsedSeconds)}</span><span>{uploadState.estimatedRemaining === null ? "Estimating time..." : `${formatDuration(uploadState.estimatedRemaining)} left`}</span></div></div></div>}
  </main>;
}
