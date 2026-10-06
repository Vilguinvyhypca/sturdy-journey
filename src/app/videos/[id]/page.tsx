import { readMedia } from "@/lib/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { ShareMediaButton } from "@/components/ShareMediaButton";
import { MediaDetails } from "@/components/MediaDetails";
import { VideoPlayback } from "@/components/VideoPlayback";
import { getMediaById, getMuxVideo, usesDatabase } from "@/lib/database";
import { isSignedMuxUrl, muxPlaybackIdFromUrl, type MediaItem } from "@/lib/media";
import { getSiteUrl } from "@/lib/site-url";
import { authOptions, isAdmin } from "@/lib/auth";
import { createMuxPlaybackTokens } from "@/lib/mux";

export const dynamic = "force-dynamic";

function thumbnailFor(url: string, token?: string) {
  const playbackId = muxPlaybackIdFromUrl(url);
  if (!playbackId) return undefined;
  if (token) return `https://image.mux.com/${playbackId}/thumbnail.jpg?token=${encodeURIComponent(token)}`;
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0.5&width=1200&fit_mode=preserve`;
}

function fallbackMuxVideo(id: string): MediaItem | null {
  // A Mux playback ID is sufficient to play a public video. This fallback
  // preserves older links when an upload did not save its database record.
  if (!/^mux:[A-Za-z0-9_-]{12,}$/.test(id)) return null;

  return {
    id,
    title: "Hymecymeyseh video",
    type: "video",
    url: id,
    createdAt: "",
    album: "Uploads",
    visibility: "public",
  };
}

function normalizeVideoId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function descriptionFor(item: MediaItem) {
  return item.description?.trim() || `Watch ${item.title} in Hymecymeyseh.`;
}

const findVideo = cache(async (routeId: string, includePrivate: boolean) => {
  const id = normalizeVideoId(routeId);
  const savedVideo = usesDatabase
    ? await getMediaById(id) ?? await getMuxVideo(id, includePrivate)
    : (await readMedia()).find((item) => item.id === id);
  if (savedVideo) {
    if (savedVideo.type !== "video" || (savedVideo.visibility === "private" && !includePrivate)) return null;
    return savedVideo;
  }
  return usesDatabase ? null : fallbackMuxVideo(id);
});

async function canViewPrivateMedia() {
  const session = await getServerSession(authOptions);
  return isAdmin(session?.user as { isAdmin?: boolean } | undefined);
}

export async function generateMetadata({ params }: PageProps<"/videos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await findVideo(id, await canViewPrivateMedia());
  if (!item) return { title: "Video not found | Hymecymeyseh", robots: { index: false, follow: false } };

  const description = descriptionFor(item);
  const playbackId = muxPlaybackIdFromUrl(item.url) ?? "";
  const muxTokens = playbackId && isSignedMuxUrl(item.url) ? createMuxPlaybackTokens(playbackId) : undefined;
  const image = item.visibility === "private" ? undefined : item.id.startsWith("local:")
    ? new URL(`/api/local-thumbnail?id=${encodeURIComponent(item.id)}`, getSiteUrl()).toString()
    : thumbnailFor(item.url, muxTokens?.thumbnail);
  const indexable = item.visibility === "public";
  return {
    title: `${item.title} | Hymecymeyseh`,
    description,
    alternates: { canonical: `/videos/${encodeURIComponent(item.id)}` },
    openGraph: { title: `${item.title} | Hymecymeyseh`, description, siteName: "Hymecymeyseh", type: "video.other", url: `/videos/${encodeURIComponent(item.id)}`, images: image ? [{ url: image, alt: item.title }] : [] },
    twitter: { card: "summary_large_image", title: `${item.title} | Hymecymeyseh`, description, images: image ? [image] : [] },
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

export default async function VideoPage({ params }: PageProps<"/videos/[id]">) {
  const { id } = await params;
  const item = await findVideo(id, await canViewPrivateMedia());
  if (!item) notFound();

  const playbackId = muxPlaybackIdFromUrl(item.url);
  const muxTokens = playbackId && isSignedMuxUrl(item.url) ? createMuxPlaybackTokens(playbackId) : undefined;
  const thumbnailUrl = thumbnailFor(item.url, muxTokens?.thumbnail);
  const pageUrl = new URL(
    `/videos/${encodeURIComponent(item.id)}`,
    getSiteUrl(),
  ).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: item.title,
    description: descriptionFor(item),
    thumbnailUrl,
    uploadDate: item.capturedAt ?? undefined,
    contentUrl: `https://stream.mux.com/${playbackId}.m3u8`,
    embedUrl: pageUrl,
  };

  return <main className="min-h-screen bg-slate-950 text-white">
    {playbackId && item.visibility === "public" && !isSignedMuxUrl(item.url) && <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />}
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="font-bold tracking-tight hover:text-indigo-200">Hymecymeyseh</Link>
      <Link href="/" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20">Back to library</Link>
    </header>
    <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,720px)_1fr] lg:items-start">
      <div className="mx-auto w-full max-w-[56.25dvh] overflow-hidden rounded-2xl bg-black shadow-2xl lg:mx-0"><VideoPlayback src={item.url} mediaId={item.id} muxTokens={muxTokens} startMuted /></div>
      <div className="max-w-xl pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Video</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1>
        {item.description && <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-200">{item.description}</p>}
        <ShareMediaButton mediaId={item.id} href={`/videos/${encodeURIComponent(item.id)}`} title={item.title} />
        <MediaDetails item={item} className="px-0 pt-3 text-slate-300" />
        <p className="mt-6 text-sm leading-6 text-slate-300">{item.visibility === "public" ? "This public video can appear in the library, feed, and search engines." : item.visibility === "unlisted" ? "This unlisted video is available to people who have its direct link and is excluded from search indexing." : "This private video is visible only while signed in as the administrator."}</p>
      </div>
    </section>
  </main>;
}
