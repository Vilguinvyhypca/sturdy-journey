import { NextResponse } from "next/server";
import { readMedia } from "@/lib/db";
import { demoMedia } from "@/lib/media";
import { listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function GET() {
  if (usesBlobStorage) return NextResponse.json({ media: await listBlobMedia() });
  const savedMedia = await readMedia();
  return NextResponse.json({ media: savedMedia.length ? savedMedia : demoMedia });
}
