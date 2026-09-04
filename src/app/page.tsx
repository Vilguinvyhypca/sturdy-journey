import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export default async function Home() {
  const media = await getInitialPublicMedia();
  return <MediaFeed initialItems={media} />;
}
