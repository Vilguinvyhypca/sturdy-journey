import catalogLock from "../src/lib/catalog-lock.cjs";
import { copyFile, mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

const dataDirectory = process.env.MEDIA_DATA_DIR || join(process.cwd(), "data");
const mediaFile = join(dataDirectory, "media.json");
const profilesFile = join(dataDirectory, "profiles.json");
const target = {
  id: "minamigessel",
  slug: "minamigessel",
  name: "Minami Gessel",
  bio: "",
  handle: "@minamigessel",
  socialLinks: [],
  avatarMediaId: "",
};

const apply = process.argv.includes("--apply");
async function replaceJson(file, content, options) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content, options);
    await rename(temporary, file);
  } finally { await rm(temporary, { force: true }); }
}

async function run() {
  const media = JSON.parse(await readFile(mediaFile, "utf8"));
  let profiles;
  try {
    profiles = JSON.parse(await readFile(profilesFile, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    profiles = [{ id: "hymecymeyseh", slug: "hymecymeyseh", name: "Hymecymeyseh", bio: "We are here to just have 🤩 fun.", handle: "", socialLinks: [], avatarMediaId: "" }];
  }
  if (profiles.some((profile) => profile.id === target.id || profile.slug === target.slug)) throw new Error("minamigessel already exists; refusing to overwrite it.");
  const unassigned = media.filter((item) => !item.profileId);
  console.log(`${unassigned.length} media records will be assigned to ${target.name} (${target.slug}).`);
  if (!apply) {
    console.log("Dry run only. Add --apply to write the catalog.");
    process.exit(0);
  }
  await mkdir(dirname(mediaFile), { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
  await copyFile(mediaFile, `${mediaFile}.before-profile-${stamp}.bak`);
  try { await copyFile(profilesFile, `${profilesFile}.before-profile-${stamp}.bak`); } catch (error) { if (error.code !== "ENOENT") throw error; }
  await replaceJson(mediaFile, `${JSON.stringify(media.map((item) => item.profileId ? item : { ...item, profileId: target.id }), null, 2)}\n`, { mode: 0o600 });
  await replaceJson(profilesFile, `${JSON.stringify([...profiles, target], null, 2)}\n`, { mode: 0o600 });
  console.log(`Assigned media and created ${profilesFile}. Backups use suffix ${stamp}.`);

}
if (apply) await catalogLock.withCatalogLock(dataDirectory, run);
else await run();
