import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getProfileBySlug } from "@/lib/profiles";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { VideoFeed } from "@/components/VideoFeed";

export const metadata: Metadata = {
  title: "Video feed | MediaSpace",
  description: "Watch videos from the MediaSpace library in a full-screen vertical feed.",
};

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ profile?: string | string[] }> }) {
  const { profile: slug } = await searchParams;
  if (slug === undefined) return <VideoFeed />;
  if (typeof slug !== "string" || usesDatabase || !usesLocalStorage) notFound();
  const profile = await getProfileBySlug(slug);
  if (!profile) notFound();
  return <VideoFeed key={profile.id} profileId={profile.id} galleryHref={`/p/${profile.slug}`} />;
}
