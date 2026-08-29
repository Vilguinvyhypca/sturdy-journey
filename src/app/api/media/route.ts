import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { readMedia, removeMedia, updateLocalMediaDetails } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { addMediaToAlbum, deleteMediaRecord, getMediaAlbumDetails, listMuxMedia, saveMedia, setMediaAlbums, updateMediaDetails, usesDatabase } from "@/lib/database";
import { deleteMuxAsset } from "@/lib/mux";
import { demoMedia, isMediaVisibility } from "@/lib/media";
import { deleteLocalMedia, listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function GET() {
  const session = await getServerSession(authOptions);
  const administrator = isAdmin(session?.user as { isAdmin?: boolean } | undefined);
  if (usesBlobStorage) {
    const media = await listBlobMedia();
    if (usesDatabase) await Promise.all(media.map((item) => saveMedia(item)));
    if (usesDatabase) {
      const details = await getMediaAlbumDetails();
      const blobMedia = media.map((item) => ({ ...item, ...(details.get(item.id) ?? {}) }));
      const muxMedia = await listMuxMedia(administrator);
      return NextResponse.json({ media: [...muxMedia, ...blobMedia.filter((item) => administrator || item.visibility === "public")] });
    }
    return NextResponse.json({ media: media.filter((item) => administrator || item.visibility === "public") });
  }
  const savedMedia = await readMedia();
  const availableMedia = savedMedia.length ? savedMedia : demoMedia;
  return NextResponse.json({ media: availableMedia.filter((item) => administrator || item.visibility === "public") });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to update media." }, { status: 401 });
  const body = await request.json() as { id?: unknown; title?: unknown; description?: unknown; visibility?: unknown; albumIds?: unknown; ids?: unknown; addToAlbumId?: unknown };
  const isDetailsUpdate = "title" in body || "description" in body || "visibility" in body;
  if (isDetailsUpdate) {
    const mediaId = typeof body.id === "string" ? body.id.trim() : "";
    // Older local and imported media use UUID-style IDs instead of the newer
    // `media/` and `mux:` prefixes. Parameterized queries keep arbitrary IDs safe.
    if (!mediaId || mediaId.length > 2_048) {
      return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
    }
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
    return NextResponse.json({ media });
  }
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  if (Array.isArray(body.ids) && typeof body.addToAlbumId === "string") {
    if (body.ids.length === 0 || !body.ids.every((id) => typeof id === "string" && (id.startsWith("media/") || id.startsWith("mux:")))) return NextResponse.json({ error: "Invalid media selection." }, { status: 400 });
    await addMediaToAlbum(body.ids, body.addToAlbumId);
    return NextResponse.json({ updated: true });
  }
  if (typeof body.id !== "string" || (!body.id.startsWith("media/") && !body.id.startsWith("mux:")) || !Array.isArray(body.albumIds) || !body.albumIds.every((id) => typeof id === "string")) return NextResponse.json({ error: "Invalid media or album selection." }, { status: 400 });
  await setMediaAlbums(body.id, body.albumIds);
  return NextResponse.json({ updated: true });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete media." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("pathname");
  if (!id) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
  if (id.startsWith("mux:")) {
    await deleteMuxAsset(id.slice("mux:".length));
    if (usesDatabase) await deleteMediaRecord(id);
  } else if (usesBlobStorage) {
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
