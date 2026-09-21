import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

// Compile only the server modules under test, without starting Next or touching the catalog.
test("storage compatibility and local persistence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-storage-"));
  const originalCwd = process.cwd();
  t.after(async () => { process.chdir(originalCwd); await rm(directory, { recursive: true, force: true }); });
  for (const name of ["media-storage", "db"]) {
    const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    await writeFile(join(directory, `${name}.js`), ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const require = createRequire(import.meta.url);
  const { inferMediaStorage } = require(join(directory, "media-storage.js"));
  for (const [url, provider, access, key, playbackId] of [
    ["mux:playback", "mux", "public", "asset", "playback"],
    ["mux-signed:playback", "mux", "signed", "asset", "playback"],
    ["https://store.public.blob.vercel-storage.com/media/a.jpg", "vercel-blob", "public"],
    ["https://store.private.blob.vercel-storage.com/protected-media/a.jpg", "vercel-blob", "private"],
    ["/uploads/example.mp4", "local", "public", "example.mp4"],
    ["https://store.public.blob.vercel-storage.com.evil.test/a.jpg", "external", "unknown"],
    ["https://example.com/photo.jpg", "external", "unknown"],
    ["/outside/example.mp4", "external", "unknown"],
  ]) {
    assert.deepEqual(inferMediaStorage({ id: "mux:asset", url }), {
      provider, access, objectKey: key ?? url, playbackId: playbackId ?? null,
    });
  }
  process.chdir(directory);
  await mkdir(join(directory, "data"));
  const legacy = { id: "legacy", url: "/uploads/a.jpg", type: "photo", title: "Old", createdAt: "Today", album: "Uploads" };
  const catalog = join(directory, "data/media.json");
  await writeFile(catalog, JSON.stringify([legacy]));
  const db = require(join(directory, "db.js"));
  assert.deepEqual(await db.readMedia(), [{ ...legacy, visibility: "public" }]);
  assert.equal((await db.getLocalMediaStorage("legacy")).provider, "local");
  const edited = await db.updateLocalMediaDetails("legacy", "Edited", "Description", "private");
  assert.equal(edited.url, legacy.url);
  assert.equal("storage" in edited, false);
  assert.equal((await db.getLocalMediaStorage("legacy")).access, "public");
  const explicit = { provider: "local", objectKey: "videos/new.mp4", playbackId: null, access: "private" };
  await db.addMedia({ ...legacy, id: "new", url: "/api/future/new" }, explicit);
  assert.deepEqual(await db.getLocalMediaStorage("new"), explicit);
  assert.equal((await db.readMedia()).some((item) => "storage" in item), false);
  const persisted = JSON.parse(await readFile(catalog, "utf8"));
  assert.equal(persisted.find((item) => item.id === "legacy").storage.provider, "local");
  await db.removeMedia("new");
  assert.equal(await db.getLocalMediaStorage("new"), null);
  assert.equal((await db.readMedia()).length, 1);
  await Promise.all(Array.from({ length: 8 }, (_, index) => db.addMedia({ ...legacy, id: `concurrent-${index}` })));
  assert.equal((await db.readMedia()).length, 9);
  await Promise.all(Array.from({ length: 8 }, (_, index) => db.removeMedia(`concurrent-${index}`)));
  assert.equal((await db.readMedia()).length, 1);
  const validCatalog = await readFile(catalog, "utf8");
  await writeFile(catalog, "not valid JSON");
  await assert.rejects(db.addMedia({ ...legacy, id: "must-not-overwrite" }));
  assert.equal(await readFile(catalog, "utf8"), "not valid JSON");
  await writeFile(catalog, validCatalog);

});
