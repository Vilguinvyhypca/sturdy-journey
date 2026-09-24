export const defaultProfileId = "hymecymeyseh";

export type Profile = {
  id: string;
  slug: string;
  name: string;
  bio: string;
  handle: string;
  socialLinks: string[];
  avatarMediaId: string;
};

export const initialProfile: Profile = {
  id: defaultProfileId, slug: "hymecymeyseh", name: "Hymecymeyseh",
  bio: "We are here to just have 🤩 fun.", handle: "", socialLinks: [], avatarMediaId: "",
};

export function mediaProfileId(item: { profileId?: string }) {
  return item.profileId ?? defaultProfileId;
}
