import type { Metadata } from "next";
import Link from "next/link";
import { AdminSignIn } from "@/components/AdminSignIn";
import { AuthControls } from "@/components/AuthControls";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { readProfiles } from "@/lib/profiles";
import { readMedia } from "@/lib/db";
import { mediaProfileId } from "@/lib/profile-types";

export const metadata: Metadata = {
  title: "Admin dashboard | MediaSpace",
  description: "Manage MediaSpace profiles and media.",
  robots: {
    index: false,
    follow: false,
  },
};
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
    const localProfiles = !usesDatabase && usesLocalStorage;
    const [profiles, media] = localProfiles ? await Promise.all([readProfiles(), readMedia()]) : [[], []];
    const profileCounts = new Map(profiles.map((profile) => [profile.id, { photos: 0, videos: 0, public: 0, unlisted: 0, private: 0 }]));
    let photos = 0;
    let videos = 0;
    let publicCount = 0;
    for (const item of media) {
      const count = profileCounts.get(mediaProfileId(item));
      if (item.type === "photo") { photos += 1; if (count) count.photos += 1; }
      else { videos += 1; if (count) count.videos += 1; }
      if ((item.visibility ?? "public") === "public") { publicCount += 1; if (count) count.public += 1; }
      if (item.visibility === "unlisted" && count) count.unlisted += 1;
      if (item.visibility === "private" && count) count.private += 1;
    }
    return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">MediaSpace</p><h1 className="mt-2 text-3xl font-black text-slate-950">Admin dashboard</h1><p className="mt-1 text-sm text-slate-600">Manage public profiles and the media in each gallery.</p></div>
        <div className="flex flex-wrap items-center gap-3"><Link className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700" href="/">Open website</Link><AuthControls showDashboardLink={false} /></div>
      </header>
      {localProfiles ? <>
        <section aria-label="Library totals" className="my-7 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[{ label: "Profiles", value: profiles.length }, { label: "Media files", value: media.length }, { label: "Public", value: publicCount }, { label: "Photos", value: photos }, { label: "Videos", value: videos }].map((stat) => <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-500">{stat.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{stat.value.toLocaleString()}</p></div>)}
        </section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold text-slate-950">Public profiles</h2><Link href="/admin/profiles" className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white">Manage profiles</Link></div>
        <section className="grid gap-4 sm:grid-cols-2" aria-label="Manage public profiles">
          {profiles.map((profile) => {
            const count = profileCounts.get(profile.id)!;
            return <article key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-950">{profile.name}</h3>{profile.handle && <p className="mt-1 text-sm font-semibold text-indigo-700">{profile.handle}</p>}</div><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">{count.public} public</span></div>
              <p className="mt-4 text-sm text-slate-600">{count.photos} photos · {count.videos} videos</p><p className="mt-1 text-xs text-slate-500">{count.unlisted} unlisted · {count.private} private</p>
              <div className="mt-5 flex flex-wrap gap-4"><Link href={`/admin/profiles/${profile.slug}`} className="font-bold text-indigo-700">Manage gallery →</Link><Link href={`/p/${profile.slug}`} className="font-semibold text-slate-600">View public profile</Link></div>
            </article>;
          })}
        </section>
        {profiles.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 p-5 text-slate-600">No profiles yet. Create one from Manage profiles.</p>}
        <nav aria-label="Admin tools" className="mt-8 flex flex-wrap gap-4 border-t border-slate-200 pt-6"><Link className="font-semibold text-indigo-700" href="/admin/profiles">Profile settings</Link><Link className="font-semibold text-indigo-700" href="/admin/experience">Visitor experience</Link><Link className="font-semibold text-indigo-700" href="/albums">Manage albums</Link><Link className="font-semibold text-indigo-700" href="/">Browse all media</Link></nav>
      </> : <section className="my-8 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><h2 className="font-bold">Profile dashboard unavailable in this storage mode</h2><p className="mt-2 text-sm">Current profile management requires the local catalog. You can still manage the media library and albums.</p><div className="mt-4 flex gap-4"><Link className="font-bold underline" href="/">Open media library</Link><Link className="font-bold underline" href="/albums">Manage albums</Link></div></section>}
    </main>;
  }
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">MediaSpace</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Administrator access</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in to upload media, organize albums, and manage this library.
        </p>
        <div className="mt-8">
          {process.env.ADMIN_PASSWORD ? <AdminSignIn /> : <div className="flex justify-center"><AuthControls showSignIn /></div>}
        </div>
        <Link className="mt-7 inline-block text-sm font-bold text-slate-600 hover:text-slate-950" href="/">
          Back to MediaSpace
        </Link>
      </section>
    </main>
  );
}
