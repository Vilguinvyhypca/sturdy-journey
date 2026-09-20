import { NextResponse } from "next/server";
import { finalizeMuxUpload, markMuxUploadErrored, recordMuxWebhookEvent, usesDatabase } from "@/lib/database";
import { muxWebhookSecret } from "@/lib/mux";
import { verifyMuxWebhookSignature } from "@/lib/mux-webhook";

export const dynamic = "force-dynamic";

type MuxWebhookEvent = {
  id?: unknown;
  type?: unknown;
  data?: unknown;
};

function eventData(value: unknown) {
  return value && typeof value === "object" ? value as Record<string, unknown> : null;
}

function externalId(data: Record<string, unknown>) {
  const meta = eventData(data.meta);
  const value = meta?.external_id;
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export async function POST(request: Request) {
  if (!muxWebhookSecret || !usesDatabase) return NextResponse.json({ error: "Mux webhooks are not configured." }, { status: 503 });
  const rawBody = await request.text();
  if (!verifyMuxWebhookSignature(rawBody, request.headers.get("mux-signature"), muxWebhookSecret)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: MuxWebhookEvent;
  try {
    event = JSON.parse(rawBody) as MuxWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload." }, { status: 400 });
  }
  if (typeof event.id !== "string" || typeof event.type !== "string") {
    return NextResponse.json({ error: "Invalid webhook event." }, { status: 400 });
  }

  const data = eventData(event.data);
  const intentId = data ? externalId(data) : null;
  try {
    if (event.type === "video.asset.ready" && data && intentId) {
      const assetId = typeof data.id === "string" ? data.id : null;
      const duration = typeof data.duration === "number" && Number.isFinite(data.duration) ? data.duration : null;
      const playbackIds = Array.isArray(data.playback_ids) ? data.playback_ids : [];
      const playback = playbackIds
        .map(eventData)
        .find((item) => item && (item.policy === "signed" || item.policy === "public") && typeof item.id === "string");
      if (!assetId || duration === null || !playback || typeof playback.id !== "string") {
        return NextResponse.json({ error: "Ready asset is missing required playback data." }, { status: 422 });
      }
      await finalizeMuxUpload({ intentId, assetId, playbackId: playback.id, signed: playback.policy === "signed", durationSeconds: duration });
    } else if (event.type === "video.asset.errored" && data && intentId) {
      const errors = eventData(data.errors);
      const messages = Array.isArray(errors?.messages) ? errors.messages.filter((message): message is string => typeof message === "string") : [];
      await markMuxUploadErrored(intentId, messages.join(" ") || "Mux could not process this video.");
    }
    await recordMuxWebhookEvent(event.id, event.type);
    return NextResponse.json({ received: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Webhook processing failed." }, { status: 500 });
  }
}
