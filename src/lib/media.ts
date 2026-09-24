export type MediaItem = {
  id: string;
  profileId?: string;
  title: string;
  description?: string;
  type: "photo" | "video";
  url: string;
  createdAt: string;
  album: string;
  albumIds?: string[];
  contentHash?: string;
  capturedAt?: string | null;
  durationSeconds?: number | null;
  fileSizeBytes?: number;
  visibility?: MediaVisibility;
  muxTokens?: MuxPlaybackTokens;
};

export type MuxPlaybackTokens = {
  playback: string;
  thumbnail: string;
  storyboard: string;
};

export type MediaVisibility = "public" | "unlisted" | "private";

export const galleryPageSize = 12;

export function muxPlaybackIdFromUrl(url: string) {
  if (url.startsWith("mux-signed:")) return url.slice("mux-signed:".length);
  if (url.startsWith("mux:")) return url.slice("mux:".length);
  return null;
}

export function isSignedMuxUrl(url: string) {
  return url.startsWith("mux-signed:");
}

export function privatePhotoDeliveryUrl(item: MediaItem) {
  return `/api/private-media?id=${encodeURIComponent(item.id)}`;
}

export function isMediaVisibility(value: unknown): value is MediaVisibility {
  return value === "public" || value === "unlisted" || value === "private";
}

export const demoMedia: MediaItem[] = [
  { id: "1", title: "Golden hour", type: "photo", url: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?auto=format&fit=crop&w=1200&q=85", createdAt: "Today", album: "Outdoors", visibility: "public" },
  { id: "2", title: "City after dark", type: "video", url: "https://images.unsplash.com/photo-1519608487953-e999c86e7454?auto=format&fit=crop&w=1200&q=85", createdAt: "Yesterday", album: "Travel", visibility: "public" },
  { id: "3", title: "Weekend escape", type: "photo", url: "https://images.unsplash.com/photo-1500534623283-312aade485b7?auto=format&fit=crop&w=1200&q=85", createdAt: "Aug 10", album: "Travel", visibility: "public" },
  { id: "4", title: "Coffee break", type: "photo", url: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=85", createdAt: "Aug 8", album: "Everyday", visibility: "public" },
];
