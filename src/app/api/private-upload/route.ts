import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { findMediaByHash, getMediaById, saveMedia, usesDatabase } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { privatePhotoDeliveryUrl } from "@/lib/media";
import { isPrivateBlobUrl, usesPrivateBlobStorage } from "@/lib/storage";
import { readClientPayload } from "@/lib/upload-payload";
import { limitAdminAction } from "@/lib/rate-limit";

const privateBlobToken = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
const privateBlobStoreId = process.env.PRIVATE_BLOB_STORE_ID;
const privateBlobWebhookPublicKey = process.env.PRIVATE_BLOB_WEBHOOK_PUBLIC_KEY;
const maximumPhotoSize = 100 * 1024 * 1024;

export async function GET(request: Request) {
  if (!usesPrivateBlobStorage || !usesDatabase) return NextResponse.json({ error: "Private photo storage is not configured." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to check this upload." }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || id.length > 2_048 || !id.startsWith("protected-media/")) return NextResponse.json({ error: "Invalid photo upload." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  const limited = await limitAdminAction("poll");
  if (limited) return limited;
  const media = await getMediaById(id);
  if (!media) return NextResponse.json({ processing: true }, { status: 202, headers: { "Cache-Control": "private, no-store", "Retry-After": "2" } });
  if (media.type !== "photo" || media.visibility !== "private" || !isPrivateBlobUrl(media.url)) return NextResponse.json({ error: "Photo upload is invalid." }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
  return NextResponse.json({ media: { ...media, url: privatePhotoDeliveryUrl(media) } }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  if (!usesPrivateBlobStorage) {
    return NextResponse.json({ error: "Private photo storage is not configured yet." }, { status: 503 });
  }
  if (!usesDatabase) {
    return NextResponse.json({ error: "The database is required for protected photo uploads." }, { status: 503 });
  }

  const body = (await request.json()) as HandleUploadPresignedBody;
  try {
    const jsonResponse = await handleUploadPresigned({
      body,
      request,
      webhookPublicKey: privateBlobWebhookPublicKey,
      getSignedToken: async (pathname, clientPayload) => {
        const session = await getServerSession(authOptions);
        if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
          throw new Error("Sign in as the administrator to upload.");
        }
        if (!pathname.startsWith("protected-media/") || pathname.slice("protected-media/".length).includes("/")) {
          throw new Error("Invalid protected photo path.");
        }
        const payload = readClientPayload(clientPayload);
        if (payload.mediaType !== "photo") {
          throw new Error("Only photos can use protected photo storage.");
        }
        if (await findMediaByHash(payload.contentHash)) {
          throw new Error("That exact photo or video has already been uploaded.");
        }
        const token = await issueSignedToken({
          token: privateBlobToken,
          storeId: privateBlobStoreId,
          pathname,
          operations: ["put"],
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: maximumPhotoSize,
        });
        return {
          token,
          urlOptions: {
            allowedContentTypes: ["image/*"],
            maximumSizeInBytes: maximumPhotoSize,
            addRandomSuffix: true,
            tokenPayload: JSON.stringify(payload),
          },
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = readClientPayload(tokenPayload ?? null);
        const media: MediaItem = {
          id: blob.pathname,
          title: payload.title,
          originalFileName: payload.originalFileName,
          type: "photo",
          url: blob.url,
          createdAt: "Just now",
          album: "Uploads",
          contentHash: payload.contentHash,
          capturedAt: payload.capturedAt,
          durationSeconds: null,
          fileSizeBytes: payload.fileSizeBytes,
          visibility: "private",
        };
        await saveMedia(media);
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not prepare this protected photo upload." },
      { status: 400 },
    );
  }
}
