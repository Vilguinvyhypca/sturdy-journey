import type { Metadata } from "next";
import { VideoFeed } from "@/components/VideoFeed";

export const metadata: Metadata = {
  title: "Video feed | MediaSpace",
  description: "Watch videos from the MediaSpace library in a full-screen vertical feed.",
};

export default function FeedPage() {
  return <VideoFeed />;
}
