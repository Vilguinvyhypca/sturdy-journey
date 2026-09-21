import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const script = resolve("scripts/import-local-media.mjs");

test("folder import keeps originals, skips duplicate content, and creates private catalog records", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-import-test-"));
  t.after(async () => { await rm(root, { recursive: true, force: true }); });
  const source = join(root, "source");
  const storage = join(root, "storage");
  const app = join(root, "app");
  await mkdir(join(source, "subfolder"), { recursive: true });
  await mkdir(storage);
  await mkdir(app);
  await writeFile(join(source, "Photo.JPG"), "photo bytes");
  await writeFile(join(source, "subfolder", "same.jpeg"), "photo bytes");
  await writeFile(join(source, "subfolder", "movie.mp4"), "video bytes");
  await symlink(join(source, "Photo.JPG"), join(source, "linked.jpg"));
  const env = { ...process.env, MEDIA_UPLOAD_PROVIDER: "local", MEDIA_STORAGE_ROOT: storage, DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "" };
  const run = (...extra) => execFileSync(process.execPath, [script, "--source", source, ...extra], { cwd: app, env, encoding: "utf8" });

  assert.match(run(), /Dry run: 3 supported files/);
  assert.deepEqual(await readdir(storage), []);
  assert.match(run("--apply"), /2 imported, 1 exact duplicates skipped, 0 failed/);
  const records = JSON.parse(await readFile(join(app, "data", "media.json"), "utf8"));
  assert.equal(records.length, 2);
  assert(records.every((record) => record.visibility === "private" && record.storage.provider === "local"));
  assert(records.some((record) => record.title === "Photo"));
  assert(records.some((record) => record.title === "movie"));
  assert.equal((await readdir(storage)).length, 2);
  assert.equal((await stat(join(source, "Photo.JPG"))).size, 11);
  assert.match(run("--apply"), /0 imported, 3 exact duplicates skipped, 0 failed/);
  assert.equal((await readdir(storage)).length, 2);
});
