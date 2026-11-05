import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, mocks = {}) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  new Function("require", "exports", "Response", "URL", "TextDecoder", code)((name) => mocks[name] ?? {}, exports, Response, URL, TextDecoder);
  return exports;
}
const context = { params: Promise.resolve({ id: "album" }) };
function request(body, headers = {}) {
  return new Request("https://site.test/api/albums/album", {
    method: "PATCH", headers: { "content-type": "application/json", ...headers }, body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}
function privateResponse(response, status) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  return response;
}

test("album writes enforce bounded JSON after authorization and configuration, preserving valid edits", async () => {
  const json = await load("../src/lib/request-json.ts");
  let admin = true;
  let originDenied = false;
  let available = true;
  let reads = 0;
  let writes = 0;
  let conflict = false;
  let missing = false;
  const write = async (...values) => {
    writes++;
    if (conflict) throw new Error("unique album name");
    if (missing) return null;
    return { id: values[0], name: values[1], description: values[2] };
  };
  const common = {
    "node:crypto": { randomUUID: () => "created-album" },
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: admin } }) },
    "@/lib/auth": { isAdmin: (user) => user?.isAdmin },
    "@/lib/admin-origin": { validateAdminOrigin: () => originDenied ? Response.json({ error: "origin" }, { status: 403, headers: { "Cache-Control": "private, no-store" } }) : null },
    "@/lib/request-json": { ...json, readJsonObject: async (value) => { reads++; return json.readJsonObject(value); } },
    "@/lib/database": { get usesDatabase() { return available; }, createAlbum: write, updateAlbum: write },
  };
  const list = await load("../src/app/api/albums/route.ts", common);
  const detail = await load("../src/app/api/albums/[id]/route.ts", common);
  const methods = [list.POST, detail.PATCH];
  for (const method of methods) {
    for (const [body, headers, status] of [
      ["null", {}, 400], ["[]", {}, 400], ["{", {}, 400],
      ["{}", { "content-type": "text/plain" }, 415],
      ["{}", { "content-type": "application/jsonp" }, 415],
      ["{}", { "content-length": "65537" }, 413],
      [JSON.stringify({ name: "x".repeat(65536) }), {}, 413],
      [new Uint8Array([255]), {}, 400],
      [JSON.stringify({ name: "" }), {}, 400],
      [JSON.stringify({ name: "x".repeat(81) }), {}, 400],
      [JSON.stringify({ name: "Valid", description: "x".repeat(501) }), {}, 400],
    ]) privateResponse(await method(request(body, headers), context), status);
    let cancelled = false;
    const stream = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(10000)); }, cancel() { cancelled = true; } });
    privateResponse(await method(request(stream, { "content-length": "1" }), context), 413);
    assert.equal(cancelled, true);
  }
  assert.equal(writes, 0);
  const body = JSON.stringify({ name: "  Summer  ", description: "  Photos  " });
  const created = privateResponse(await list.POST(request(body)), 201);
  assert.deepEqual((await created.json()).album, { id: "created-album", name: "Summer", description: "Photos" });
  const edited = privateResponse(await detail.PATCH(request(body), context), 200);
  assert.deepEqual((await edited.json()).album, { id: "album", name: "Summer", description: "Photos" });
  assert.equal(writes, 2);
  conflict = true;
  for (const method of methods) privateResponse(await method(request(body), context), 409);
  conflict = false; missing = true;
  privateResponse(await detail.PATCH(request(body), context), 404);
  const before = reads;
  admin = false;
  for (const method of methods) privateResponse(await method(request("{"), context), 401);
  admin = true; originDenied = true;
  for (const method of methods) privateResponse(await method(request("{"), context), 403);
  originDenied = false; available = false;
  for (const method of methods) privateResponse(await method(request("{"), context), 503);
  assert.equal(reads, before);
});

test("album lists/details keep authorization filtering and private response headers for all handled outcomes", async () => {
  let available = true;
  let admin = false;
  let missing = false;
  let denied = false;
  const filtering = [];
  let deletions = 0;
  let throttled = false;
  const mocks = {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: admin } }) },
    "@/lib/auth": { isAdmin: (user) => user?.isAdmin },
    "@/lib/admin-origin": { validateAdminOrigin: () => denied ? new Response(null, { status: 403, headers: { "Cache-Control": "private, no-store" } }) : null },
    "@/lib/rate-limit": { limitAdminAction: async () => throttled ? new Response(null, { status: 429, headers: { "Cache-Control": "private, no-store", "Retry-After": "5" } }) : null },
    "@/lib/media": { privatePhotoDeliveryUrl: () => "/api/private-media?id=photo" },
    "@/lib/storage": { isPrivateBlobUrl: (url) => url.startsWith("https://private.") },
    "@/lib/database": {
      get usesDatabase() { return available; },
      listAlbums: async (include) => { filtering.push(include); return [{ id: "album" }]; },
      listAlbumsPage: async (options) => { filtering.push(options.includeNonPublic); return { albums: [], nextCursor: null }; },
      getAlbum: async (_id, include) => { filtering.push(include); return missing ? null : { album: { id: "album" }, media: [{ id: "photo", type: "photo", url: "https://private.blob/photo" }] }; },
      deleteAlbum: async () => { deletions++; return !missing; },
    },
  };
  const list = await load("../src/app/api/albums/route.ts", mocks);
  const detail = await load("../src/app/api/albums/[id]/route.ts", mocks);
  for (const administrator of [false, true]) {
    admin = administrator;
    privateResponse(await list.GET(new Request("https://site.test/api/albums")), 200);
    privateResponse(await list.GET(new Request("https://site.test/api/albums?limit=2")), 200);
    const response = privateResponse(await detail.GET(request(), context), 200);
    assert.equal((await response.json()).media[0].url, "/api/private-media?id=photo");
  }
  assert.deepEqual(filtering, [false, false, false, true, true, true]);
  missing = true;
  privateResponse(await detail.GET(request(), context), 404);
  privateResponse(await detail.DELETE(request(), context), 404);
  missing = false;
  privateResponse(await detail.DELETE(request(), context), 200);
  assert.equal(deletions, 2);
  throttled = true;
  assert.equal(privateResponse(await detail.DELETE(request(), context), 429).headers.get("Retry-After"), "5");
  denied = true;
  privateResponse(await detail.DELETE(request(), context), 403);
  admin = false;
  privateResponse(await detail.DELETE(request(), context), 401);
  assert.equal(deletions, 2);
  available = false; admin = true; denied = false;
  assert.deepEqual(await privateResponse(await list.GET(request()), 200).json(), { albums: [] });
  privateResponse(await detail.GET(request(), context), 503);
  privateResponse(await detail.DELETE(request(), context), 503);
});
