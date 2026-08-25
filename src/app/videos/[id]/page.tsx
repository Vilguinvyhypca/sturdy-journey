import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { MediaDetails } from "@/components/MediaDetails";
import { VideoPlayback } from "@/components/VideoPlayback";
import { getMuxVideo, usesDatabase } from "@/lib/database";
import type { MediaItem } from "@/lib/media";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

function thumbnailFor(url: string) {
  if (!url.startsWith("mux:")) return undefined;
  const playbackId = url.slice(4);
  return `https://image.mux.com/${playbackId}/thumbnail.jpg?time=0.5&width=1200&fit_mode=preserve`;
}

function fallbackMuxVideo(id: string): MediaItem | null {
  // A Mux playback ID is sufficient to play a public video. This fallback
  // preserves older links when an upload did not save its database record.
  if (!/^mux:[A-Za-z0-9_-]{12,}$/.test(id)) return null;

  return {
    id,
    title: "MediaSpace video",
    type: "video",
    url: id,
    createdAt: "",
    album: "Uploads",
  };
}

const findVideo = cache(async (id: string) => {
  const savedVideo = usesDatabase
    ? await getMuxVideo(id).catch(() => null)
    : null;

  return savedVideo ?? fallbackMuxVideo(id);
});

export async function generateMetadata({ params }: PageProps<"/videos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await findVideo(id);
  if (!item) return { title: "Video not found | MediaSpace", robots: { index: false, follow: false } };

  const description = `Watch ${item.title} in MediaSpace.`;
  const image = thumbnailFor(item.url);
  return {
    title: `${item.title} | MediaSpace`,
    description,
    alternates: { canonical: `/videos/${encodeURIComponent(item.id)}` },
    openGraph: { title: `${item.title} | MediaSpace`, description, type: "video.other", url: `/videos/${encodeURIComponent(item.id)}`, images: image ? [{ url: image, alt: item.title }] : [] },
    twitter: { card: "summary_large_image", title: `${item.title} | MediaSpace`, description, images: image ? [image] : [] },
  };
}

export default async function VideoPage({ params }: PageProps<"/videos/[id]">) {
  const { id } = await params;
  const item = await findVideo(id);
  if (!item) notFound();

  const thumbnailUrl = thumbnailFor(item.url);
  const playbackId = item.url.slice(4);
  const pageUrl = new URL(
    `/videos/${encodeURIComponent(item.id)}`,
    getSiteUrl(),
  ).toString();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: item.title,
    description: `Watch ${item.title} in MediaSpace.`,
    thumbnailUrl,
    uploadDate: item.capturedAt ?? undefined,
    contentUrl: `https://stream.mux.com/${playbackId}.m3u8`,
    embedUrl: pageUrl,
  };

  return <main className="min-h-screen bg-slate-950 text-white">
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="font-bold tracking-tight hover:text-indigo-200">MediaSpace</Link>
      <Link href="/" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20">Back to library</Link>
    </header>
    <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,720px)_1fr] lg:items-start">
      <div className="mx-auto w-full max-w-[56.25dvh] overflow-hidden rounded-2xl bg-black shadow-2xl lg:mx-0"><VideoPlayback src={item.url} /></div>
      <div className="max-w-xl pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Video</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1>
        <MediaDetails item={item} className="px-0 pt-3 text-slate-300" />
        <p className="mt-6 text-sm leading-6 text-slate-300">This is a public MediaSpace video page. You can share this address directly.</p>
      </div>
    </section>
  </main>;
}
