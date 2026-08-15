import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { addMedia } from "@/lib/db";
import { uploadMedia } from "@/lib/storage";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return NextResponse.json({ error: "Only photos and videos are supported." }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Files must be 50 MB or smaller for this local demo." }, { status: 413 });

  const media = await addMedia({
    id: randomUUID(),
    title: file.name.replace(/\.[^/.]+$/, ""),
    type: file.type.startsWith("video/") ? "video" : "photo",
    url: await uploadMedia(file),
    createdAt: "Just now",
    album: "Uploads",
  });
  return NextResponse.json({ media }, { status: 201 });
}
