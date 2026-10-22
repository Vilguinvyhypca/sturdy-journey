import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const exec = promisify(execFile);
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("real upload validation rejects corrupt, audio-only, overlong, and empty files without catalog entries or orphan files", { timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-validation-"));
  const files = join(root, "files");
  await mkdir(files);
  const previousRoot = process.env.MEDIA_STORAGE_ROOT;
  const previousProvider = process.env.MEDIA_UPLOAD_PROVIDER;
  process.env.MEDIA_STORAGE_ROOT = files;
  process.env.MEDIA_UPLOAD_PROVIDER = "local";
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = previousRoot;
    if (previousProvider === undefined) delete process.env.MEDIA_UPLOAD_PROVIDER;
    else process.env.MEDIA_UPLOAD_PROVIDER = previousProvider;
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(join(root, "storage.cjs"), await compile("../src/lib/local-storage.ts"));
  const storage = createRequire(import.meta.url)(join(root, "storage.cjs"));
  let saved = 0;
  let prepared = 0;
  const mocks = {
    "@/lib/rate-limit": { limitAdminAction: async () => null },
    "@/lib/profile-types": { defaultProfileId: "hymecymeyseh", mediaProfileId: () => "hymecymeyseh" },
    "@/lib/profiles": { getProfile: async () => ({ id: "hymecymeyseh" }) },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { authOptions: {}, isAdmin: () => true },
    "@/lib/db": { DuplicateMediaError: class extends Error {}, readMedia: async () => [], addMedia: async () => { saved++; } },
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { normalizeOriginalFileName: (value) => value },
    "@/lib/local-storage": { ...storage,
      generateLocalThumbnail: async () => { prepared++; },
      generateLocalPlayback: async (key) => { prepared++; return `${key}.web.mp4`; },
    },
  };
  const route = {};
  vm.runInNewContext(await compile("../src/app/api/local-upload/route.ts"), {
    exports: route, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; }, Response, URL, process, console,
  });
  const upload = (bytes, contentType = "video/mp4") => route.POST(new Request("http://localhost/api/local-upload", {
    method: "POST", headers: { "Content-Type": contentType, "X-Media-Name": "test.mp4" }, body: bytes,
  }));
  const audio = join(root, "audio.m4a");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "anullsrc=r=8000:cl=mono", "-t", "1", "-c:a", "aac", audio]);
  const long = join(root, "long.mp4");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=16x16:r=1", "-t", "301", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", long]);
  for (const [bytes, status, message, contentType] of [
    [Buffer.from("not a video"), 422, /could not be read/],
    [await readFile(audio), 422, /video track/],
    [await readFile(long), 422, /five minutes/],
    [Buffer.alloc(0), 400, /empty/],
    [Buffer.from("not a HEIC image"), 422, /could not be converted/, "image/heic"],
  ]) {
    const response = await upload(bytes, contentType);
    assert.equal(response.status, status);
    assert.match((await response.json()).error, message);
    assert.deepEqual(await readdir(files), []);
    assert.equal(saved, 0);
    assert.equal(prepared, 0);
  }
  const boundary = join(root, "boundary.mp4");
  await exec("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=s=16x16:r=1", "-t", "300", "-c:v", "libx264", "-threads", "1", "-pix_fmt", "yuv420p", boundary]);
  const response = await upload(await readFile(boundary));
  assert.equal(response.status, 201);
  assert.equal((await response.json()).media.durationSeconds, 300);
  assert.equal(saved, 1);
  assert.equal(prepared, 2);
});

test("probe metadata rejects unknown durations and cover art, while validator outages are retryable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-probe-"));
  const previous = process.env.MEDIA_STORAGE_ROOT;
  process.env.MEDIA_STORAGE_ROOT = root;
  t.after(async () => {
    if (previous === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });
  let metadata;
  let failure;
  const fakeExec = () => {};
  fakeExec[promisify.custom] = async () => {
    if (failure) throw failure;
    return { stdout: JSON.stringify(metadata) };
  };
  const require = createRequire(import.meta.url);
  const storage = {};
  vm.runInNewContext(await compile("../src/lib/local-storage.ts"), {
    exports: storage, require: (name) => name === "node:child_process" ? { ...require(name), execFile: fakeExec } : require(name),
    process, Buffer,
  });
  const key = "11111111-1111-4111-8111-111111111111.mp4";
  for (const duration of [undefined, "N/A", "Infinity", "0", "-1", ""]) {
    metadata = { format: { duration }, streams: [{ codec_type: "video" }] };
    await assert.rejects(storage.probeLocalVideoDuration(key), (error) => error.status === 422);
  }
  metadata = { format: { duration: "30" }, streams: [{ codec_type: "video", disposition: { attached_pic: 1 } }] };
  await assert.rejects(storage.probeLocalVideoDuration(key), (error) => error.status === 422);
  metadata.streams.push({ codec_type: "video", disposition: { attached_pic: 0 } });
  assert.equal(await storage.probeLocalVideoDuration(key), 30);
  for (failure of [Object.assign(new Error("missing validator"), { code: "ENOENT" }), Object.assign(new Error("permission"), { code: "EACCES" }), Object.assign(new Error("timeout"), { killed: true })]) {
    await assert.rejects(storage.probeLocalVideoDuration(key), (error) => error.status === 503 && /try again later/.test(error.message));
  }
});
