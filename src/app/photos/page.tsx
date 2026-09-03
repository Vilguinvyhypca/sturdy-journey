import type { Metadata } from "next";
import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export const metadata: Metadata = {
  title: "Photos | MediaSpace",
  description: "Browse public photos in MediaSpace.",
};

export default async function PhotosPage() {
  const media = await getInitialPublicMedia("photo");
  return <MediaFeed initialItems={media} mediaType="photo" />;
}
