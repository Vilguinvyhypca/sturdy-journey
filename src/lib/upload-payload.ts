import { normalizeOriginalFileName } from "./media";

export type ClientMediaPayload = {
  contentHash: string;
  capturedAt: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number;
  title: string;
  originalFileName: string;
  mediaType: "photo" | "video";
};

export function readClientPayload(value: string | null): ClientMediaPayload {
  if (!value) throw new Error("Missing upload details.");
  const payload = JSON.parse(value) as Partial<ClientMediaPayload>;
  if (typeof payload.contentHash !== "string" || !/^[a-f0-9]{64}$/i.test(payload.contentHash)) throw new Error("Invalid file fingerprint.");
  if (typeof payload.title !== "string" || payload.title.length === 0 || payload.title.length > 200) throw new Error("Invalid file name.");
  const originalFileName = normalizeOriginalFileName(typeof payload.originalFileName === "string" ? payload.originalFileName : payload.title);
  if (!originalFileName) throw new Error("Invalid original file name.");
  if (typeof payload.fileSizeBytes !== "number" || !Number.isFinite(payload.fileSizeBytes) || payload.fileSizeBytes <= 0) throw new Error("Invalid file size.");
  if (payload.mediaType !== "photo" && payload.mediaType !== "video") throw new Error("Invalid media type.");
  const capturedAt = typeof payload.capturedAt === "string" && !Number.isNaN(Date.parse(payload.capturedAt)) ? new Date(payload.capturedAt).toISOString() : null;
  const durationSeconds = typeof payload.durationSeconds === "number" && Number.isFinite(payload.durationSeconds) && payload.durationSeconds >= 0 ? Math.round(payload.durationSeconds) : null;
  return { contentHash: payload.contentHash, capturedAt, durationSeconds, fileSizeBytes: payload.fileSizeBytes, title: payload.title, originalFileName, mediaType: payload.mediaType };
}
