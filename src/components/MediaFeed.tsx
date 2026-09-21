"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Album, MediaPage } from "@/lib/database";
import { privatePhotoDeliveryUrl, type MediaItem } from "@/lib/media";
import { AuthControls } from "./AuthControls";
import { MediaCard } from "./MediaCard";
import { PhotoViewer } from "./PhotoViewer";
import { UploadButton } from "./UploadButton";
import { VideoPlayer } from "./VideoPlayer";
import { ThemeSettings } from "./ThemeSettings";
import { MuxUsagePanel } from "./MuxUsagePanel";
import { readUploadDetails } from "@/lib/upload-details";
import { uploadPresigned } from "@vercel/blob/client";

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

type UploadConfig = { local: boolean; mux: boolean; photo: "private-blob" | "server"; maximumBytes: number };

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

async function uploadVideoToMux(file: File, details: { capturedAt: string | null; durationSeconds: number | null; fileSizeBytes: number }, signal: AbortSignal, onProgress: (message: string) => void) {
  const contentHash = await fingerprintFile(file);
  const uploadDetails = { contentHash, title: file.name.replace(/\.[^/.]+$/, ""), capturedAt: details.capturedAt, durationSeconds: details.durationSeconds, fileSizeBytes: details.fileSizeBytes };
  onProgress("Preparing secure video upload...");
  const createResponse = await fetch("/api/mux/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", details: uploadDetails }), signal });
  const created = await createResponse.json() as { intentId?: string; uploadUrl?: string; error?: string };
  if (!createResponse.ok || !created.intentId || !created.uploadUrl) throw new Error(created.error ?? "Could not prepare the video upload.");
  onProgress("Uploading video directly to Mux...");
  const transfer = await fetch(created.uploadUrl, { method: "PUT", body: file, signal, headers: { "Content-Type": file.type || "video/mp4" } });
  if (!transfer.ok) throw new Error("Mux could not receive this video.");
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (signal.aborted) throw new DOMException("Upload canceled", "AbortError");
    onProgress("Preparing video for playback...");
    await new Promise((resolve) => window.setTimeout(resolve, 2000));
    let completeResponse: Response;
    try {
      completeResponse = await fetch(`/api/mux/upload?intentId=${encodeURIComponent(created.intentId)}`, { signal });
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (attempt === 59) throw new Error("The video reached Mux, but MediaSpace temporarily lost contact while confirming it. Refresh the library to see whether processing completed.");
      continue;
    }
    const completed = await completeResponse.json() as { media?: MediaItem; processing?: boolean; error?: string };
    if (!completeResponse.ok) throw new Error(completed.error ?? "Mux could not finish this video.");
    if (completed.media) return completed.media;
  }
  throw new Error("The video is still processing. Refresh the library in a minute to see it.");
}

const emptyPage: MediaPage = { media: [], nextCursor: null, totalCount: 0, photoCount: 0, videoCount: 0, knownSizeCount: 0, knownStorageBytes: 0 };

export function MediaFeed({ initialPage = emptyPage, mediaType }: { initialPage?: MediaPage; mediaType?: MediaItem["type"] }) {
  const { data: session } = useSession();
  const isAdministrator = (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin === true;
  const [uploadConfig, setUploadConfig] = useState<UploadConfig | null>(null);
  useEffect(() => {
    if (!isAdministrator) return;
    let active = true;
    fetch("/api/upload-config").then(async (response) => {
      if (!response.ok) return;
      const config: UploadConfig = await response.json();
      if (active) setUploadConfig(config);
    }).catch(() => undefined);
    return () => { active = false; };
  }, [isAdministrator]);
  const [selected, setSelected] = useState<MediaItem | null>(null);
  const [items, setItems] = useState<MediaItem[]>(initialPage.media);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [summary, setSummary] = useState(() => ({ totalCount: initialPage.totalCount, photoCount: initialPage.photoCount, videoCount: initialPage.videoCount, knownSizeCount: initialPage.knownSizeCount, knownStorageBytes: initialPage.knownStorageBytes }));
  const [albums, setAlbums] = useState<Album[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [albumFilter, setAlbumFilter] = useState("");
  const [sort, setSort] = useState<"uploaded" | "newest" | "oldest">("uploaded");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadState, setUploadState] = useState<{ total: number; completed: number; startedAt: number; estimatedRemaining: number | null } | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const uploadAbortController = useRef<AbortController | null>(null);
  const [scanMessage, setScanMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMediaIds, setSelectedMediaIds] = useState<string[]>([]);
  const [targetAlbumId, setTargetAlbumId] = useState("");
  const [organizing, setOrganizing] = useState(false);
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const filteredItems = items.filter((item) => {
    const matchesType = !mediaType || item.type === mediaType;
    const matchesAlbum = !albumFilter || item.albumIds?.includes(albumFilter);
    const searchableDetails = `${item.title} ${item.description ?? ""}`.toLocaleLowerCase();
    const matchesSearch = !normalizedSearchQuery || searchableDetails.includes(normalizedSearchQuery);
    return matchesType && matchesAlbum && matchesSearch;
  });
  const visible = sort === "uploaded" ? filteredItems : [...filteredItems].sort((first, second) => {
    const firstDate = first.capturedAt ? Date.parse(first.capturedAt) : Number.NaN;
    const secondDate = second.capturedAt ? Date.parse(second.capturedAt) : Number.NaN;
    if (Number.isNaN(firstDate)) return 1;
    if (Number.isNaN(secondDate)) return -1;
    return sort === "newest" ? secondDate - firstDate : firstDate - secondDate;
  });
  const displayedItems = visible;
  const firstVideoIndex = displayedItems.findIndex((item) => item.type === "video");
  const galleryItems = !isAdministrator && firstVideoIndex > 0
    ? [displayedItems[firstVideoIndex], ...displayedItems.slice(0, firstVideoIndex), ...displayedItems.slice(firstVideoIndex + 1)]
    : displayedItems;
  const galleryLoading = loading;
  useEffect(() => {
    const query = new URLSearchParams({ limit: String(galleryPageSize) });
    if (mediaType) query.set("type", mediaType);
    fetch(`/api/media?${query}`)
      .then((response) => response.json())
      .then((data: MediaPage) => {
        setItems(data.media);
        setNextCursor(data.nextCursor);
        setSummary({ totalCount: data.totalCount, photoCount: data.photoCount, videoCount: data.videoCount, knownSizeCount: data.knownSizeCount, knownStorageBytes: data.knownStorageBytes });
        const sharedMediaId = new URLSearchParams(window.location.search).get("media");
        const sharedItem = data.media.find((item) => item.id === sharedMediaId);
        if (sharedItem) setSelected(sharedItem);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [mediaType]);

  async function loadMoreMedia() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    const query = new URLSearchParams({ limit: String(galleryPageSize), cursor: nextCursor });
    if (mediaType) query.set("type", mediaType);
    try {
      const response = await fetch(`/api/media?${query}`);
      const data = await response.json() as MediaPage & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load more media.");
      setItems((current) => {
        const knownIds = new Set(current.map((item) => item.id));
        return [...current, ...data.media.filter((item) => !knownIds.has(item.id))];
      });
      setNextCursor(data.nextCursor);
      setSummary({ totalCount: data.totalCount, photoCount: data.photoCount, videoCount: data.videoCount, knownSizeCount: data.knownSizeCount, knownStorageBytes: data.knownStorageBytes });
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Could not load more media.");
    } finally {
      setLoadingMore(false);
    }
  }

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

  async function addMedia(files: File[]) {
    setUploadError("");
    const uploaded: MediaItem[] = [];
    let failed = 0;
    const failureMessages: string[] = [];
    let rejectedForLength = 0;
    let rejectedWithoutDuration = 0;
    let canceled = false;
    const abortController = new AbortController();
    uploadAbortController.current = abortController;
    const startedAt = Date.now();
    setUploadState({ total: files.length, completed: 0, startedAt, estimatedRemaining: null });
    try {
      for (const [index, file] of files.entries()) {
        if (abortController.signal.aborted) { canceled = true; break; }
        setUploadProgress(`Preparing ${index + 1} of ${files.length}`);
        try {
          const configResponse = uploadConfig ? null : await fetch("/api/upload-config", { signal: abortController.signal });
          if (configResponse && !configResponse.ok) throw new Error("Could not load upload settings. Sign in again and retry.");
          const config: UploadConfig = uploadConfig ?? await configResponse!.json();
          if (config.local && file.size > config.maximumBytes) throw new Error("Files must be 500 MB or smaller.");
          if (file.type.startsWith("video/")) setUploadProgress(`Checking video length for ${index + 1} of ${files.length} — no upload has started yet`);
          const details = await readUploadDetails(file, abortController.signal);
          if (abortController.signal.aborted) { canceled = true; break; }
          if (file.type.startsWith("video/")) {
            if (details.durationSeconds === null) {
              rejectedWithoutDuration += 1;
              throw new Error("This video's duration could not be checked.");
            }
            if (details.durationSeconds > maximumVideoDurationSeconds) {
              rejectedForLength += 1;
              throw new Error("Videos must be five minutes or shorter.");
            }
          }
          if (config.local) {
            setUploadProgress(`Uploading ${index + 1} of ${files.length} to your server…`);
            const headers: Record<string, string> = { "Content-Type": file.type, "X-Media-Name": encodeURIComponent(file.name) };
            if (details.durationSeconds !== null) headers["X-Media-Duration"] = String(details.durationSeconds);
            if (details.capturedAt) headers["X-Media-Captured-At"] = details.capturedAt;
            const response = await fetch("/api/local-upload", { method: "POST", headers, body: file, signal: abortController.signal });
            const data = await response.json() as { media?: MediaItem; error?: string };
            if (!response.ok || !data.media) throw new Error(data.error ?? "The server could not save this file.");
            uploaded.push(data.media);
          } else if (file.type.startsWith("video/")) {
            const media = await uploadVideoToMux(file, details, abortController.signal, setUploadProgress);
            uploaded.push(media);
          } else if (config.photo === "server") {
            const formData = new FormData();
            formData.append("file", file);
            if (details.capturedAt) formData.append("capturedAt", details.capturedAt);
            if (details.durationSeconds !== null) formData.append("durationSeconds", String(details.durationSeconds));
            const response = await fetch("/api/upload", { method: "POST", body: formData, signal: abortController.signal });
            const data = await response.json() as { media?: MediaItem; error?: string };
            if (!response.ok || !data.media) {
              throw new Error(data.error ?? "The server could not save this file.");
            }
            else uploaded.push(data.media);
          } else {
            const contentHash = await fingerprintFile(file);
            const blob = await uploadPresigned(`protected-media/${file.name}`, file, {
              access: "private",
              handleUploadUrl: "/api/private-upload",
              clientPayload: JSON.stringify({
                contentHash,
                capturedAt: details.capturedAt,
                durationSeconds: details.durationSeconds,
                fileSizeBytes: details.fileSizeBytes,
                title: file.name.replace(/\.[^/.]+$/, ""),
                mediaType: "photo",
              }),
              multipart: true,
              abortSignal: abortController.signal,
              onUploadProgress: ({ percentage }) => setUploadProgress(`Uploading ${index + 1} of ${files.length} (${Math.round(percentage)}%)`),
            });
            const uploadedPhoto: MediaItem = {
              id: blob.pathname,
              title: file.name.replace(/\.[^/.]+$/, ""),
              type: "photo",
              url: blob.url,
              createdAt: "Just now",
              album: "Uploads",
              contentHash,
              capturedAt: details.capturedAt,
              durationSeconds: details.durationSeconds,
              fileSizeBytes: details.fileSizeBytes,
              visibility: "private",
            };
            uploaded.push({ ...uploadedPhoto, url: privatePhotoDeliveryUrl(uploadedPhoto) });
          }
        } catch (error) {
          if (abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) { canceled = true; break; }
          failed += 1;
          const message = error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "The server could not upload this file.";
          if (!failureMessages.includes(message)) failureMessages.push(message);
        }
        const completed = index + 1;
        const elapsed = (Date.now() - startedAt) / 1000;
        const estimatedRemaining = completed < files.length ? Math.ceil((elapsed / completed) * (files.length - completed)) : 0;
        setUploadState({ total: files.length, completed, startedAt, estimatedRemaining });
      }
    } finally {
      uploadAbortController.current = null;
      setUploadState(null);
    }
    setItems((current) => [...uploaded, ...current]);
    const relevantUploads = uploaded.filter((item) => !mediaType || item.type === mediaType);
    if (relevantUploads.length) setSummary((current) => ({ totalCount: current.totalCount + relevantUploads.length, photoCount: current.photoCount + relevantUploads.filter((item) => item.type === "photo").length, videoCount: current.videoCount + relevantUploads.filter((item) => item.type === "video").length, knownSizeCount: current.knownSizeCount + relevantUploads.filter((item) => typeof item.fileSizeBytes === "number").length, knownStorageBytes: current.knownStorageBytes + relevantUploads.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0) }));
    setUploadProgress("");
    if (canceled) {
      setUploadError("Upload canceled. Any files that finished before you canceled are still in your library.");
    } else if (rejectedForLength) {
      setUploadError(rejectedForLength === 1 ? "One video was skipped because videos must be five minutes or shorter." : `${rejectedForLength} videos were skipped because videos must be five minutes or shorter.`);
    } else if (rejectedWithoutDuration) {
      setUploadError(rejectedWithoutDuration === 1 ? "One video was skipped because its length could not be checked before uploading." : `${rejectedWithoutDuration} videos were skipped because their lengths could not be checked before uploading.`);
    } else if (failed) {
      const summary = failed === 1 ? "One file could not be uploaded." : `${failed} files could not be uploaded.`;
      setUploadError(failureMessages.length ? `${summary} ${failureMessages.join(" ")}` : summary);
    }
  }
  function cancelUpload() {
    setUploadProgress("Canceling upload...");
    uploadAbortController.current?.abort();
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
    setSummary((current) => ({ totalCount: Math.max(0, current.totalCount - 1), photoCount: Math.max(0, current.photoCount - (selected.type === "photo" ? 1 : 0)), videoCount: Math.max(0, current.videoCount - (selected.type === "video" ? 1 : 0)), knownSizeCount: Math.max(0, current.knownSizeCount - (typeof selected.fileSizeBytes === "number" ? 1 : 0)), knownStorageBytes: Math.max(0, current.knownStorageBytes - (selected.fileSizeBytes ?? 0)) }));
    setSelected(null);
  }
  function updateSelectedAlbums(albumIds: string[], albumName: string) {
    if (!selected) return;
    const updated = { ...selected, albumIds, album: albumName };
    setSelected(updated);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  function updateSelectedMedia(updated: MediaItem) {
    setSelected(updated);
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }
  function toggleMediaSelection(item: MediaItem) {
    setSelectedMediaIds((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id]);
  }
  function stopSelecting() {
    setSelectionMode(false);
    setSelectedMediaIds([]);
    setTargetAlbumId("");
  }
  async function addSelectionToAlbum() {
    if (!targetAlbumId || selectedMediaIds.length === 0) return;
    setOrganizing(true);
    setUploadError("");
    const response = await fetch("/api/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selectedMediaIds, addToAlbumId: targetAlbumId }) });
    const data = await response.json() as { error?: string };
    setOrganizing(false);
    if (!response.ok) { setUploadError(data.error ?? "Could not add the selected files to that album."); return; }
    setItems((current) => current.map((item) => selectedMediaIds.includes(item.id) ? { ...item, albumIds: [...new Set([...(item.albumIds ?? []), targetAlbumId])], album: item.album === "Uploads" ? albums.find((album) => album.id === targetAlbumId)?.name ?? item.album : item.album } : item));
    stopSelecting();
  }

  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
    <header className="flex flex-col gap-5 border-b border-slate-200 pb-7 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold uppercase tracking-[.2em] text-indigo-600">Personal library</p><h1 className="mt-1 text-3xl font-black tracking-tight sm:text-4xl">MediaSpace</h1><p className="mt-2 text-slate-500">All your photos and videos, in one calm place.</p></div><div className="flex flex-wrap items-center gap-3"><Link href="/feed" className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-slate-700">Video feed</Link><AuthControls />{session && <><ThemeSettings /><button onClick={() => selectionMode ? stopSelecting() : setSelectionMode(true)} disabled={Boolean(uploadState)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{selectionMode ? "Cancel organize" : "Organize media"}</button><button onClick={scanExistingMedia} disabled={scanning || Boolean(uploadState)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{scanning ? "Scanning..." : "Scan media library"}</button><UploadButton onSelect={addMedia} uploading={Boolean(uploadState)} /></>}</div></header>
    <search className="mt-7 block" aria-label="Search media library">
      <label htmlFor="media-search" className="sr-only">Search titles and descriptions</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-400" aria-hidden="true">⌕</span>
        <input id="media-search" type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search titles and descriptions" className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-11 pr-20 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
        {searchQuery && <button type="button" onClick={() => setSearchQuery("")} className="absolute inset-y-0 right-3 my-auto h-8 rounded-lg px-2 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900">Clear</button>}
      </div>
    </search>
    <section className="mt-7 flex flex-wrap items-center gap-2">{([{ href: "/", label: "Everything", type: undefined }, { href: "/photos", label: "Photos", type: "photo" }, { href: "/videos", label: "Videos", type: "video" }] as const).map((option) => <Link key={option.href} href={option.href} aria-current={mediaType === option.type ? "page" : undefined} className={`rounded-full px-4 py-2 text-sm font-semibold ${mediaType === option.type ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}>{option.label}</Link>)}{albums.length > 0 && <select aria-label="Filter by album" value={albumFilter} onChange={(event) => setAlbumFilter(event.target.value)} className="ml-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50"><option value="">All albums</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select>}<select aria-label="Sort media" value={sort} onChange={(event) => setSort(event.target.value as "uploaded" | "newest" | "oldest")} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 outline-none hover:bg-slate-50"><option value="uploaded">Recently uploaded</option><option value="newest">Date taken: newest</option><option value="oldest">Date taken: oldest</option></select></section>
    {selectionMode && <section className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3"><p className="text-sm font-bold text-indigo-950">{selectedMediaIds.length} selected</p><select aria-label="Album to add selected media to" value={targetAlbumId} onChange={(event) => setTargetAlbumId(event.target.value)} className="min-w-40 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"><option value="">Choose an album</option>{albums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}</select><button onClick={addSelectionToAlbum} disabled={!targetAlbumId || selectedMediaIds.length === 0 || organizing} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{organizing ? "Adding..." : "Add selected to album"}</button>{albums.length === 0 && <Link href="/albums" className="text-sm font-bold text-indigo-700 hover:underline">Create an album first →</Link>}</section>}
    {uploadProgress && <p className="mt-4 rounded-lg bg-indigo-50 p-3 text-sm font-medium text-indigo-700">{uploadProgress}</p>}{scanMessage && <p className={`mt-4 rounded-lg p-3 text-sm font-medium ${scanMessage.startsWith("Could") || scanMessage.startsWith("Fingerprint") ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{scanMessage}</p>}{uploadError && <p className="mt-4 rounded-lg bg-rose-50 p-3 text-sm font-medium text-rose-700">{uploadError}</p>}
    {isAdministrator && uploadConfig?.mux && <MuxUsagePanel refreshKey={items.length} />}
    {!loading && <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-medium text-slate-500">{normalizedSearchQuery && <span className="font-bold text-indigo-700">{visible.length} loaded {visible.length === 1 ? "result" : "results"}</span>}<span>{summary.totalCount} files</span><span>{summary.photoCount} photos</span><span>{summary.videoCount} videos</span>{summary.knownSizeCount > 0 && <span>{formatFileSize(summary.knownStorageBytes)} tracked storage</span>}{summary.knownSizeCount < summary.totalCount && session && <span className="text-indigo-700">Scan media library to calculate all storage.</span>}</div>}
    <section className="mt-5 grid grid-cols-3 gap-0" aria-busy={galleryLoading}>{galleryLoading ? Array.from({ length: 9 }, (_, index) => <div key={index} className="aspect-square animate-pulse border border-slate-100 bg-slate-100" aria-hidden="true" />) : <>{isAdministrator && <div className="aspect-square border border-dashed border-indigo-300 bg-indigo-50 p-3 text-indigo-950 sm:p-5"><p className="text-sm font-bold sm:text-lg">Create an album</p><p className="mt-1 hidden text-sm text-indigo-800 sm:block">Group a moment, trip, or project.</p><Link href="/albums" className="mt-3 inline-block text-xs font-bold text-indigo-700 hover:underline sm:mt-4 sm:text-sm">New album →</Link></div>}{galleryItems.map((item) => <MediaCard key={item.id} item={item} onSelect={setSelected} selectionMode={selectionMode} isSelected={selectedMediaIds.includes(item.id)} onToggleSelection={toggleMediaSelection} />)}{visible.length === 0 && <p className={`${isAdministrator ? "col-span-2" : "col-span-3"} border border-dashed border-slate-300 p-3 text-sm text-slate-500 sm:p-5`}>{normalizedSearchQuery ? `No media matches “${searchQuery.trim()}”. Try another search.` : "No media matches the selected filters yet."}</p>}</>}</section>
    {!loading && items.length > 0 && <div className="mt-5 flex flex-col items-center gap-3 text-sm text-slate-500"><p>Loaded {items.length} of {summary.totalCount} files</p>{nextCursor && <button onClick={loadMoreMedia} disabled={loadingMore} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{loadingMore ? "Loading..." : `Load up to ${Math.min(galleryPageSize, Math.max(0, summary.totalCount - items.length))} more`}</button>}</div>}
    {selected?.type === "photo" && <PhotoViewer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} onUpdate={isAdministrator ? updateSelectedMedia : undefined} />}{selected?.type === "video" && <VideoPlayer item={selected} onClose={() => setSelected(null)} onDelete={session ? deleteSelectedMedia : undefined} onOrganize={session ? updateSelectedAlbums : undefined} onUpdate={isAdministrator ? updateSelectedMedia : undefined} />}
    {uploadState && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-950/70 p-5"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-center gap-3"><span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" /><div><p className="font-black text-slate-900">Uploading media</p><p className="text-sm text-slate-500">File {Math.min(uploadState.completed + 1, uploadState.total)} of {uploadState.total}</p></div></div><div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600 transition-all" style={{ width: `${(uploadState.completed / uploadState.total) * 100}%` }} /></div><div className="mt-4 flex justify-between text-sm text-slate-600"><span>Elapsed {formatDuration(elapsedSeconds)}</span><span>{uploadState.estimatedRemaining === null ? "Estimating time..." : `${formatDuration(uploadState.estimatedRemaining)} left`}</span></div><button type="button" onClick={cancelUpload} className="mt-6 w-full rounded-xl border border-rose-300 px-4 py-2.5 text-sm font-bold text-rose-700 hover:bg-rose-50">Cancel upload</button></div></div>}
  </main>;
}
