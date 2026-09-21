import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { addMedia, readMedia } from "@/lib/db";
import { findMediaByHash, saveMedia, usesDatabase } from "@/lib/database";
import { deleteStoredLocalMedia, LocalUploadError, maximumLocalUploadBytes, storeLocalUpload, usesLocalStorage } from "@/lib/local-storage";
import type { MediaItem } from "@/lib/media";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return Response.json({ error: "Sign in as the administrator to upload." }, { status: 401 });
  if (!usesLocalStorage) return Response.json({ error: "Local uploads are not enabled." }, { status: 503 });
  const origin = request.headers.get("origin");
  if (origin) {
    let validOrigin = false;
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      const requestHost = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host).split(",")[0].trim().split(":")[0];
      const configuredHosts = (process.env.MEDIA_DEV_ORIGINS ?? "").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean);
      validOrigin = originUrl.origin === requestUrl.origin
        || originUrl.hostname.toLowerCase() === requestHost.toLowerCase()
        || configuredHosts.includes(originUrl.hostname.toLowerCase());
    } catch {
      validOrigin = false;
    }
    if (!validOrigin) return Response.json({ error: "Invalid upload origin." }, { status: 403 });
  }
  if (!request.body) return Response.json({ error: "Choose a file first." }, { status: 400 });
  if (Number(request.headers.get("content-length")) > maximumLocalUploadBytes) return Response.json({ error: "Files must be 500 MB or smaller." }, { status: 413 });
  const contentType = request.headers.get("content-type")?.split(";")[0] ?? "";
  const durationHeader = request.headers.get("x-media-duration");
  const duration = durationHeader ? Number(durationHeader) : NaN;
  if (contentType.startsWith("video/") && (!Number.isFinite(duration) || duration <= 0 || duration > 300)) {
    return Response.json({ error: "Choose a video with a readable duration of five minutes or less." }, { status: 400 });
  }
  let stored: Awaited<ReturnType<typeof storeLocalUpload>> | undefined;
  try {
    const name = decodeURIComponent(request.headers.get("x-media-name") ?? "Untitled media");
    const captured = request.headers.get("x-media-captured-at");
    stored = await storeLocalUpload(request.body, contentType, request.signal);
    request.signal.throwIfAborted();
    const duplicate = usesDatabase ? await findMediaByHash(stored.contentHash) : (await readMedia()).some((item) => item.contentHash === stored?.contentHash);
    if (duplicate) throw new LocalUploadError("That exact photo or video has already been uploaded.", 409);
    const media: MediaItem = {
      id: stored.id, url: stored.url, title: name.replace(/\.[^/.]+$/, "").slice(0, 120) || "Untitled media",
      type: contentType.startsWith("video/") ? "video" : "photo", createdAt: "Just now", album: "Uploads",
      contentHash: stored.contentHash, fileSizeBytes: stored.size, visibility: "private",
      capturedAt: captured && Number.isFinite(Date.parse(captured)) ? new Date(captured).toISOString() : null,
      durationSeconds: contentType.startsWith("video/") ? Math.round(duration) : null,
    };
    if (usesDatabase) await saveMedia(media, stored.storage);
    else await addMedia(media, stored.storage);
    return Response.json({ media }, { status: 201 });
  } catch (error) {
    if (stored) await deleteStoredLocalMedia(stored.storage.objectKey);
    if (error instanceof LocalUploadError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Local upload failed", error);
    return Response.json({ error: "The server could not save this upload. Check local storage configuration and disk space." }, { status: 500 });
  }
}
