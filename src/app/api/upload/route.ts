import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { addMedia, readMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { findMediaByHash, saveMedia, usesDatabase } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { uploadMedia, usesBlobStorage } from "@/lib/storage";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to upload." }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return NextResponse.json({ error: "Only photos and videos are supported." }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Files must be 50 MB or smaller for this local demo." }, { status: 413 });
  const contentHash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  if (usesDatabase && await findMediaByHash(contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });
  if (!usesBlobStorage && (await readMedia()).some((media) => media.contentHash === contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });

  const storedMedia = await uploadMedia(file);
  const media: MediaItem = {
    id: storedMedia.id,
    title: file.name.replace(/\.[^/.]+$/, ""),
    type: file.type.startsWith("video/") ? "video" : "photo",
    url: storedMedia.url,
    createdAt: "Just now",
    album: "Uploads",
    contentHash,
  };
  if (usesDatabase) await saveMedia(media);
  else if (!usesBlobStorage) await addMedia(media);
  return NextResponse.json({ media }, { status: 201 });
}
