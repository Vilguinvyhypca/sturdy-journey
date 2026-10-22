import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test("processing errors remove originals and partial output without saving; retry succeeds and optional thumbnail failure stays playable", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-processing-"));
  const files = join(root, "files");
  await mkdir(files);
  const previous = process.env.MEDIA_STORAGE_ROOT;
  process.env.MEDIA_STORAGE_ROOT = files;
  t.after(async () => {
    if (previous === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = previous;
    await rm(root, { recursive: true, force: true });
  });
  const require = createRequire(import.meta.url);
  let mode = "error";
  const fakeProbe = () => {};
  fakeProbe[promisify.custom] = async () => ({ stdout: JSON.stringify({ streams: [{ codec_name: "h264", pix_fmt: "yuv420p" }] }) });
  // Only the converter process is simulated. The real storage implementation
  // writes uploads, validates output size, renames output, and cleans temp files.
  const fakeSpawn = (_command, args, options) => {
    assert.equal(options.timeout, 10 * 60_000);
    const child = new EventEmitter();
    queueMicrotask(async () => {
      try {
        if (mode === "missing") return child.emit("error", Object.assign(new Error("missing ffmpeg"), { code: "ENOENT" }));
        await writeFile(args.at(-1), mode === "empty" ? "" : "converted bytes");
        child.emit("close", mode === "error" ? 1 : mode === "killed" ? null : 0);
      } catch (error) { child.emit("error", error); }
    });
    return child;
  };
  const storage = {};
  vm.runInNewContext(await compile("../src/lib/local-storage.ts"), {
    exports: storage, require: (name) => name === "node:child_process" ? { execFile: fakeProbe, spawn: fakeSpawn } : require(name), process, Buffer,
  });
  await writeFile(join(files, "existing.jpg"), "keep this file");
  let saved = 0;
  const logs = [];
  const mocks = {
    "@/lib/profile-types": { defaultProfileId: "hymecymeyseh", mediaProfileId: () => "hymecymeyseh" },
    "@/lib/profiles": { getProfile: async () => ({ id: "hymecymeyseh" }) },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { authOptions: {}, isAdmin: () => true },
    "@/lib/db": { DuplicateMediaError: class extends Error {}, readMedia: async () => [], addMedia: async () => { saved++; } },
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { normalizeOriginalFileName: (value) => value },
    "@/lib/local-storage": { ...storage, usesLocalStorage: true, probeLocalVideoDuration: async () => 5,
      generateLocalThumbnail: async () => { throw new Error("thumbnail unavailable"); },
    },
  };
  const route = {};
  vm.runInNewContext(await compile("../src/app/api/local-upload/route.ts"), {
    exports: route, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; },
    Response, URL, process, console: { error: (...args) => logs.push(args) },
  });
  const upload = (signal) => route.POST(new Request("http://localhost/api/local-upload", {
    method: "POST", headers: { "Content-Type": "video/mp4", "X-Media-Name": "test.mp4" }, body: "fixture bytes", signal,
  }));
  for (mode of ["error", "empty", "missing", "killed"]) {
    const response = await upload();
    assert.equal(response.status, 503, mode);
    assert.equal(response.headers.get("Retry-After"), "10");
    assert.match((await response.json()).error, /could not be prepared.*not saved/);
    assert.equal(saved, 0);
    assert.deepEqual(await readdir(files), ["existing.jpg"]);
    assert.equal(await readFile(join(files, "existing.jpg"), "utf8"), "keep this file");
  }
  mode = "success";
  const response = await upload();
  assert.equal(response.status, 201);
  const { media } = await response.json();
  assert.match(media.url, /^\/api\/local-playback\?/);
  assert.equal(saved, 1);
  assert.equal((await readdir(files)).length, 3);
  assert.ok(logs.some(([message]) => message === "Could not generate video thumbnail"));

  // An abandoned request must not insert a record after processing finishes.
  const before = (await readdir(files)).sort();
  const controller = new AbortController();
  mocks["@/lib/local-storage"].generateLocalThumbnail = async () => { controller.abort(); };
  const aborted = await upload(controller.signal);
  assert.equal(aborted.status, 400);
  assert.match((await aborted.json()).error, /cancelled/);
  assert.equal(saved, 1);
  assert.deepEqual((await readdir(files)).sort(), before);

  mocks["@/lib/local-storage"].generateLocalThumbnail = async () => {};
  mocks["@/lib/db"].addMedia = async () => { throw Object.assign(new Error("catalog write failed"), { code: "ENOSPC" }); };
  const writeFailed = await upload();
  assert.equal(writeFailed.status, 500);
  assert.equal(saved, 1);
  assert.deepEqual((await readdir(files)).sort(), before);

  mode = "error";
  mocks["@/lib/local-storage"].deleteStoredLocalMedia = async () => { throw Object.assign(new Error("cleanup denied"), { code: "EACCES" }); };
  const cleanupFailed = await upload();
  assert.equal(cleanupFailed.status, 500);
  assert.match((await cleanupFailed.json()).error, /could not be fully removed/);
  assert.equal(saved, 1);
  assert.ok(logs.some(([message]) => message === "Upload cleanup failed"));
});
