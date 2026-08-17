import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { readMedia, removeMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { addMediaToAlbum, deleteMediaRecord, getMediaAlbumDetails, saveMedia, setMediaAlbums, usesDatabase } from "@/lib/database";
import { demoMedia } from "@/lib/media";
import { deleteLocalMedia, listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function GET() {
  if (usesBlobStorage) {
    const media = await listBlobMedia();
    if (usesDatabase) await Promise.all(media.map((item) => saveMedia(item)));
    if (usesDatabase) {
      const details = await getMediaAlbumDetails();
      return NextResponse.json({ media: media.map((item) => ({ ...item, ...(details.get(item.id) ?? {}) })) });
    }
    return NextResponse.json({ media });
  }
  const savedMedia = await readMedia();
  return NextResponse.json({ media: savedMedia.length ? savedMedia : demoMedia });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to organize media." }, { status: 401 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  const body = await request.json() as { id?: unknown; albumIds?: unknown; ids?: unknown; addToAlbumId?: unknown };
  if (Array.isArray(body.ids) && typeof body.addToAlbumId === "string") {
    if (body.ids.length === 0 || !body.ids.every((id) => typeof id === "string" && id.startsWith("media/"))) return NextResponse.json({ error: "Invalid media selection." }, { status: 400 });
    await addMediaToAlbum(body.ids, body.addToAlbumId);
    return NextResponse.json({ updated: true });
  }
  if (typeof body.id !== "string" || !body.id.startsWith("media/") || !Array.isArray(body.albumIds) || !body.albumIds.every((id) => typeof id === "string")) return NextResponse.json({ error: "Invalid media or album selection." }, { status: 400 });
  await setMediaAlbums(body.id, body.albumIds);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete media." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("pathname");
  if (!id) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
  if (usesBlobStorage) {
    if (!id.startsWith("media/")) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
    await del(id);
    if (usesDatabase) await deleteMediaRecord(id);
  } else {
    const item = (await readMedia()).find((media) => media.id === id);
    if (!item) return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    await deleteLocalMedia(item.url);
    await removeMedia(item.id);
  }
  return NextResponse.json({ deleted: true });
}
