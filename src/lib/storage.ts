import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { list, put } from "@vercel/blob";
import type { MediaItem } from "./media";

const uploadDirectory = join(process.cwd(), "public", "uploads");
// Vercel provides either a legacy read-write token or its newer OIDC store connection.
export const usesBlobStorage = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

function isVideo(pathname: string) {
  return /\.(mp4|webm|mov|m4v|ogv)$/i.test(pathname);
}

function displayTitle(pathname: string) {
  const filename = decodeURIComponent(pathname.split("/").pop() ?? "Untitled media");
  return filename.replace(/\.[^/.]+$/, "").replace(/-[a-z0-9]{10,}$/i, "");
}

export async function uploadMedia(file: File) {
  if (usesBlobStorage) {
    const blob = await put(`media/${file.name}`, file, { access: "public", addRandomSuffix: true });
    return blob.url;
  }

  await mkdir(uploadDirectory, { recursive: true });
  const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(join(uploadDirectory, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${fileName}`;
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
    }));
}
