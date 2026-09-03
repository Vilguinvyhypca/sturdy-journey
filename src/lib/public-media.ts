import "server-only";

import { readMedia } from "@/lib/db";
import { listDatabaseMedia, usesDatabase } from "@/lib/database";
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

export async function getInitialPublicMedia(type?: MediaItem["type"]): Promise<MediaItem[]> {
  const media = usesDatabase
    ? await listDatabaseMedia(false)
    : (await readMedia()).filter((item) => (item.visibility ?? "public") === "public");
  const availableMedia = media.length || usesDatabase ? media : demoMedia;
  return availableMedia
    .filter((item) => !type || item.type === type)
    .map(withPublicDelivery);
}
