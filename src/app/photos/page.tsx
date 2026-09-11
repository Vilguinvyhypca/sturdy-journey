import type { Metadata } from "next";
import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export const metadata: Metadata = {
  title: "Photos | MediaSpace",
  description: "Browse public photos in MediaSpace.",
};

export default async function PhotosPage() {
  const page = await getInitialPublicMedia("photo");
  return <MediaFeed initialPage={page} mediaType="photo" />;
}
