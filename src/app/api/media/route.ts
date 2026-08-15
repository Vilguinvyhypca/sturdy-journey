import { NextResponse } from "next/server";
import { del } from "@vercel/blob";
import { getServerSession } from "next-auth";
import { readMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { demoMedia } from "@/lib/media";
import { listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function GET() {
  if (usesBlobStorage) return NextResponse.json({ media: await listBlobMedia() });
  const savedMedia = await readMedia();
  return NextResponse.json({ media: savedMedia.length ? savedMedia : demoMedia });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete media." }, { status: 401 });
  const pathname = new URL(request.url).searchParams.get("pathname");
  if (!pathname?.startsWith("media/")) return NextResponse.json({ error: "Invalid media item." }, { status: 400 });
  await del(pathname);
  return NextResponse.json({ deleted: true });
}
