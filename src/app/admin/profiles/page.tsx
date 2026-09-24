import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { readProfiles } from "@/lib/profiles";
import { readMedia } from "@/lib/db";
import { mediaProfileId } from "@/lib/profile-types";
import { ProfileForm } from "@/components/ProfileForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Manage profiles", robots: { index: false, follow: false } };

export default async function ProfilesAdmin() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) redirect("/admin");
  if (usesDatabase || !usesLocalStorage) return <main className="p-8">Profiles require the local Ubuntu catalog and storage.</main>;
  const [profiles, media] = await Promise.all([readProfiles(), readMedia()]);
  return <main className="mx-auto max-w-5xl px-5 py-10">
    <Link href="/" className="text-indigo-700">← Gallery</Link>
    <h1 className="mt-4 text-3xl font-bold">Manage profiles</h1>
    <p className="mt-2 text-slate-600">Choose whose gallery you want to manage. New uploads start private.</p>
    <div className="my-8 grid gap-4 sm:grid-cols-2">{profiles.map((profile) => {
      const items = media.filter((item) => mediaProfileId(item) === profile.id);
      return <section key={profile.id} className="rounded-2xl border border-slate-200 bg-white p-5 text-slate-900">
        <h2 className="text-xl font-bold">{profile.name}</h2><p className="mt-2 text-sm text-slate-600">{items.filter((item) => item.type === "photo").length} photos · {items.filter((item) => item.type === "video").length} videos</p>
        <div className="mt-5 flex flex-wrap gap-4"><Link className="font-bold text-indigo-700" href={`/admin/profiles/${profile.slug}`}>Manage</Link><Link className="text-slate-600" href={`/p/${profile.slug}`}>View public page</Link></div>
      </section>;
    })}</div>
    <details className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900"><summary className="cursor-pointer text-xl font-bold">Create profile</summary><div className="mt-5 max-w-xl"><ProfileForm /></div></details>
  </main>;
}
