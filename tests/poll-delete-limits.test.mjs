import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, mocks) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, process });
  return exports;
}

test("media and album deletion require authorization and quota before any lookup or removal", async () => {
  let administrator = false;
  let blocked = true;
  let counted = 0;
  let removed = 0;
  let files = 0;
  const common = {
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { authOptions: {}, isAdmin: (user) => user.isAdmin },
    "next/server": { NextResponse: Response },
    "@/lib/rate-limit": { limitAdminAction: async (action) => {
      assert.equal(action, "delete"); counted++;
      return blocked ? Response.json({ error: "Too many deletion requests" }, { status: 429, headers: { "Retry-After": "60" } }) : null;
    } },
  };
  const media = await load("../src/app/api/media/route.ts", { ...common,
    "@/lib/local-storage": { usesLocalStorage: true, deleteStoredLocalMedia: async () => { files++; } },
    "@/lib/database": { usesDatabase: false },
    "@/lib/db": { removeMedia: async (_id, beforeRemove) => { removed++; await beforeRemove({}, { provider: "local", access: "private", objectKey: "test.mp4" }); return true; } },
  });
  const albums = await load("../src/app/api/albums/[id]/route.ts", { ...common,
    "@/lib/database": { usesDatabase: true, deleteAlbum: async () => { removed++; return true; } },
  });
  const calls = [
    () => media.DELETE(new Request("https://site.test/api/media?pathname=local%3Atest", { method: "DELETE" })),
    () => albums.DELETE(new Request("https://site.test/api/albums/test", { method: "DELETE" }), { params: Promise.resolve({ id: "test" }) }),
  ];
  for (const call of calls) assert.equal((await call()).status, 401);
  assert.equal(counted, 0);
  administrator = true;
  for (const call of calls) {
    const response = await call();
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
  }
  assert.equal(removed, 0);
  assert.equal(files, 0);
  blocked = false;
  for (const call of calls) assert.equal((await call()).status, 200);
  assert.equal(removed, 2);
  assert.equal(files, 1);
});

test("private photo polling charges only valid authorized requests and stops before database access when throttled", async () => {
  let administrator = false;
  let blocked = true;
  let counted = 0;
  let reads = 0;
  let ready = false;
  const route = await load("../src/app/api/private-upload/route.ts", {
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { authOptions: {}, isAdmin: (user) => user.isAdmin },
    "next/server": { NextResponse: Response },
    "@/lib/storage": { usesPrivateBlobStorage: true, isPrivateBlobUrl: () => true },
    "@/lib/database": { usesDatabase: true, getMediaById: async () => { reads++; return ready ? { id: "protected-media/test", type: "photo", visibility: "private", url: "private-storage-url" } : null; } },
    "@/lib/media": { privatePhotoDeliveryUrl: () => "/api/private-media?id=test" },
    "@/lib/rate-limit": { limitAdminAction: async (action) => { assert.equal(action, "poll"); counted++; return blocked ? new Response(null, { status: 429, headers: { "Retry-After": "60" } }) : null; } },
  });
  const request = () => new Request("https://site.test/api/private-upload?id=protected-media%2Ftest");
  assert.equal((await route.GET(request())).status, 401);
  assert.equal(counted, 0);
  administrator = true;
  assert.equal((await route.GET(new Request("https://site.test/api/private-upload?id=invalid"))).status, 400);
  assert.equal(counted, 0);
  assert.equal((await route.GET(request())).status, 429);
  assert.equal(reads, 0);
  blocked = false;
  assert.equal((await route.GET(request())).status, 202);
  ready = true;
  const response = await route.GET(request());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).media.url, "/api/private-media?id=test");
  assert.equal(reads, 2);
});

test("pending-photo retries honor server delays and back off safely on missing or invalid headers", async () => {
  const { uploadPollDelay } = await load("../src/lib/upload-polling.ts", {});
  const response = (status, retry) => new Response(null, { status, headers: retry === undefined ? {} : { "Retry-After": retry } });
  assert.equal(uploadPollDelay(response(202, "2")), 2000);
  assert.equal(uploadPollDelay(response(429, "60")), 60000);
  assert.equal(uploadPollDelay(response(503, "10")), 10000);
  assert.equal(uploadPollDelay(response(429)), 10000);
  assert.equal(uploadPollDelay(response(429, "invalid")), 10000);
  const now = Date.parse("2026-10-22T12:00:00Z");
  assert.equal(uploadPollDelay(response(429, "Thu, 22 Oct 2026 12:01:00 GMT"), now), 60000);
  assert.equal(uploadPollDelay(response(503, "-1")), 2000);
});
