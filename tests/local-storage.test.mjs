import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rm, readdir, symlink, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

test("private local file storage and range delivery", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-files-"));
  const previousRoot = process.env.MEDIA_STORAGE_ROOT;
  process.env.MEDIA_STORAGE_ROOT = join(directory, "media");
  t.after(async () => {
    if (previousRoot === undefined) delete process.env.MEDIA_STORAGE_ROOT;
    else process.env.MEDIA_STORAGE_ROOT = previousRoot;
    await rm(directory, { recursive: true, force: true });
  });
  const source = await readFile(new URL("../src/lib/local-storage.ts", import.meta.url), "utf8");
  await writeFile(join(directory, "local-storage.cjs"), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const api = createRequire(import.meta.url)(join(directory, "local-storage.cjs"));
  assert.equal(api.validateLocalVideoDuration(300), 300);
  assert.throws(() => api.validateLocalVideoDuration(300.01), /five minutes or shorter/);
  assert.throws(() => api.validateLocalVideoDuration(NaN), (error) => error instanceof api.LocalUploadError && error.status === 422);
  assert.throws(() => api.validateLocalVideoDuration(Infinity), (error) => error instanceof api.LocalUploadError && error.status === 422);
  assert.throws(() => api.validateLocalVideoDuration(0), (error) => error instanceof api.LocalUploadError && error.status === 422);
  const bytes = Buffer.from("0123456789abcdefghij");
  const stored = await api.storeLocalUpload(new Blob([bytes]).stream(), "video/mp4");
  const key = stored.storage.objectKey;
  await assert.rejects(api.probeLocalVideoDuration(key), (error) => error instanceof api.LocalUploadError && error.status === 422);
  assert.equal(stored.storage.access, "private");
  assert.equal(stored.size, bytes.length);
  assert.equal((await stat(join(process.env.MEDIA_STORAGE_ROOT, key))).mode & 0o777, 0o600);

  const heic = await api.storeLocalUpload(new Blob([bytes]).stream(), "image/heic");
  assert.match(heic.storage.objectKey, /\.heic$/);
  const heicResponse = await api.localMediaResponse(heic.storage.objectKey, new Request("http://test/"));
  assert.equal(heicResponse.headers.get("content-type"), "image/heic");
  await heicResponse.body.cancel();
  await api.deleteStoredLocalMedia(heic.storage.objectKey);

  for (const [range, status, expected, contentRange] of [
    [null, 200, bytes.toString(), null],
    ["bytes=2-5", 206, "2345", "bytes 2-5/20"],
    ["bytes=17-", 206, "hij", "bytes 17-19/20"],
    ["bytes=-3", 206, "hij", "bytes 17-19/20"],
    ["bytes=0-999", 206, bytes.toString(), "bytes 0-19/20"],
    ["bytes=30-", 416, "", "bytes */20"],
    ["bytes=5-2", 416, "", "bytes */20"],
    ["bytes=-0", 416, "", "bytes */20"],
    ["bytes=0-1,4-5", 416, "", "bytes */20"],
  ]) {
    const response = await api.localMediaResponse(key, new Request("http://test/", { headers: range ? { Range: range } : {} }));
    assert.equal(response.status, status, range);
    assert.equal(await response.text(), expected, range);
    assert.equal(response.headers.get("content-range"), contentRange);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  const head = await api.localMediaResponse(key, new Request("http://test/", { method: "HEAD", headers: { Range: "bytes=2-5" } }));
  assert.equal(head.headers.get("content-length"), "20");
  assert.equal(await head.text(), "");
  const ifRange = await api.localMediaResponse(key, new Request("http://test/", { headers: { Range: "bytes=2-5", "If-Range": '"old"' } }));
  assert.equal(ifRange.status, 200);
  await ifRange.text();
  await assert.rejects(api.localMediaResponse("../secret", new Request("http://test/")));
  await assert.rejects(api.storeLocalUpload(new Blob(["<svg/>"]).stream(), "image/svg+xml"));
  await assert.rejects(api.storeLocalUpload(new Blob([]).stream(), "image/png"));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(api.storeLocalUpload(new Blob([bytes]).stream(), "video/mp4", controller.signal));
  let count = 0;
  const oversized = new ReadableStream({ pull(controller) {
    if (count++ < 501) controller.enqueue(new Uint8Array(1024 * 1024));
    else controller.close();
  } });
  await assert.rejects(api.storeLocalUpload(oversized, "video/mp4"), (error) => error.status === 413);
  assert.deepEqual(await readdir(process.env.MEDIA_STORAGE_ROOT), [key]);
  const linkKey = "00000000-0000-4000-8000-000000000000.mp4";
  await symlink(join(directory, "local-storage.cjs"), join(process.env.MEDIA_STORAGE_ROOT, linkKey));
  await assert.rejects(api.localMediaResponse(linkKey, new Request("http://test/")), (error) => error.code === "ELOOP");
  await api.deleteStoredLocalMedia(linkKey);
  await api.deleteStoredLocalMedia(key);
  assert.deepEqual(await readdir(process.env.MEDIA_STORAGE_ROOT), []);
  assert.equal((await readFile(join(directory, "local-storage.cjs"), "utf8")).length > 0, true);
  process.env.MEDIA_STORAGE_ROOT = process.cwd();
  await assert.rejects(api.storeLocalUpload(new Blob([bytes]).stream(), "video/mp4"), /outside the repository/);
});
