import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { addMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { saveMedia, usesDatabase } from "@/lib/database";
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

  const storedMedia = await uploadMedia(file);
  const media: MediaItem = {
    id: storedMedia.id,
    title: file.name.replace(/\.[^/.]+$/, ""),
    type: file.type.startsWith("video/") ? "video" : "photo",
    url: storedMedia.url,
    createdAt: "Just now",
    album: "Uploads",
  };
  if (usesDatabase) await saveMedia(media);
  else if (!usesBlobStorage) await addMedia(media);
  return NextResponse.json({ media }, { status: 201 });
}
