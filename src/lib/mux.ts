const muxTokenId = process.env.MUX_TOKEN_ID;
const muxTokenSecret = process.env.MUX_TOKEN_SECRET;

export const usesMux = Boolean(muxTokenId && muxTokenSecret);

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

export async function createMuxUpload(origin: string) {
  return muxRequest("/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: origin,
      new_asset_settings: { playback_policies: ["public"], video_quality: "basic" },
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

export function muxThumbnailUrl(playbackId: string) {
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0.5&width=640&fit_mode=preserve`;
}
