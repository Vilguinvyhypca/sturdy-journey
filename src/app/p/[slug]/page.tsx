import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { MediaFeed } from "@/components/MediaFeed";
import { getProfileBySlug } from "@/lib/profiles";
import { mediaProfileId } from "@/lib/profile-types";
import { getInitialPublicMedia } from "@/lib/public-media";
import { readMedia } from "@/lib/db";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  if (usesDatabase || !usesLocalStorage) return { robots: { index: false } };
  const profile = await getProfileBySlug((await params).slug);
  if (!profile) return { title: "Profile not found", robots: { index: false } };
  const title = `${profile.name} — Photos and Videos`;
  const description = profile.bio || `Explore photos and videos from ${profile.name}.`;
  return { title, description, alternates: { canonical: `/p/${profile.slug}` }, openGraph: { title, description, url: `/p/${profile.slug}`, type: "profile" } };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  if (usesDatabase || !usesLocalStorage) notFound();
  const profile = await getProfileBySlug((await params).slug);
  if (!profile) notFound();
  const requestedType = (await searchParams).type;
  const type = requestedType === "photo" || requestedType === "video" ? requestedType : undefined;
  const page = await getInitialPublicMedia(type, profile.id);
  const avatar = (await readMedia()).find((item) => item.id === profile.avatarMediaId && item.type === "photo" && item.visibility === "public" && mediaProfileId(item) === profile.id && item.id.startsWith("local:"));
  const structuredData = { "@context": "https://schema.org", "@type": "ProfilePage", url: new URL(`/p/${profile.slug}`, getSiteUrl()).toString(), mainEntity: { "@type": "Person", name: profile.name, alternateName: profile.handle || undefined, description: profile.bio, sameAs: profile.socialLinks } };
  return <>
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />
    <section aria-label="About this profile" className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
      {avatar ? <Image src={avatar.url} alt={`${profile.name} profile photo`} width={96} height={96} unoptimized className="h-24 w-24 rounded-full object-cover" /> : <div aria-hidden="true" className="grid h-24 w-24 place-items-center rounded-full bg-indigo-100 text-3xl font-bold text-indigo-800">{profile.name.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0]).join("")}</div>}
      {profile.handle && <p className="mt-3 font-semibold">{profile.handle}</p>}
      <div className="mt-3 flex flex-wrap gap-4">{profile.socialLinks.map((url) => <a key={url} href={url} rel="me noopener noreferrer" className="text-indigo-700 underline">{new URL(url).hostname}</a>)}</div>
    </section>
    <MediaFeed key={`${profile.id}:${type}`} profile={profile} initialPage={page} mediaType={type} />
  </>;
}
