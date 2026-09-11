import { MediaFeed } from "@/components/MediaFeed";
import { getInitialPublicMedia } from "@/lib/public-media";

export default async function Home() {
  const page = await getInitialPublicMedia();
  return <MediaFeed initialPage={page} />;
}
