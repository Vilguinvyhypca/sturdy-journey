import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { addMedia, readMedia } from "@/lib/db";
import { authOptions, isAdmin } from "@/lib/auth";
import { findMediaByHash, saveMedia, usesDatabase } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { uploadMedia, usesBlobStorage } from "@/lib/storage";
import { readClientPayload } from "@/lib/upload-payload";

const maximumVideoDurationSeconds = 5 * 60;

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    if (!usesBlobStorage) return NextResponse.json({ error: "Cloud uploads are not configured." }, { status: 503 });
    const body = await request.json() as HandleUploadBody;
    try {
      const jsonResponse = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          const session = await getServerSession(authOptions);
          if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) throw new Error("Sign in as the administrator to upload.");
          if (!pathname.startsWith("media/") || pathname.slice("media/".length).includes("/")) throw new Error("Invalid upload path.");
          const payload = readClientPayload(clientPayload);
          if (payload.mediaType === "video" && payload.durationSeconds === null) throw new Error("This video's duration could not be checked. Choose a video with a readable duration.");
          if (payload.mediaType === "video" && payload.durationSeconds !== null && payload.durationSeconds > maximumVideoDurationSeconds) throw new Error("Videos must be five minutes or shorter.");
          if (usesDatabase && await findMediaByHash(payload.contentHash)) throw new Error("That exact photo or video has already been uploaded.");
          return {
            allowedContentTypes: ["image/*", "video/*"],
            maximumSizeInBytes: 500 * 1024 * 1024,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify(payload),
          };
        },
        onUploadCompleted: async ({ blob, tokenPayload }) => {
          const payload = readClientPayload(tokenPayload ?? null);
          const type = blob.contentType.startsWith("video/") ? "video" : "photo";
          const media: MediaItem = {
            id: blob.pathname,
            title: payload.title,
            originalFileName: payload.originalFileName,
            type,
            url: blob.url,
            createdAt: "Just now",
            album: "Uploads",
            contentHash: payload.contentHash,
            capturedAt: type === "photo" ? payload.capturedAt : null,
            durationSeconds: type === "video" ? payload.durationSeconds : null,
            fileSizeBytes: payload.fileSizeBytes,
            visibility: "private",
          };
          if (usesDatabase) await saveMedia(media);
        },
      });
      return NextResponse.json(jsonResponse);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Could not prepare this upload." }, { status: 400 });
    }
  }

  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to upload." }, { status: 401 });
  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file first." }, { status: 400 });
  if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) return NextResponse.json({ error: "Only photos and videos are supported." }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "Files must be 50 MB or smaller for this local demo." }, { status: 413 });
  const capturedAtValue = formData.get("capturedAt");
  const capturedAt = typeof capturedAtValue === "string" && !Number.isNaN(Date.parse(capturedAtValue)) ? new Date(capturedAtValue).toISOString() : null;
  const durationValue = Number(formData.get("durationSeconds"));
  const durationSeconds = Number.isFinite(durationValue) && durationValue >= 0 ? Math.round(durationValue) : null;
  if (file.type.startsWith("video/") && durationSeconds === null) return NextResponse.json({ error: "This video's duration could not be checked. Choose a video with a readable duration." }, { status: 413 });
  if (file.type.startsWith("video/") && durationSeconds !== null && durationSeconds > maximumVideoDurationSeconds) return NextResponse.json({ error: "Videos must be five minutes or shorter." }, { status: 413 });
  const contentHash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
  if (usesDatabase && await findMediaByHash(contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });
  if (!usesBlobStorage && (await readMedia()).some((media) => media.contentHash === contentHash)) return NextResponse.json({ error: "That exact photo or video has already been uploaded." }, { status: 409 });

  const storedMedia = await uploadMedia(file);
  const media: MediaItem = {
    id: storedMedia.id,
    title: file.name.replace(/\.[^/.]+$/, ""),
    originalFileName: file.name,
    type: file.type.startsWith("video/") ? "video" : "photo",
    url: storedMedia.url,
    createdAt: "Just now",
    album: "Uploads",
    contentHash,
    capturedAt,
    durationSeconds,
    fileSizeBytes: file.size,
    visibility: "private",
  };
  if (usesDatabase) await saveMedia(media);
  else if (!usesBlobStorage) await addMedia(media);
  return NextResponse.json({ media }, { status: 201 });
}
