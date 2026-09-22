/** Internal storage metadata. Never use this record as an authorization decision. */
export type MediaStorageRecord = {
  provider: "mux" | "vercel-blob" | "local" | "external";
  objectKey: string;
  playbackObjectKey?: string;
  playbackId: string | null;
  access: "public" | "signed" | "private" | "unknown";
};

/** Preserve legacy locators exactly; do not mistake arbitrary URLs for managed files. */
export function inferMediaStorage(item: { id: string; url: string }): MediaStorageRecord {
  const signed = item.url.startsWith("mux-signed:");
  if (signed || item.url.startsWith("mux:")) {
    return {
      provider: "mux",
      objectKey: item.id.startsWith("mux:") ? item.id.slice(4) : item.id,
      playbackId: item.url.slice(signed ? 11 : 4),
      access: signed ? "signed" : "public",
    };
  }
  if (/^\/uploads\/[^/?#]+$/.test(item.url)) {
    return { provider: "local", objectKey: item.url.slice(9), playbackId: null, access: "public" };
  }
  try {
    const url = new URL(item.url);
    if (url.protocol === "https:" && !url.username && !url.password &&
        /^[a-z0-9-]+\.(public|private)\.blob\.vercel-storage\.com$/i.test(url.hostname)) {
      return {
        provider: "vercel-blob",
        // Keep the complete locator: different stores may contain the same pathname.
        objectKey: item.url,
        playbackId: null,
        access: url.hostname.toLowerCase().includes(".private.") ? "private" : "public",
      };
    }
  } catch {
    // Unknown legacy locators remain external and are never treated as local paths.
  }
  return { provider: "external", objectKey: item.url, playbackId: null, access: "unknown" };
}
