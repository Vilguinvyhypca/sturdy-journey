import { readMedia } from "@/lib/db";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getServerSession } from "next-auth";
import { MediaDetails } from "@/components/MediaDetails";
import { authOptions, isAdmin } from "@/lib/auth";
import { getMediaById, usesDatabase } from "@/lib/database";
import { privatePhotoDeliveryUrl, type MediaItem } from "@/lib/media";
import { getSiteUrl } from "@/lib/site-url";
import { isPrivateBlobUrl } from "@/lib/storage";

export const dynamic = "force-dynamic";

function normalizePhotoId(id: string) {
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

function descriptionFor(item: MediaItem) {
  return item.description?.trim() || "View " + item.title + " in MediaSpace.";
}

function withPhotoDelivery(item: MediaItem): MediaItem {
  return isPrivateBlobUrl(item.url)
    ? { ...item, url: privatePhotoDeliveryUrl(item) }
    : item;
}

const findPhoto = cache(async (routeId: string, includePrivate: boolean) => {
  const id = normalizePhotoId(routeId);
  const item = usesDatabase ? await getMediaById(id).catch(() => null) : (await readMedia()).find((item) => item.id === id);
  if (!item || item.type !== "photo") return null;
  if (item.visibility === "private" && !includePrivate) return null;
  return withPhotoDelivery(item);
});

async function canViewPrivateMedia() {
  const session = await getServerSession(authOptions);
  return isAdmin(session?.user as { isAdmin?: boolean } | undefined);
}

function absoluteUrl(url: string) {
  return url.startsWith("/") ? new URL(url, getSiteUrl()).toString() : url;
}

export async function generateMetadata({ params }: PageProps<"/photos/[id]">): Promise<Metadata> {
  const { id } = await params;
  const item = await findPhoto(id, await canViewPrivateMedia());
  if (!item) return { title: "Photo not found | MediaSpace", robots: { index: false, follow: false } };

  const description = descriptionFor(item);
  const pagePath = "/photos/" + encodeURIComponent(item.id);
  const image = absoluteUrl(item.url);
  const indexable = item.visibility === "public";
  return {
    title: item.title + " | MediaSpace",
    description,
    alternates: { canonical: pagePath },
    openGraph: {
      title: item.title + " | MediaSpace",
      description,
      type: "article",
      url: pagePath,
      images: indexable ? [{ url: image, alt: item.title }] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: item.title + " | MediaSpace",
      description,
      images: indexable ? [image] : [],
    },
    robots: indexable ? undefined : { index: false, follow: false },
  };
}

export default async function PhotoPage({ params }: PageProps<"/photos/[id]">) {
  const { id } = await params;
  const item = await findPhoto(id, await canViewPrivateMedia());
  if (!item) notFound();

  return <main className="min-h-screen bg-slate-950 text-white">
    <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
      <Link href="/" className="font-bold tracking-tight hover:text-indigo-200">MediaSpace</Link>
      <Link href="/" className="rounded-lg bg-white/10 px-3 py-2 text-sm font-medium hover:bg-white/20">Back to library</Link>
    </header>
    <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-10 sm:px-6 lg:grid-cols-[minmax(0,720px)_1fr] lg:items-start">
      <div className="relative min-h-[55vh] overflow-hidden rounded-2xl bg-black shadow-2xl">
        <Image
          src={item.url}
          alt={item.title}
          fill
          priority
          sizes="(max-width: 1024px) 100vw, 720px"
          unoptimized={item.url.startsWith("/api/private-media?") || item.url.startsWith("/api/local-media?")}
          className="object-contain"
        />
      </div>
      <div className="max-w-xl pt-2">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-300">Photo</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1>
        {item.description && <p className="mt-4 whitespace-pre-wrap leading-7 text-slate-200">{item.description}</p>}
        <MediaDetails item={item} className="px-0 pt-3 text-slate-300" />
        <p className="mt-6 text-sm leading-6 text-slate-300">
          {item.visibility === "public"
            ? "This public photo can appear in the library and search engines."
            : item.visibility === "unlisted"
              ? "This unlisted photo is available to people who have its direct link and is excluded from search indexing."
              : "This private photo is visible only while signed in as the administrator."}
        </p>
      </div>
    </section>
  </main>;
}