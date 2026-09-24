import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initialProfile, type Profile } from "./profile-types";

const directory = process.env.MEDIA_DATA_DIR || join(process.cwd(), "data");
const file = join(directory, "profiles.json");
let pending: Promise<unknown> = Promise.resolve();

export async function readProfiles(): Promise<Profile[]> {
  try {
    const profiles: Profile[] = JSON.parse(await readFile(file, "utf8"));
    if (!Array.isArray(profiles) || !profiles.some((profile) => profile.id === initialProfile.id)) throw new Error("Invalid profile catalog");
    return profiles;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [{ ...initialProfile }];
    throw error;
  }
}

export async function getProfile(id: string) {
  return (await readProfiles()).find((profile) => profile.id === id) ?? null;
}

export async function getProfileBySlug(slug: string) {
  return (await readProfiles()).find((profile) => profile.slug === slug) ?? null;
}

export class ProfileInputError extends Error {}

function text(value: unknown, maximum: number, label: string) {
  if (typeof value !== "string" || value.trim().length > maximum) throw new ProfileInputError(`Invalid ${label}.`);
  return value.trim();
}

export function validateProfile(input: Record<string, unknown>) {
  const name = text(input.name, 100, "name");
  const slug = text(input.slug, 60, "profile URL");
  if (!name) throw new ProfileInputError("A profile name is required.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new ProfileInputError("Use lowercase letters, numbers, and single hyphens for the profile URL.");
  const bio = text(input.bio ?? "", 1000, "biography");
  const handle = text(input.handle ?? "", 100, "handle");
  const avatarMediaId = text(input.avatarMediaId ?? "", 2048, "profile photo");
  if (!Array.isArray(input.socialLinks) || input.socialLinks.length > 8) throw new ProfileInputError("Provide up to eight social links.");
  const socialLinks = input.socialLinks.map((value) => {
    const link = text(value, 2048, "social link");
    let url: URL;
    try { url = new URL(link); } catch { throw new ProfileInputError("Social links must be complete HTTPS URLs."); }
    if (url.protocol !== "https:" || url.username || url.password) throw new ProfileInputError("Social links must be complete HTTPS URLs without credentials.");
    return url.toString();
  });
  return { name, slug, bio, handle, avatarMediaId, socialLinks };
}

export async function saveProfile(input: Record<string, unknown>, id?: string): Promise<Profile> {
  const fields = validateProfile(input);
  const operation = pending.then(async () => {
    const profiles = await readProfiles();
    const existing = id ? profiles.find((profile) => profile.id === id) : undefined;
    if (id && !existing) throw new ProfileInputError("Profile not found.");
    if (existing && existing.slug !== fields.slug) throw new ProfileInputError("Profile URLs cannot be changed; existing links stay stable.");
    if (profiles.some((profile) => profile.slug === fields.slug && profile.id !== id)) throw new ProfileInputError("That profile URL is already in use.");
    const profile = { ...fields, id: existing?.id ?? randomUUID() };
    const updated = existing ? profiles.map((entry) => entry.id === id ? profile : entry) : [...profiles, profile];
    await mkdir(directory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(updated, null, 2), { mode: 0o600 });
      await rename(temporary, file);
    } finally { await rm(temporary, { force: true }); }
    return profile;
  });
  pending = operation.catch(() => undefined);
  return operation;
}
