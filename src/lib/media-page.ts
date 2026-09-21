import type { MediaPage } from "./database";
import type { MediaItem } from "./media";
import { galleryPageSize } from "./media";

export function paginateMedia(items: MediaItem[], limit = galleryPageSize, cursor?: string | null): MediaPage {
  const pageSize = Number.isFinite(limit) ? Math.min(Math.max(Math.trunc(limit), 1), 100) : galleryPageSize;
  let start = 0;
  if (cursor) {
    if (!/^[A-Za-z0-9_-]{1,4096}$/.test(cursor)) throw new Error("Invalid media cursor.");
    const id = Buffer.from(cursor, "base64url").toString("utf8");
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error("Media cursor no longer exists. Refresh the library.");
    start = index + 1;
  }
  const media = items.slice(start, start + pageSize);
  const last = media.at(-1);
  const known = items.filter((item) => typeof item.fileSizeBytes === "number");
  return {
    media,
    nextCursor: start + media.length < items.length && last ? Buffer.from(last.id, "utf8").toString("base64url") : null,
    totalCount: items.length,
    photoCount: items.filter((item) => item.type === "photo").length,
    videoCount: items.filter((item) => item.type === "video").length,
    knownSizeCount: known.length,
    knownStorageBytes: known.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0),
  };
}
