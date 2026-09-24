import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { getProfileBySlug, readProfiles } from "@/lib/profiles";
import { mediaProfileId } from "@/lib/profile-types";
import { readMedia } from "@/lib/db";
import { paginateMedia } from "@/lib/media-page";
import { ProfileForm } from "@/components/ProfileForm";
import { MediaFeed } from "@/components/MediaFeed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage profile", robots: { index: false, follow: false } };

export default async function ManageProfile({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ type?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) redirect("/admin");
  if (usesDatabase || !usesLocalStorage) notFound();
  const profile = await getProfileBySlug((await params).slug);
  if (!profile) notFound();
  const requestedType = (await searchParams).type;
  const type = requestedType === "photo" || requestedType === "video" ? requestedType : undefined;
  const [profiles, allMedia] = await Promise.all([readProfiles(), readMedia()]);
  const media = allMedia.filter((item) => mediaProfileId(item) === profile.id);
  return <>
    <section className="mx-auto max-w-6xl px-5 pt-8 sm:px-8">
      <nav aria-label="Manage profiles" className="flex flex-wrap gap-3"><Link href="/admin/profiles" className="font-bold text-indigo-700">All profiles</Link>{profiles.map((entry) => <Link key={entry.id} href={`/admin/profiles/${entry.slug}`} aria-current={entry.id === profile.id ? "page" : undefined} className="rounded-lg border px-3 py-1">{entry.name}</Link>)}</nav>
      <p className="mt-5 font-bold">Managing: {profile.name} · <Link href={`/p/${profile.slug}`} className="text-indigo-700">View public page</Link></p>
      <details className="mt-4 rounded-2xl border border-slate-200 bg-white p-5 text-slate-900"><summary className="cursor-pointer font-bold">Edit profile details</summary><div className="mt-5 max-w-xl"><ProfileForm profile={profile} photos={media.filter((item) => item.type === "photo" && item.visibility === "public" && item.id.startsWith("local:")).map(({ id, title }) => ({ id, title }))} /></div></details>
    </section>
    <MediaFeed key={`${profile.id}:${type}`} profile={profile} management initialPage={paginateMedia(media.filter((item) => !type || item.type === type))} mediaType={type} />
  </>;
}
