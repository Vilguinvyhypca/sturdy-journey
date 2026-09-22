import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, join, relative } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { MediaStorageRecord } from "./media-storage";

export const usesLocalStorage = process.env.MEDIA_UPLOAD_PROVIDER === "local";
export const maximumLocalUploadBytes = 500 * 1024 * 1024;
const formats: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
  "image/webp": "webp", "image/avif": "avif",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
};
const keyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|gif|webp|avif|mp4|webm|mov)(\.web\.mp4)?$/;

export class LocalUploadError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function storageRoot() {
  const configured = process.env.MEDIA_STORAGE_ROOT;
  if (!configured || !isAbsolute(configured)) throw new Error("MEDIA_STORAGE_ROOT must be an absolute path outside the repository.");
  await mkdir(configured, { recursive: true, mode: 0o700 });
  const root = await realpath(configured);
  const repository = await realpath(process.cwd());
  const child = relative(repository, root);
  if (!child || (!child.startsWith("../") && child !== ".." && !isAbsolute(child))) {
    throw new Error("MEDIA_STORAGE_ROOT must be outside the repository.");
  }
  return root;
}

async function objectPath(key: string) {
  if (!keyPattern.test(key)) throw new Error("Invalid local storage key.");
  return join(await storageRoot(), key);
}

export async function storeLocalUpload(body: ReadableStream<Uint8Array>, contentType: string, signal?: AbortSignal) {
  const extension = formats[contentType];
  if (!extension) throw new LocalUploadError("Choose a JPEG, PNG, GIF, WebP, AVIF, MP4, WebM, or MOV file.", 415);
  const id = randomUUID();
  const key = `${id}.${extension}`;
  const path = await objectPath(key);
  const file = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(Readable.fromWeb(body as import("node:stream/web").ReadableStream), new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        size += chunk.length;
        if (size > maximumLocalUploadBytes) return callback(new LocalUploadError("Files must be 500 MB or smaller.", 413));
        hash.update(chunk);
        callback(null, chunk);
      },
    }), file.createWriteStream(), { signal });
    if (!size) throw new LocalUploadError("The selected file is empty.", 400);
    return {
      id: `local:${id}`, url: `/api/local-media?id=${encodeURIComponent(`local:${id}`)}`,
      size, contentHash: hash.digest("hex"),
      storage: { provider: "local", objectKey: key, playbackId: null, access: "private" } as MediaStorageRecord,
    };
  } catch (error) {
    await file.close().catch(() => undefined);
    await unlink(path).catch(() => undefined);
    throw error;
  }
}

export async function deleteStoredLocalMedia(key: string) {
  await unlink(await objectPath(key)).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await unlink(`${await objectPath(key)}.jpg`).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await unlink(`${await objectPath(key)}.web.mp4`).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
}

export async function generateLocalThumbnail(key: string) {
  const source = await objectPath(key);
  const destination = `${source}.jpg`;
  const temporary = `${destination}.${randomUUID()}.jpg`;
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", source, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", "-y", temporary], { stdio: "ignore" });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with status ${code}`)));
    });
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function generateLocalPlayback(key: string) {
  const source = await objectPath(key);
  const destination = `${source}.web.mp4`;
  const temporary = `${destination}.${randomUUID()}.tmp.mp4`;
  try {
    const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", source]);
    const videoCodec = stdout.trim();
    const codecArgs = videoCodec === "h264" ? ["-c:v", "copy", "-c:a", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k"];
    await new Promise<void>((resolve, reject) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", source, "-map", "0:v:0", "-map", "0:a?", ...codecArgs, "-movflags", "+faststart", "-y", temporary], { stdio: "ignore" });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with status ${code}`)));
    });
    await rename(temporary, destination);
    return `${key}.web.mp4`;
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function localThumbnailResponse(key: string) {
  const file = await open(`${await objectPath(key)}.jpg`, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Not a thumbnail.");
    return new Response(Readable.toWeb(file.createReadStream({ autoClose: true })) as ReadableStream, {
      headers: { "Content-Type": "image/jpeg", "Content-Length": String(stat.size), "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" },
    });
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}

export function byteRange(header: string | null, size: number): { start: number; end: number } | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return "invalid";
  const first = match[1] ? Number(match[1]) : null;
  const last = match[2] ? Number(match[2]) : null;
  if ((first !== null && !Number.isSafeInteger(first)) || (last !== null && !Number.isSafeInteger(last))) return "invalid";
  const start = first ?? Math.max(0, size - (last ?? 0));
  const end = first === null ? size - 1 : Math.min(last ?? size - 1, size - 1);
  return start >= size || start > end ? "invalid" : { start, end };
}

/** Caller must authorize the catalog record before opening any file. */
export async function localMediaResponse(key: string, request: Request) {
  const file = await open(await objectPath(key), constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new Error("Not a media file.");
    const extension = key.split(".").at(-1);
    const contentType = Object.entries(formats).find(([, value]) => value === extension)?.[0] ?? "application/octet-stream";
    const headers = new Headers({
      "Content-Type": contentType, "Accept-Ranges": "bytes", "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    });
    // Without validators, If-Range requires a complete response. Range applies only to GET.
    const range = byteRange(request.method === "HEAD" || request.headers.has("if-range") ? null : request.headers.get("range"), stat.size);
    if (range === "invalid") {
      await file.close();
      headers.set("Content-Range", `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? stat.size - 1;
    headers.set("Content-Length", String(Math.max(0, end - start + 1)));
    if (range) headers.set("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    if (request.method === "HEAD" || stat.size === 0) {
      await file.close();
      return new Response(null, { headers });
    }
    const stream = file.createReadStream({ start, end, autoClose: true });
    return new Response(Readable.toWeb(stream) as ReadableStream, { status: range ? 206 : 200, headers });
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}
