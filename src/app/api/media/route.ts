import { NextResponse } from "next/server";
import { readMedia } from "@/lib/db";
import { demoMedia } from "@/lib/media";

export async function GET() {
  const savedMedia = await readMedia();
  return NextResponse.json({ media: savedMedia.length ? savedMedia : demoMedia });
}
