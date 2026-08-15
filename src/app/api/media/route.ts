import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { readMedia, removeMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { demoMedia } from "@/lib/media";
import { deleteLocalMedia, listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function GET() {
  if (usesBlobStorage) return NextResponse.json({ media: await listBlobMedia() });
  const savedMedia = await readMedia();
  return NextResponse.json({ media: savedMedia.length ? savedMedia : demoMedia });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete media." }, { status: 401 });
  const id = new URL(request.url).searchParams.get("pathname");
  if (!id) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
  if (usesBlobStorage) {
    if (!id.startsWith("media/")) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
    await del(id);
  } else {
    const item = (await readMedia()).find((media) => media.id === id);
    if (!item) return NextResponse.json({ error: "Media item not found." }, { status: 404 });
    await deleteLocalMedia(item.url);
    await removeMedia(item.id);
  }
  return NextResponse.json({ deleted: true });
}
