import type { Metadata } from "next";
import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export const metadata: Metadata = {
  title: "Videos | MediaSpace",
  description: "Browse public videos in MediaSpace.",
};

export default async function VideosPage() {
  const media = await getInitialPublicMedia("video");
  return <MediaFeed initialItems={media} mediaType="video" />;
}
