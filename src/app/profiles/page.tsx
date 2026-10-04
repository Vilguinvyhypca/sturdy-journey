import Link from "next/link";
import { notFound } from "next/navigation";
import { usesDatabase } from "@/lib/database";
import { usesLocalStorage } from "@/lib/local-storage";
import { readProfiles } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Profiles",
  description: "Explore photos and videos from each profile.",
  alternates: { canonical: "/profiles" },
};

export default async function ProfilesPage() {
  if (usesDatabase || !usesLocalStorage) notFound();
  const profiles = await readProfiles();

  return <main className="mx-auto max-w-5xl px-5 py-10 sm:px-8">
    <Link href="/" className="font-semibold text-indigo-700">← Gallery</Link>
    <h1 className="mt-6 text-4xl font-bold">Profiles</h1>
    <p className="mt-3 text-slate-500">Choose a profile to explore their photos and videos.</p>
    <div className="mt-8 grid gap-5 sm:grid-cols-2">
      {profiles.map((profile) => <Link key={profile.id} href={`/p/${profile.slug}`} className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 transition hover:border-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-indigo-600">
        <h2 className="text-2xl font-bold">{profile.name}</h2>
        {profile.handle && <p className="mt-2 font-semibold text-indigo-700">{profile.handle}</p>}
        {profile.bio && <p className="mt-3 whitespace-pre-line text-slate-600">{profile.bio}</p>}
        <p className="mt-5 font-semibold text-indigo-700">View gallery →</p>
      </Link>)}
    </div>
  </main>;
}
