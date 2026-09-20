import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { attachMuxUploadId, createMuxUploadIntent, findMediaByHash, getMediaById, getMuxUploadIntent, markMuxUploadErrored, usesDatabase } from "@/lib/database";
import { createMuxPlaybackTokens, createMuxUpload, getMuxUsageSummary, usesMux, usesMuxWebhooks } from "@/lib/mux";
import { isSignedMuxUrl, muxPlaybackIdFromUrl } from "@/lib/media";

const maximumVideoDurationSeconds = 5 * 60;

type UploadDetails = {
  contentHash: string;
  title: string;
  capturedAt: string | null;
  durationSeconds: number;
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
  if (!usesMuxWebhooks) return NextResponse.json({ error: "Mux webhook finalization is not configured yet." }, { status: 503 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is required for Mux videos." }, { status: 503 });

  try {
    const body = await request.json() as { action?: string; details?: unknown };
    if (body.action === "create") {
      const details = readDetails(body.details);
      if (await findMediaByHash(details.contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });
      const usage = await getMuxUsageSummary();
      if (usage.assetCount >= usage.capacity) {
        return NextResponse.json({ error: `Mux video capacity is full (${usage.assetCount} of ${usage.capacity}). Delete an unused video before uploading another.` }, { status: 429 });
      }
      const intentId = randomUUID();
      try {
        await createMuxUploadIntent({ id: intentId, ...details, durationSeconds: details.durationSeconds });
      } catch (error) {
        if (error instanceof Error && error.message.includes("mux_uploads_pending_hash_unique")) {
          return NextResponse.json({ error: "That exact video is already uploading." }, { status: 409 });
        }
        throw error;
      }
      try {
        const upload = await createMuxUpload(new URL(request.url).origin, intentId);
        if (typeof upload.id !== "string" || typeof upload.url !== "string") throw new Error("Mux did not return a valid upload URL.");
        await attachMuxUploadId(intentId, upload.id);
        return NextResponse.json({ intentId, uploadUrl: upload.url });
      } catch (error) {
        await markMuxUploadErrored(intentId, error instanceof Error ? error.message : "Mux could not create the upload.");
        throw error;
      }
    }
    return NextResponse.json({ error: "Invalid Mux upload request." }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mux could not prepare this upload." }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to check an upload." }, { status: 401 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is required for Mux videos." }, { status: 503 });
  const intentId = new URL(request.url).searchParams.get("intentId")?.trim();
  if (!intentId || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(intentId)) {
    return NextResponse.json({ error: "Invalid upload status request." }, { status: 400 });
  }
  const intent = await getMuxUploadIntent(intentId);
  if (!intent) return NextResponse.json({ error: "Upload not found." }, { status: 404 });
  if (intent.status === "errored") return NextResponse.json({ error: intent.errorMessage ?? "Mux could not process this video." }, { status: 422 });
  if (intent.status !== "ready" || !intent.assetId) return NextResponse.json({ processing: true });
  const media = await getMediaById(`mux:${intent.assetId}`);
  if (!media) return NextResponse.json({ processing: true });
  const playbackId = muxPlaybackIdFromUrl(media.url);
  return NextResponse.json({ media: playbackId && isSignedMuxUrl(media.url) ? { ...media, muxTokens: createMuxPlaybackTokens(playbackId) } : media });
}
