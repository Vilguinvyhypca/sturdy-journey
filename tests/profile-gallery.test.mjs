import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function loadSource(path, dependencies = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, Response, URL, Buffer });
  return exports;
}

test("profile media stays isolated and public previews exclude private items for administrators", async () => {
  const mediaHelpers = await loadSource("../src/lib/media.ts");
  const pagination = await loadSource("../src/lib/media-page.ts", { "./media": mediaHelpers });
  const profiles = await loadSource("../src/lib/profile-types.ts");
  let administrator = false;
  const items = [
    { id: "a-public", profileId: "a", title: "Public A", url: "/uploads/a-public.jpg", type: "photo", visibility: "public" },
    { id: "a-private", profileId: "a", title: "Private A", url: "/uploads/a-private.jpg", type: "photo", visibility: "private" },
    { id: "a-unlisted", profileId: "a", title: "Unlisted A", url: "/uploads/a-unlisted.mp4", type: "video", visibility: "unlisted" },
    { id: "a-public-video", profileId: "a", title: "Public video A", url: "/uploads/a-public-video.mp4", type: "video", visibility: "public" },
    { id: "b-public", profileId: "b", title: "Public B", url: "/uploads/b-public.jpg", type: "photo", visibility: "public" },
    { id: "legacy", title: "Legacy", url: "/uploads/legacy.jpg", type: "photo", visibility: "public" },
  ];
  const route = await loadSource("../src/app/api/media/route.ts", {
    "@/lib/request-json": {},
    "@/lib/rate-limit": { limitAdminAction: async () => null },
    "@/lib/profile-types": profiles,
    "@/lib/profiles": { getProfile: async (id) => ["a", "b", profiles.defaultProfileId].includes(id) },
    "@/lib/local-storage": { usesLocalStorage: true },
    "next/server": { NextResponse: Response },
    "@vercel/blob": {},
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/db": { readMedia: async () => items },
    "@/lib/auth": { isAdmin: (user) => user?.isAdmin === true },
    "@/lib/database": { usesDatabase: false },
    "@/lib/mux": { createMuxPlaybackTokens: () => ({}) },
    "@/lib/media": mediaHelpers,
    "@/lib/media-page": pagination,
    "@/lib/storage": { usesBlobStorage: false, isPrivateBlobUrl: () => false, listBlobMedia: async () => [] },
  });
  const get = async (query) => route.GET(new Request(`http://localhost/api/media?${query}`));
  const ids = async (query) => (await (await get(query)).json()).media.map((item) => item.id);
  assert.deepEqual(await ids("profile=a&visibility=private"), ["a-public", "a-public-video"]);
  assert.deepEqual(await ids(""), ["legacy"]);
  assert.equal((await get("profile=missing")).status, 404);
  administrator = true;
  assert.deepEqual(await ids("profile=a"), ["a-public", "a-private", "a-unlisted", "a-public-video"]);
  assert.deepEqual(await ids("profile=a&visibility=private"), ["a-private"]);
  assert.deepEqual(await ids("profile=a&visibility=public&type=video"), ["a-public-video"]);
  const response = await get("profile=a&visibility=public&limit=1");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  const first = await response.json();
  assert.equal(first.totalCount, 2);
  assert.deepEqual(first.media.map((item) => item.id), ["a-public"]);
  assert.deepEqual(await ids(`profile=a&visibility=public&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`), ["a-public-video"]);
});
