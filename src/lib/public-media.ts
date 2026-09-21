import { usesLocalStorage } from "@/lib/local-storage";
import "server-only";

import { readMedia } from "@/lib/db";
import { listDatabaseMediaPage, usesDatabase, type MediaPage } from "@/lib/database";
import { createMuxPlaybackTokens } from "@/lib/mux";
import {
  demoMedia,
  isSignedMuxUrl,
  muxPlaybackIdFromUrl,
  privatePhotoDeliveryUrl,
  type MediaItem,
} from "@/lib/media";
import { isPrivateBlobUrl } from "@/lib/storage";

function withPublicDelivery(item: MediaItem): MediaItem {
  if (isSignedMuxUrl(item.url)) {
    const playbackId = muxPlaybackIdFromUrl(item.url);
    return playbackId ? { ...item, muxTokens: createMuxPlaybackTokens(playbackId) } : item;
  }
  if (item.type === "photo" && isPrivateBlobUrl(item.url)) {
    return { ...item, url: privatePhotoDeliveryUrl(item) };
  }
  return item;
}

export async function getInitialPublicMedia(type?: MediaItem["type"]): Promise<MediaPage> {
  if (usesDatabase) {
    const page = await listDatabaseMediaPage({ type });
    return { ...page, media: page.media.map(withPublicDelivery) };
  }
  const saved = await readMedia();
  const media = saved.filter((item) => (item.visibility ?? "public") === "public");
  const availableMedia = saved.length || usesLocalStorage ? media : demoMedia;
  const filtered = availableMedia
    .filter((item) => !type || item.type === type)
    .map(withPublicDelivery);
  const known = filtered.filter((item) => typeof item.fileSizeBytes === "number");
  return { media: filtered, nextCursor: null, totalCount: filtered.length, photoCount: filtered.filter((item) => item.type === "photo").length, videoCount: filtered.filter((item) => item.type === "video").length, knownSizeCount: known.length, knownStorageBytes: known.reduce((total, item) => total + (item.fileSizeBytes ?? 0), 0) };
}
