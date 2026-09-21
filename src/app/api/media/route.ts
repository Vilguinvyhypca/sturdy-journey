import { deleteStoredLocalMedia, usesLocalStorage } from "@/lib/local-storage";
import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { getLocalMediaStorage, readMedia, removeMedia, updateLocalMediaDetails } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { addMediaToAlbum, deleteMediaRecord, getMediaStorage, getMediaById, listDatabaseMediaPage, setMediaAlbums, updateMediaDetails, usesDatabase } from "@/lib/database";
import { createMuxPlaybackTokens, deleteMuxAsset } from "@/lib/mux";
import { demoMedia, isMediaVisibility, isSignedMuxUrl, muxPlaybackIdFromUrl, privatePhotoDeliveryUrl, type MediaItem } from "@/lib/media";
import { deleteLocalMedia, deletePrivateBlob, isPrivateBlobUrl, listBlobMedia, usesBlobStorage } from "@/lib/storage";

function withDelivery(item: MediaItem): MediaItem {
  let delivered = item;
  if (isSignedMuxUrl(delivered.url)) {
    const playbackId = muxPlaybackIdFromUrl(delivered.url);
    if (playbackId) delivered = { ...delivered, muxTokens: createMuxPlaybackTokens(playbackId) };
  }
  if (delivered.type === "photo" && isPrivateBlobUrl(delivered.url)) {
    delivered = { ...delivered, url: privatePhotoDeliveryUrl(delivered) };
  }
  return delivered;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  const administrator = isAdmin(session?.user as { isAdmin?: boolean } | undefined);
  const searchParams = new URL(request.url).searchParams;
  const requestedLimit = Number(searchParams.get("limit") ?? "48");
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 100) : 48;
  const cursor = searchParams.get("cursor");
  const requestedType = searchParams.get("type");
  const type = requestedType === "photo" || requestedType === "video" ? requestedType : undefined;
  if (usesDatabase) {
    const page = await listDatabaseMediaPage({ includeNonPublic: administrator, cursor, limit, type });
    return NextResponse.json({ ...page, media: page.media.map(withDelivery) });
  }
  if (usesBlobStorage && !usesLocalStorage) {
    const media = await listBlobMedia();
    const available = media.filter((item) => (administrator || item.visibility === "public") && (!type || item.type === type));
    return NextResponse.json({ media: available, nextCursor: null, totalCount: available.length, photoCount: available.filter((item) => item.type === "photo").length, videoCount: available.filter((item) => item.type === "video").length, knownSizeCount: available.filter((item) => typeof item.fileSizeBytes === "number").length, knownStorageBytes: available.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0) });
  }
  const savedMedia = await readMedia();
  const blobMedia = usesBlobStorage ? await listBlobMedia() : [];
  const combined = [...savedMedia, ...blobMedia.filter((item) => !savedMedia.some((saved) => saved.id === item.id))];
  const availableMedia = combined.length || usesLocalStorage ? combined : demoMedia;
  const available = availableMedia.filter((item) => (administrator || item.visibility === "public") && (!type || item.type === type));
  return NextResponse.json({ media: available, nextCursor: null, totalCount: available.length, photoCount: available.filter((item) => item.type === "photo").length, videoCount: available.filter((item) => item.type === "video").length, knownSizeCount: available.filter((item) => typeof item.fileSizeBytes === "number").length, knownStorageBytes: available.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0) });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to update media." }, { status: 401 });
  const body = await request.json() as { id?: unknown; title?: unknown; description?: unknown; visibility?: unknown; albumIds?: unknown; ids?: unknown; addToAlbumId?: unknown };
  const isDetailsUpdate = "title" in body || "description" in body || "visibility" in body;
  if (isDetailsUpdate) {
    const mediaId = typeof body.id === "string" ? body.id.trim() : "";
    if (!mediaId || mediaId.length > 2_048) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const description = typeof body.description === "string" ? body.description.trim() : "";
    const visibility = isMediaVisibility(body.visibility) ? body.visibility : undefined;
    if ("visibility" in body && !visibility) return NextResponse.json({ error: "Choose public, unlisted, or private visibility." }, { status: 400 });
    if (!title) return NextResponse.json({ error: "A title is required." }, { status: 400 });
    if (title.length > 120) return NextResponse.json({ error: "The title must be 120 characters or fewer." }, { status: 400 });
    if (description.length > 500) return NextResponse.json({ error: "The description must be 500 characters or fewer." }, { status: 400 });
    const media = usesDatabase
      ? await updateMediaDetails(mediaId, title, description, visibility)
      : await updateLocalMediaDetails(mediaId, title, description, visibility);
    if (!media) return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    return NextResponse.json({ media: withDelivery(media) });
  }
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  if (Array.isArray(body.ids) && typeof body.addToAlbumId === "string") {
    if (body.ids.length === 0 || !body.ids.every((id) => typeof id === "string" && (id.startsWith("media/") || id.startsWith("protected-media/") || id.startsWith("mux:") || id.startsWith("local:")))) return NextResponse.json({ error: "Invalid media selection." }, { status: 400 });
    await addMediaToAlbum(body.ids, body.addToAlbumId);
    return NextResponse.json({ updated: true });
  }
  if (typeof body.id !== "string" || (!body.id.startsWith("media/") && !body.id.startsWith("protected-media/") && !body.id.startsWith("mux:") && !body.id.startsWith("local:")) || !Array.isArray(body.albumIds) || !body.albumIds.every((id) => typeof id === "string")) return NextResponse.json({ error: "Invalid media or album selection." }, { status: 400 });
  await setMediaAlbums(body.id, body.albumIds);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete media." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("pathname");
  if (!id) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
  const databaseItem = usesDatabase ? await getMediaById(id) : null;
  const storage = usesDatabase ? await getMediaStorage(id) : await getLocalMediaStorage(id);
  if (storage?.provider === "local" && storage.access === "private") {
    await deleteStoredLocalMedia(storage.objectKey);
    if (usesDatabase) await deleteMediaRecord(id);
    else await removeMedia(id);
  } else if (id.startsWith("mux:")) {
    await deleteMuxAsset(id.slice("mux:".length));
    if (usesDatabase) await deleteMediaRecord(id);
  } else if (databaseItem && isPrivateBlobUrl(databaseItem.url)) {
    await deletePrivateBlob(databaseItem.url);
    await deleteMediaRecord(id);
  } else if (usesBlobStorage) {
    if (!id.startsWith("media/")) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
    await del(id);
    if (usesDatabase) await deleteMediaRecord(id);
  } else if (databaseItem?.url.startsWith("/uploads/")) {
    await deleteLocalMedia(databaseItem.url);
    await deleteMediaRecord(id);
  } else {
    const item = (await readMedia()).find((media) => media.id === id);
    if (!item) return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    await deleteLocalMedia(item.url);
    await removeMedia(item.id);
  }
  return NextResponse.json({ deleted: true });
}
