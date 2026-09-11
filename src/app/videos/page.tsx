import type { Metadata } from "next";
import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export const metadata: Metadata = {
  title: "Videos | MediaSpace",
  description: "Browse public videos in MediaSpace.",
};

export default async function VideosPage() {
  const page = await getInitialPublicMedia("video");
  return <MediaFeed initialPage={page} mediaType="video" />;
}
