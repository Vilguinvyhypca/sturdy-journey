import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { del, get, list, put } from "@vercel/blob";
import type { MediaItem } from "./media";

const uploadDirectory = join(process.cwd(), "public", "uploads");
// Vercel provides either a legacy read-write token or its newer OIDC store connection.
export const usesBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);
const privateBlobToken = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
const privateBlobStoreId = process.env.PRIVATE_BLOB_STORE_ID;
export const usesPrivateBlobStorage = Boolean(privateBlobToken || privateBlobStoreId);

export type StoredMedia = {
  id: string;
  url: string;
};

function isVideo(pathname: string) {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(pathname);
}

function displayTitle(pathname: string) {
  const filename = decodeURIComponent(pathname.split("/").pop() ?? "Untitled media");
  return filename.replace(/\.[^/.]+$/, "").replace(/-[a-z0-9]{10,}$/i, "");
}

export async function uploadMedia(file: File): Promise<StoredMedia> {
  if (usesBlobStorage) {
    const blob = await put(`media/${file.name}`, file, { access: "public", addRandomSuffix: true });
    return { id: blob.pathname, url: blob.url };
  }

  await mkdir(uploadDirectory, { recursive: true });
  const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(join(uploadDirectory, fileName), Buffer.from(await file.arrayBuffer()));
  return { id: randomUUID(), url: `/uploads/${fileName}` };
}

export async function listBlobMedia(): Promise<MediaItem[]> {
  if (!usesBlobStorage) return [];
  const { blobs } = await list({ prefix: "media/" });
  return blobs
    .sort((a, b) => b.uploadedAt.getTime() - a.uploadedAt.getTime())
    .map((blob) => ({
      id: blob.pathname,
      title: displayTitle(blob.pathname),
      type: isVideo(blob.pathname) ? "video" : "photo",
      url: blob.url,
      createdAt: blob.uploadedAt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      album: "Uploads",
      visibility: "private",
    }));
}

export async function deleteLocalMedia(url: string) {
  if (!url.startsWith("/uploads/")) throw new Error("Invalid local media path.");
  await rm(join(uploadDirectory, basename(url)), { force: true });
}

export function isPrivateBlobUrl(url: string) {
  return /^https:\/\/[^/]+\.private\.blob\.vercel-storage\.com\//i.test(url);
}

export async function getPrivateBlob(url: string, ifNoneMatch?: string) {
  if (!privateBlobToken) throw new Error("Private Blob storage is not configured.");
  return get(url, { access: "private", token: privateBlobToken, ifNoneMatch });
}

export async function deletePrivateBlob(url: string) {
  if (!privateBlobToken) throw new Error("Private Blob storage is not configured.");
  await del(url, { token: privateBlobToken });
}