import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import vm from "node:vm";
import ts from "typescript";
import sharp from "sharp";

const require = createRequire(import.meta.url);
const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

async function temporaryStorage(t) {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-image-"));
  const files = join(root, "files"); await mkdir(files);
  const previous = process.env.MEDIA_STORAGE_ROOT;
  const previousProvider = process.env.MEDIA_UPLOAD_PROVIDER;
  process.env.MEDIA_STORAGE_ROOT = files;
  process.env.MEDIA_UPLOAD_PROVIDER = "local";
  t.after(async () => { if (previous === undefined) delete process.env.MEDIA_STORAGE_ROOT; else process.env.MEDIA_STORAGE_ROOT = previous; if (previousProvider === undefined) delete process.env.MEDIA_UPLOAD_PROVIDER; else process.env.MEDIA_UPLOAD_PROVIDER = previousProvider; await rm(root, { recursive: true, force: true }); });
  await writeFile(join(root, "storage.cjs"), await compile("../src/lib/local-storage.ts"));
  return { root, files, storage: require(join(root, "storage.cjs")) };
}

async function images() {
  const input = { create: { width: 16, height: 12, channels: 3, background: "#2468ac" } };
  const entries = [];
  for (const format of ["jpeg", "png", "gif", "webp", "avif"]) entries.push([`image/${format}`, await sharp(input)[format]().toBuffer()]);
  const frames = Buffer.concat([Buffer.alloc(8 * 8 * 3, 0), Buffer.alloc(8 * 8 * 3, 255)]);
  for (const format of ["gif", "webp"]) {
    const bytes = await sharp(frames, { raw: { width: 8, height: 16, channels: 3, pageHeight: 8 } })[format]({ loop: 0, delay: [100, 100] }).toBuffer();
    assert.equal((await sharp(bytes, { animated: true }).metadata()).pages, 2);
    entries.push([`image/${format}`, bytes]);
  }
  return entries;
}

test("real image decoding accepts supported still/animated formats without rewriting originals", { timeout: 60000 }, async (t) => {
  const { files, storage } = await temporaryStorage(t);
  for (const [type, bytes] of await images()) {
    const stored = await storage.storeLocalUpload(new Blob([bytes]).stream(), type);
    await storage.validateLocalImage(stored.storage.objectKey, type);
    assert.deepEqual(await readFile(join(files, stored.storage.objectKey)), bytes);
    await storage.deleteStoredLocalMedia(stored.storage.objectKey);
  }
  assert.deepEqual(await readdir(files), []);
});

test("image upload rejection cleans files before insertion; valid photos and HEIF conversion remain accepted", { timeout: 60000 }, async (t) => {
  const { files, storage } = await temporaryStorage(t);
  let saved = 0;
  const mocks = {
    "@/lib/rate-limit": { limitAdminAction: async () => null },
    "@/lib/profile-types": { defaultProfileId: "default", mediaProfileId: () => "default" },
    "@/lib/profiles": { getProfile: async () => ({ id: "default" }) },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/admin-origin": { validateAdminOrigin: () => null },
    "@/lib/auth": { isAdmin: () => true },
    "@/lib/db": { DuplicateMediaError: class extends Error {}, readMedia: async () => [], addMedia: async () => { saved++; } },
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { normalizeOriginalFileName: (value) => value },
    "@/lib/local-storage": { ...storage },
  };
  const route = {};
  vm.runInNewContext(await compile("../src/app/api/local-upload/route.ts"), { exports: route, require: (name) => mocks[name] ?? (name === "@/lib/operational-logging" ? { recordAdminChange: async () => {}, recordApplicationFailure: async () => {} } : {}), Response, URL, process, console });
  const upload = (bytes, type, signal) => route.POST(new Request("https://site.test/api/local-upload", { method: "POST", headers: { "Content-Type": type, "X-Media-Name": "photo" }, body: bytes, signal }));
  const entries = await images();
  const jpeg = entries[0][1], png = entries[1][1], avif = entries[4][1];
  for (const [bytes, type] of [[Buffer.from("not an image"), "image/png"], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>'), "image/png"], [png, "image/jpeg"], [jpeg.subarray(0, jpeg.length - 20), "image/jpeg"], [avif, "image/heic"]]) {
    const response = await upload(bytes, type);
    assert.equal(response.status, 422, type);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(saved, 0);
    assert.deepEqual(await readdir(files), []);
  }
  const oversized = Buffer.from(png);
  oversized.writeUInt32BE(8001, 16); oversized.writeUInt32BE(8000, 20);
  let crc = 0xffffffff;
  for (const byte of oversized.subarray(12, 29)) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  oversized.writeUInt32BE((crc ^ 0xffffffff) >>> 0, 29);
  const overLimit = await upload(oversized, "image/png");
  assert.equal(overLimit.status, 422); assert.match((await overLimit.json()).error, /64 megapixels/);
  assert.deepEqual(await readdir(files), []);
  mocks["@/lib/local-storage"].validateLocalImage = async () => { throw new storage.LocalUploadError("Photo validation unavailable", 503); };
  const unavailable = await upload(png, "image/png");
  assert.equal(unavailable.status, 503); assert.equal(unavailable.headers.get("Retry-After"), "10"); assert.deepEqual(await readdir(files), []);
  let jpegChecked = false;
  mocks["@/lib/local-storage"].validateLocalImage = async (key, type) => {
    if (type === "image/jpeg") { jpegChecked = true; throw new storage.LocalUploadError("Converted JPEG invalid", 422); }
    await storage.validateLocalImage(key, type);
  };
  assert.equal((await upload(avif, "image/heif")).status, 422);
  assert.equal(jpegChecked, true);
  assert.deepEqual(await readdir(files), []);
  const controller = new AbortController();
  mocks["@/lib/local-storage"].validateLocalImage = async (key, type) => { await storage.validateLocalImage(key, type); controller.abort(); };
  const cancelled = await upload(png, "image/png", controller.signal);
  assert.equal(cancelled.status, 400); assert.match((await cancelled.json()).error, /cancelled/);
  assert.equal(saved, 0); assert.deepEqual(await readdir(files), []);
  mocks["@/lib/local-storage"].validateLocalImage = storage.validateLocalImage;
  for (const [bytes, type] of [[jpeg, "image/jpeg"], [png, "image/png"], [avif, "image/heif"]]) {
    const response = await upload(bytes, type);
    assert.equal(response.status, 201, type);
    const { media } = await response.json(); assert.equal(media.visibility, "private");
    const names = await readdir(files); assert.equal(names.length, 1);
    if (type === "image/heif") { assert.ok(names[0].endsWith(".jpg")); assert.equal((await sharp(join(files, names[0])).metadata()).format, "jpeg"); }
    await storage.deleteStoredLocalMedia(names[0]);
  }
  assert.equal(saved, 3);
  assert.deepEqual(await readdir(files), []);
});

test("decoder worker enforces pixel bounds, MIME matching and HEIC conversion requirements", async () => {
  const source = await readFile(new URL("../scripts/validate-local-image.cjs", import.meta.url), "utf8");
  for (const scenario of [
    { width: 8000, height: 8000, type: "image/png", format: "png", ok: true, decoded: true },
    { width: 8001, height: 8000, type: "image/png", format: "png", message: "IMAGE_TOO_LARGE" },
    { width: 16, height: 16, type: "image/png", format: "jpeg", message: "IMAGE_INVALID" },
    { width: 16, height: 16, type: "image/heic", format: "heif", compression: "hevc", ok: true, decoded: false },
    { width: 16, height: 16, type: "image/avif", format: "heif", compression: "hevc", message: "IMAGE_INVALID" },
  ]) {
    let decoded = false;
    const pipeline = { metadata: async () => scenario, resize: () => pipeline, raw: () => pipeline, timeout: ({ seconds }) => { assert.equal(seconds, 15); return pipeline; }, toBuffer: async () => { decoded = true; return Buffer.alloc(3); } };
    const decoder = (_path, options) => { assert.equal(options.limitInputPixels, 64_000_000); assert.equal(options.failOn, "warning"); assert.equal(options.pages, 1); return pipeline; };
    decoder.cache = () => {}; decoder.concurrency = (value) => assert.equal(value, 1);
    const result = await new Promise((resolve) => {
      const process = { argv: ["node", "worker", "/test/photo", scenario.type, "64000000"], stdout: { write: (value) => resolve({ ok: true, value }) }, stderr: { write: (value) => resolve({ ok: false, value }) } };
      vm.runInNewContext(source, { require: () => decoder, process });
    });
    assert.equal(result.ok, !!scenario.ok);
    if (scenario.ok) assert.equal(decoded, scenario.decoded);
    else assert.equal(result.value, scenario.message);
  }
});

test("image validator failures distinguish invalid photos from missing, killed or unavailable workers", async (t) => {
  const { root } = await temporaryStorage(t);
  let failure;
  const fakeExec = () => {};
  fakeExec[promisify.custom] = async (command, args, options) => {
    assert.equal(command, process.execPath);
    assert.equal(args[0], "--max-old-space-size=128"); assert.equal(args.at(-1), "64000000");
    assert.equal(options.timeout, 30_000); assert.equal(options.killSignal, "SIGKILL");
    if (failure) throw failure;
    return { stdout: "{}" };
  };
  const storage = {};
  vm.runInNewContext(await compile("../src/lib/local-storage.ts"), { exports: storage, require: (name) => name === "node:child_process" ? { ...require(name), execFile: fakeExec } : require(name), process, Buffer });
  const key = "11111111-1111-4111-8111-111111111111.png";
  for (const [error, status] of [[{ code: 2, stderr: "IMAGE_INVALID" }, 422], [{ code: 2, stderr: "IMAGE_TOO_LARGE" }, 422], [{ code: 69 }, 503], [{ code: "ENOENT" }, 503], [{ code: "EACCES" }, 503], [{ code: 2, killed: true }, 503], [{ signal: "SIGKILL" }, 503]]) {
    failure = error;
    await assert.rejects(storage.validateLocalImage(key, "image/png"), (caught) => caught.status === status);
  }
  failure = null; await storage.validateLocalImage(key, "image/png");
  assert.ok(root);
});
