import { createSign } from "node:crypto";
import type { MuxPlaybackTokens } from "@/lib/media";

const muxTokenId = process.env.MUX_TOKEN_ID;
const muxTokenSecret = process.env.MUX_TOKEN_SECRET;
const muxSigningKeyId = process.env.MUX_SIGNING_KEY_ID;
const muxSigningPrivateKey = process.env.MUX_SIGNING_PRIVATE_KEY ? Buffer.from(process.env.MUX_SIGNING_PRIVATE_KEY, "base64").toString("utf8") : undefined;

export const usesMux = Boolean(muxTokenId && muxTokenSecret);
export const usesMuxSigning = Boolean(muxSigningKeyId && muxSigningPrivateKey);

const configuredMuxLimit = Number.parseInt(process.env.MUX_MAX_STORED_VIDEOS ?? "10", 10);
export const muxMaxStoredVideos = Number.isFinite(configuredMuxLimit) && configuredMuxLimit > 0 ? configuredMuxLimit : 10;

type MuxAsset = {
  id?: unknown;
  status?: unknown;
  duration?: unknown;
  created_at?: unknown;
  playback_ids?: unknown;
};

export type MuxUsageSummary = {
  assetCount: number;
  capacity: number;
  remaining: number;
  storedDurationSeconds: number;
  readyCount: number;
  preparingCount: number;
  erroredCount: number;
  publicPlaybackCount: number;
  signedPlaybackCount: number;
};

function muxHeaders() {
  if (!muxTokenId || !muxTokenSecret) throw new Error("Mux is not configured.");
  return {
    Authorization: `Basic ${Buffer.from(`${muxTokenId}:${muxTokenSecret}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function muxRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.mux.com/video/v1${path}`, {
    ...init,
    headers: { ...muxHeaders(), ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.messages?.[0] ?? body?.error?.message ?? "Mux could not complete that request.");
  return body.data as Record<string, unknown>;
}

export async function getMuxUsageSummary(): Promise<MuxUsageSummary> {
  const assets: MuxAsset[] = [];
  let cursor: string | undefined;

  do {
    const query = new URLSearchParams({ limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const response = await fetch(`https://api.mux.com/video/v1/assets?${query}`, { headers: muxHeaders(), cache: "no-store" });
    const body = await response.json().catch(() => ({})) as { data?: unknown; next_cursor?: unknown; error?: { messages?: string[]; message?: string } };
    if (!response.ok) throw new Error(body.error?.messages?.[0] ?? body.error?.message ?? "Mux usage could not be loaded.");
    if (Array.isArray(body.data)) assets.push(...body.data as MuxAsset[]);
    cursor = typeof body.next_cursor === "string" && body.next_cursor ? body.next_cursor : undefined;
  } while (cursor);

  const statuses = assets.map((asset) => typeof asset.status === "string" ? asset.status : "unknown");
  const playbackPolicies = assets.flatMap((asset) => Array.isArray(asset.playback_ids)
    ? asset.playback_ids.map((playback) => playback && typeof playback === "object" ? (playback as { policy?: unknown }).policy : undefined)
    : []);

  return {
    assetCount: assets.length,
    capacity: muxMaxStoredVideos,
    remaining: Math.max(0, muxMaxStoredVideos - assets.length),
    storedDurationSeconds: assets.reduce((total, asset) => total + (typeof asset.duration === "number" && Number.isFinite(asset.duration) ? asset.duration : 0), 0),
    readyCount: statuses.filter((status) => status === "ready").length,
    preparingCount: statuses.filter((status) => status === "preparing").length,
    erroredCount: statuses.filter((status) => status === "errored").length,
    publicPlaybackCount: playbackPolicies.filter((policy) => policy === "public").length,
    signedPlaybackCount: playbackPolicies.filter((policy) => policy === "signed").length,
  };
}

export async function createMuxUpload(origin: string) {
  return muxRequest("/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: origin,
      new_asset_settings: { playback_policies: [usesMuxSigning ? "signed" : "public"], video_quality: "basic" },
      timeout: 3600,
    }),
  });
}

export async function getMuxUpload(uploadId: string) {
  return muxRequest(`/uploads/${encodeURIComponent(uploadId)}`);
}

export async function getMuxAsset(assetId: string) {
  return muxRequest(`/assets/${encodeURIComponent(assetId)}`);
}

export async function deleteMuxAsset(assetId: string) {
  await muxRequest(`/assets/${encodeURIComponent(assetId)}`, { method: "DELETE" });
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function createMuxToken(playbackId: string, audience: "v" | "t" | "s", expiresInSeconds = 15 * 60) {
  if (!muxSigningKeyId || !muxSigningPrivateKey) throw new Error("Mux signed playback is not configured.");
  if (!/^[A-Za-z0-9_-]+$/.test(playbackId)) throw new Error("Invalid Mux playback ID.");

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", kid: muxSigningKeyId, typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ sub: playbackId, aud: audience, exp: now + expiresInSeconds, iat: now, kid: muxSigningKeyId }));
  const unsignedToken = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256").update(unsignedToken).end().sign(muxSigningPrivateKey);
  return `${unsignedToken}.${base64Url(signature)}`;
}

export function createMuxPlaybackTokens(playbackId: string): MuxPlaybackTokens | undefined {
  if (!usesMuxSigning) return undefined;
  return {
    playback: createMuxToken(playbackId, "v"),
    thumbnail: createMuxToken(playbackId, "t"),
    storyboard: createMuxToken(playbackId, "s"),
  };
}

export function muxThumbnailUrl(playbackId: string, token?: string) {
  if (token) return `https://image.mux.com/${playbackId}/thumbnail.jpg?token=${encodeURIComponent(token)}`;
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0.5&width=640&fit_mode=preserve`;
}