import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, mocks = {}) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, console });
  return exports;
}
const roles = ["anonymous", "member", "administrator"];
function auth(role) {
  return {
    "next-auth": { getServerSession: async () => role === "anonymous" ? null : ({ user: { isAdmin: role === "administrator" } }) },
    "@/lib/auth": { isAdmin: (user) => user?.isAdmin === true },
  };
}
const notFound = () => { throw new Error("NOT_FOUND"); };
const jsx = (type, props) => ({ type, props });

test("local originals, playback and thumbnails enforce the complete role/visibility matrix before storage access", async () => {
  for (const routeName of ["local-media", "local-playback", "local-thumbnail"]) {
    for (const role of roles) {
      let item = { id: "local:test", type: "video", visibility: "public" };
      let storageReads = 0;
      let delivered = [];
      let storage = { provider: "local", access: "private", objectKey: "original.mp4", playbackObjectKey: "playback.mp4" };
      const route = await load(`../src/app/api/${routeName}/route.ts`, {
        ...auth(role),
        "@/lib/database": { usesDatabase: false },
        "@/lib/db": { readMedia: async () => item ? [item] : [], getLocalMediaStorage: async () => { storageReads++; return storage; } },
        "@/lib/local-storage": {
          localMediaResponse: async (key, request) => { delivered.push(key); return new Response(request.method === "HEAD" ? null : "bytes", { headers: { "Cache-Control": "private, no-store" } }); },
          localThumbnailResponse: async (key) => { delivered.push(key); return new Response("thumbnail", { headers: { "Cache-Control": "private, no-store" } }); },
        },
      });
      const get = (query = "?id=local%3Atest", method = "GET") => route.GET(new Request(`https://site.test/api/${routeName}${query}`, { method }));
      for (const visibility of ["public", "unlisted", "private"]) {
        item = { ...item, visibility };
        storageReads = 0;
        delivered = [];
        const response = await get();
        const allowed = visibility !== "private" || role === "administrator";
        assert.equal(response.status, allowed ? 200 : 404, `${routeName}/${role}/${visibility}`);
        assert.equal(response.headers.get("cache-control"), "private, no-store");
        assert.equal(storageReads, allowed ? 1 : 0);
        assert.deepEqual(delivered, allowed ? [routeName === "local-playback" ? "playback.mp4" : "original.mp4"] : []);
        if (!allowed) assert.equal(await response.text(), "Not found");
      }
      item.visibility = "public";
      for (const query of ["", "?id=missing", `?id=${"x".repeat(2049)}`]) {
        storageReads = 0;
        const response = await get(query);
        assert.equal(response.status, 404);
        assert.equal(storageReads, 0);
      }
      if (routeName !== "local-media") {
        item.type = "photo";
        assert.equal((await get()).status, 404);
        item.type = "video";
      }
      storage = { provider: "blob", access: "private", objectKey: "original.mp4" };
      assert.equal((await get()).status, 404);
      storage = { provider: "local", access: "private", objectKey: "original.mp4" };
      if (routeName === "local-playback") assert.equal((await get()).status, 404);
      if (routeName === "local-media") {
        item.visibility = "private";
        const response = await route.HEAD(new Request("https://site.test/api/local-media?id=local%3Atest", { method: "HEAD" }));
        assert.equal(response.status, role === "administrator" ? 200 : 404);
      }
    }
  }
});

test("individual photo/video pages and metadata conceal private items from visitors and members", async () => {
  for (const kind of ["photos", "videos"]) {
    for (const role of roles) {
      let item = { id: "local:test", type: kind === "photos" ? "photo" : "video", title: "Sensitive title", description: "Sensitive description", url: "/api/local-media?id=local%3Atest", visibility: "public" };
      const page = await load(`../src/app/${kind}/[id]/page.tsx`, {
        ...auth(role),
        "react": { cache: (fn) => fn },
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "next/navigation": { notFound },
        "@/lib/db": { readMedia: async () => item ? [item] : [] },
        "@/lib/database": { usesDatabase: false },
        "@/lib/media": { muxPlaybackIdFromUrl: () => null, isSignedMuxUrl: () => false },
        "@/lib/storage": { isPrivateBlobUrl: () => false },
        "@/lib/site-url": { getSiteUrl: () => new URL("https://site.test") },
      });
      const props = { params: Promise.resolve({ id: encodeURIComponent("local:test") }) };
      for (const visibility of ["public", "unlisted", "private"]) {
        item.visibility = visibility;
        const allowed = visibility !== "private" || role === "administrator";
        const metadata = await page.generateMetadata(props);
        if (allowed) {
          assert.ok(await page.default(props));
          assert.ok(metadata.title.includes(item.title));
          if (visibility !== "public") assert.equal(metadata.robots.index, false);
          if (visibility === "private") {
            assert.equal(metadata.openGraph.images.length, 0);
            assert.equal(metadata.twitter.images.length, 0);
          }
        } else {
          await assert.rejects(page.default(props), /NOT_FOUND/);
          assert.equal(metadata.robots.index, false);
          assert.equal(JSON.stringify(metadata).includes(item.title), false);
          assert.equal(JSON.stringify(metadata).includes(item.description), false);
          assert.equal(metadata.openGraph, undefined);
        }
      }
      item = null;
      await assert.rejects(page.default(props), /NOT_FOUND/);
      assert.equal((await page.generateMetadata(props)).robots.index, false);
    }
  }
});

test("public profile previews exclude other profiles, unlisted/private items and original filenames even during an admin session", async () => {
  const media = await load("../src/lib/media.ts");
  const profiles = await load("../src/lib/profile-types.ts");
  const pagination = await load("../src/lib/media-page.ts", { "./media": media });
  const items = [
    { id: "public", profileId: "a", title: "Visible", type: "photo", visibility: "public", url: "/public.jpg", originalFileName: "private-original.jpg" },
    { id: "private", profileId: "a", type: "video", visibility: "private" },
    { id: "unlisted", profileId: "a", type: "video", visibility: "unlisted" },
    { id: "other", profileId: "b", type: "photo", visibility: "public" },
  ];
  for (const role of roles) {
    const helpers = await load("../src/lib/public-media.ts", {
      ...auth(role), "./profile-types": profiles, "@/lib/media": media,
      "@/lib/local-storage": { usesLocalStorage: true },
      "@/lib/database": { usesDatabase: false },
      "@/lib/db": { readMedia: async () => items },
      "@/lib/media-page": pagination,
      "@/lib/storage": { isPrivateBlobUrl: () => false },
    });
    const page = await helpers.getInitialPublicMedia(undefined, "a");
    assert.deepEqual(page.media.map((item) => item.id), ["public"]);
    assert.equal(page.media[0].originalFileName, undefined);
    assert.equal((await helpers.getInitialPublicMedia("video", "a")).media.length, 0);
  }
});

test("anonymous and non-administrator sessions cannot upload, edit, delete or manage profiles", async () => {
  for (const role of ["anonymous", "member"]) {
    let effects = 0;
    const unexpected = () => { effects++; throw new Error("Unexpected side effect"); };
    const mocks = {
      ...auth(role), "next/server": { NextResponse: Response },
      "@/lib/admin-origin": { validateAdminOrigin: unexpected },
      "@/lib/rate-limit": { limitAdminAction: unexpected },
      "@/lib/request-json": { readJsonObject: unexpected },
      "@/lib/database": { usesDatabase: false },
      "@/lib/local-storage": { usesLocalStorage: true, storeLocalUpload: unexpected },
      "@/lib/db": { removeMedia: unexpected, updateLocalMediaDetails: unexpected },
      "@/lib/profiles": { saveProfile: unexpected, readProfiles: unexpected },
    };
    for (const [path, methods] of [["local-upload", ["POST"]], ["media", ["PATCH", "DELETE"]], ["profiles", ["GET", "POST", "PATCH"]]]) {
      const route = await load(`../src/app/api/${path}/route.ts`, mocks);
      for (const method of methods) {
        const response = await route[method](new Request(`https://site.test/api/${path}`, { method }));
        assert.equal(response.status, 401, `${path}/${method}/${role}`);
      }
    }
    assert.equal(effects, 0);
  }
});
