import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, readdir, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

test("overlapping upload requests save one record and clean only the rejected upload's files", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-upload-race-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const compile = async (path) => ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const name of ["media-storage", "profile-types", "db"]) {
    await writeFile(join(directory, `${name}.cjs`), await compile(`../src/lib/${name}.ts`));
  }
  await writeFile(join(directory, "catalog-lock.cjs"), await readFile(new URL("../src/lib/catalog-lock.cjs", import.meta.url)));
  const require = createRequire(import.meta.url);
  const load = (name) => require(join(directory, `${name}.cjs`));
  // Load the real catalog with a private test directory, without changing the app environment.
  const db = {};
  new Function("require", "exports", "process", await readFile(join(directory, "db.cjs"), "utf8"))(
    (name) => name.startsWith("./") ? (name === "./catalog-lock.cjs" ? require(join(directory, "catalog-lock.cjs")) : load(name.slice(2))) : require(name), db,
    { env: { MEDIA_DATA_DIR: directory } },
  );
  let nextId = 0;
  let prepared = 0;
  let release;
  const bothPrepared = new Promise((resolve) => { release = resolve; });
  const deleted = [];
  const mocks = {
    "@/lib/rate-limit": { limitAdminAction: async () => null },
    "@/lib/profile-types": load("profile-types"),
    "@/lib/profiles": { getProfile: async () => ({ id: "hymecymeyseh" }) },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { authOptions: {}, isAdmin: () => true },
    "@/lib/db": db,
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { normalizeOriginalFileName: (value) => value },
    "@/lib/local-storage": {
      usesLocalStorage: true, maximumLocalUploadBytes: 500 * 1024 * 1024,
      LocalUploadError: class extends Error {},
      storeLocalUpload: async () => {
        const key = `upload-${++nextId}.mp4`;
        await writeFile(join(directory, key), "original bytes");
        return { id: `local:${key}`, url: `/api/local-media?id=${key}`, contentHash: "identical", size: 14,
          storage: { provider: "local", objectKey: key, playbackId: null, access: "private" } };
      },
      probeLocalVideoDuration: async () => 5,
      generateLocalThumbnail: async (key) => writeFile(join(directory, `${key}.jpg`), "thumbnail"),
      generateLocalPlayback: async (key) => {
        await writeFile(join(directory, `${key}.web.mp4`), "playback");
        if (++prepared === 2) release();
        // Both requests pass the early duplicate check before either can insert.
        await bothPrepared;
        return `${key}.web.mp4`;
      },
      deleteStoredLocalMedia: async (key) => {
        deleted.push(key);
        for (const suffix of ["", ".jpg", ".web.mp4"]) await unlink(join(directory, key + suffix));
      },
    },
  };
  const route = {};
  vm.runInNewContext(await compile("../src/app/api/local-upload/route.ts"), {
    exports: route, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; },
    Response, URL, console, process,
  });
  const upload = () => route.POST(new Request("http://localhost/api/local-upload", {
    method: "POST", headers: { "Content-Type": "video/mp4", "X-Media-Name": "test.mp4" }, body: "fixture",
  }));
  const responses = await Promise.all([upload(), upload()]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const winner = await responses.find((response) => response.status === 201).json();
  const rejected = await responses.find((response) => response.status === 409).json();
  assert.match(rejected.error, /already been uploaded/);
  const records = JSON.parse(await readFile(join(directory, "media.json"), "utf8"));
  assert.equal(records.length, 1);
  assert.equal(records[0].id, winner.media.id);
  const key = records[0].storage.objectKey;
  assert.deepEqual((await readdir(directory)).filter((name) => name.startsWith("upload-")).sort(),
    [key, `${key}.jpg`, `${key}.web.mp4`].sort());
  assert.equal(deleted.length, 1);
  assert.notEqual(deleted[0], key);
  assert.match(winner.media.url, /^\/api\/local-playback\?/);
});
