import type { MetadataRoute } from "next";
import { listMuxMedia, usesDatabase } from "@/lib/database";
import { getSiteUrl } from "@/lib/site-url";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!usesDatabase) return [];
  const videos = await listMuxMedia().catch(() => []);
  const siteUrl = getSiteUrl();
  return videos.map((video) => ({
    url: new URL(`/videos/${encodeURIComponent(video.id)}`, siteUrl).toString(),
    changeFrequency: "monthly",
    priority: 0.8,
  }));
}
