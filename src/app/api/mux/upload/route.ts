import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { findMediaByHash, saveMedia, usesDatabase } from "@/lib/database";
import { createMuxUpload, getMuxAsset, getMuxUpload, usesMux } from "@/lib/mux";
import type { MediaItem } from "@/lib/media";

const maximumVideoDurationSeconds = 5 * 60;

type UploadDetails = {
  contentHash: string;
  title: string;
  capturedAt: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number;
};

function readDetails(value: unknown): UploadDetails {
  if (!value || typeof value !== "object") throw new Error("Missing video details.");
  const details = value as Partial<UploadDetails>;
  if (typeof details.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(details.contentHash)) throw new Error("Invalid video fingerprint.");
  if (typeof details.title !== "string" || details.title.length === 0 || details.title.length > 200) throw new Error("Invalid video name.");
  if (typeof details.fileSizeBytes !== "number" || !Number.isFinite(details.fileSizeBytes) || details.fileSizeBytes <= 0) throw new Error("Invalid video size.");
  if (typeof details.durationSeconds !== "number" || !Number.isFinite(details.durationSeconds) || details.durationSeconds < 0) throw new Error("This video's duration could not be checked.");
  if (details.durationSeconds > maximumVideoDurationSeconds) throw new Error("Videos must be five minutes or shorter.");
  const capturedAt = typeof details.capturedAt === "string" && !Number.isNaN(Date.parse(details.capturedAt)) ? new Date(details.capturedAt).toISOString() : null;
  return { contentHash: details.contentHash, title: details.title, capturedAt, durationSeconds: Math.round(details.durationSeconds), fileSizeBytes: details.fileSizeBytes };
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to upload." }, { status: 401 });
  if (!usesMux) return NextResponse.json({ error: "Mux is not configured yet." }, { status: 503 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is required for Mux videos." }, { status: 503 });

  try {
    const body = await request.json() as { action?: string; details?: unknown; uploadId?: unknown };
    if (body.action === "create") {
      const details = readDetails(body.details);
      if (await findMediaByHash(details.contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });
      const upload = await createMuxUpload(new URL(request.url).origin);
      return NextResponse.json({ uploadId: upload.id, uploadUrl: upload.url });
    }
    if (body.action === "complete" && typeof body.uploadId === "string") {
      const details = readDetails(body.details);
      const upload = await getMuxUpload(body.uploadId);
      const assetId = typeof upload.asset_id === "string" ? upload.asset_id : null;
      if (!assetId) return NextResponse.json({ processing: true });
      const asset = await getMuxAsset(assetId);
      const playback = Array.isArray(asset.playback_ids) ? asset.playback_ids.find((item) => item && typeof item === "object" && (item as { policy?: string }).policy === "public") as { id?: string } | undefined : undefined;
      if (!playback?.id) return NextResponse.json({ processing: true });
      const media: MediaItem = { id: `mux:${assetId}`, title: details.title, type: "video", url: `mux:${playback.id}`, createdAt: "Just now", album: "Uploads", contentHash: details.contentHash, capturedAt: null, durationSeconds: details.durationSeconds, fileSizeBytes: details.fileSizeBytes };
      await saveMedia(media);
      return NextResponse.json({ media });
    }
    return NextResponse.json({ error: "Invalid Mux upload request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mux could not prepare this upload." }, { status: 400 });
  }
}
