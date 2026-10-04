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
  const data = join(root, "catalog");
  await mkdir(join(source, "subfolder"), { recursive: true });
  await mkdir(storage);
  await mkdir(app);
  await writeFile(join(source, "Photo.JPG"), "photo bytes");
  await writeFile(join(source, "subfolder", "same.jpeg"), "photo bytes");
  await writeFile(join(source, "subfolder", "movie.mp4"), "video bytes");
  await symlink(join(source, "Photo.JPG"), join(source, "linked.jpg"));
  const env = { ...process.env, MEDIA_DATA_DIR: data, MEDIA_UPLOAD_PROVIDER: "local", MEDIA_STORAGE_ROOT: storage, DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "" };
  const run = (...extra) => {
    try { return execFileSync(process.execPath, [script, "--source", source, "--profile", "sabaideesana", ...extra], { cwd: app, env, encoding: "utf8", stdio: "pipe" }); }
    catch (error) {
      // Deliberately corrupt video must remain cataloged, with an explicit processing failure.
      assert.equal(error.status, 3);
      assert.match(error.stderr, /1 video playback conversions failed/);
      return error.stdout;
    }
  };

  assert.match(run(), /Dry run: 3 supported files/);
  assert.deepEqual(await readdir(storage), []);
  assert.match(run("--apply"), /2 imported, 1 exact duplicates skipped, 0 failed/);
  assert.deepEqual(await readdir(app), []);
  const records = JSON.parse(await readFile(join(data, "media.json"), "utf8"));
  const profiles = JSON.parse(await readFile(join(data, "profiles.json"), "utf8"));
  const profile = profiles.find((entry) => entry.slug === "sabaideesana");
  assert(profile);
  assert(records.every((record) => record.profileId === profile.id));
  assert.equal(records.length, 2);
  assert(records.every((record) => record.visibility === "private" && record.storage.provider === "local"));
  assert(records.some((record) => record.title === "Photo"));
  assert(records.some((record) => record.title === "movie"));
  assert.equal((await readdir(storage)).length, 2);
  assert.equal((await stat(join(source, "Photo.JPG"))).size, 11);
  assert.match(run("--apply"), /0 imported, 3 exact duplicates skipped, 0 failed/);
  assert.equal((await readdir(storage)).length, 2);
  const logFiles = await readdir(join(data, "imports"));
  assert.equal(logFiles.length, 2);
  const events = (await readFile(join(data, "imports", logFiles[0]), "utf8"))
    .trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(events.filter((event) => event.event === "file_finished").length, 3);
  assert(events.some((event) => event.event === "finished"));
  assert(events.some((event) => event.event === "playback_failed"));
  assert.equal((await stat(join(storage, records.find((record) => record.type === "video").storage.objectKey))).size, 11);
});

test("profile imports generate browser playback and do not steal another profile's duplicates", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-import-video-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, "source with spaces");
  const storage = join(root, "storage");
  const app = join(root, "app");
  const data = join(root, "catalog");
  for (const dir of [source, storage, app]) await mkdir(dir);
  execFileSync("ffmpeg", ["-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=64x64:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "pcm_s16le", join(source, "sample.mov")]);
  const env = { ...process.env, MEDIA_DATA_DIR: data, MEDIA_UPLOAD_PROVIDER: "local", MEDIA_STORAGE_ROOT: storage, DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "" };
  const run = (profile) => execFileSync(process.execPath, [script, "--source", source, "--profile", profile, "--apply"], { cwd: app, env, encoding: "utf8" });
  assert.match(run("first"), /1 imported/);
  assert.match(run("second"), /1 imported/);
  assert.match(run("first"), /0 imported, 1 exact duplicates skipped/);
  const records = JSON.parse(await readFile(join(data, "media.json"), "utf8"));
  assert.equal(records.length, 2);
  assert.notEqual(records[0].profileId, records[1].profileId);
  for (const record of records) {
    const playback = join(storage, record.storage.playbackObjectKey);
    const streams = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-of", "json", playback], { encoding: "utf8" })).streams;
    assert(streams.some((stream) => stream.codec_name === "h264"));
    assert(streams.some((stream) => stream.codec_name === "aac"));
    assert((await stat(join(storage, record.storage.objectKey + ".jpg"))).size > 0);
  }
});
