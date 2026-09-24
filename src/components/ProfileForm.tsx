"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/profile-types";

export function ProfileForm({ profile, photos = [] }: { profile?: Profile; photos?: { id: string; title: string }[] }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/profiles", {
        method: profile ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: profile?.id, name: form.get("name"), slug: form.get("slug"), bio: form.get("bio"),
          handle: form.get("handle"), avatarMediaId: form.get("avatarMediaId") ?? "",
          socialLinks: String(form.get("socialLinks") ?? "").split("\n").map((link) => link.trim()).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Could not save profile.");
      router.push(`/admin/profiles/${data.profile.slug}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save profile.");
      setSaving(false);
    }
  }
  const fieldClass = "mt-1 block w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900";
  return <form onSubmit={save} className="space-y-4">
    <label className="block font-semibold">Display name<input name="name" required maxLength={100} defaultValue={profile?.name} className={fieldClass} /></label>
    <label className="block font-semibold">Profile URL name<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={60} readOnly={Boolean(profile)} defaultValue={profile?.slug} placeholder="jane-doe" className={fieldClass} /><span className="text-sm font-normal text-slate-500">Used in /p/name. This stays fixed to preserve shared links.</span></label>
    <label className="block font-semibold">Social handle<input name="handle" maxLength={100} defaultValue={profile?.handle} placeholder="@jane" className={fieldClass} /></label>
    <label className="block font-semibold">Biography<textarea name="bio" maxLength={1000} rows={4} defaultValue={profile?.bio} className={fieldClass} /></label>
    <label className="block font-semibold">Social links<textarea name="socialLinks" rows={3} defaultValue={profile?.socialLinks.join("\n")} placeholder="https://www.instagram.com/your-profile/" className={fieldClass} /><span className="text-sm font-normal text-slate-500">One HTTPS link per line, up to eight.</span></label>
    {profile && <label className="block font-semibold">Profile photo<select name="avatarMediaId" defaultValue={photos.some((photo) => photo.id === profile.avatarMediaId) ? profile.avatarMediaId : ""} className={fieldClass}><option value="">Use initials</option>{photos.map((photo) => <option key={photo.id} value={photo.id}>{photo.title}</option>)}</select><span className="text-sm font-normal text-slate-500">Upload a photo to this profile and make it public to use it here.</span></label>}
    {error && <p role="alert" className="text-rose-700">{error}</p>}
    <button disabled={saving} className="rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white disabled:opacity-50">{saving ? "Saving…" : profile ? "Save profile" : "Create profile"}</button>
  </form>;
}
