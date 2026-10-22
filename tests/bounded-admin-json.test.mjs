import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, mocks = {}) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, process, TextDecoder });
  return exports;
}

function request(body, headers = {}) {
  return new Request("https://site.test/api/media", { method: "PATCH", headers: { "Content-Type": "application/json", ...headers }, body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

test("JSON reader enforces declared and streamed byte limits, decodes chunked Unicode, and rejects invalid input", async () => {
  const { readJsonObject, maximumAdminJsonBytes: cap } = await load("../src/lib/request-json.ts");
  const exact = JSON.stringify({ value: "x".repeat(cap - 12) });
  assert.equal(Buffer.byteLength(exact), cap);
  assert.equal((await readJsonObject(request(exact))).value.length, cap - 12);
  await assert.rejects(readJsonObject(request(exact + " ")), (error) => error.status === 413);
  await assert.rejects(readJsonObject(request("{}", { "Content-Length": String(cap + 1) })), (error) => error.status === 413);
  let cancelled = false;
  const streamed = new ReadableStream({ pull(controller) { controller.enqueue(new Uint8Array(4096)); }, cancel() { cancelled = true; } });
  await assert.rejects(readJsonObject(request(streamed, { "Content-Length": "1" })), (error) => error.status === 413);
  assert.equal(cancelled, true);
  const bytes = new TextEncoder().encode(JSON.stringify({ value: "🤩漢字" }));
  let index = 0;
  const unicode = new ReadableStream({ pull(controller) { if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index)); else controller.close(); } });
  assert.equal((await readJsonObject(request(unicode))).value, "🤩漢字");
  for (const body of ["", "{", "null", "[]", '"text"', "false", "10", new Uint8Array([0xff])]) {
    await assert.rejects(readJsonObject(request(body)), (error) => error.status === 400);
  }
  await assert.rejects(readJsonObject(request("{}", { "Content-Type": "text/plain" })), (error) => error.status === 415);
  const byteHeavy = JSON.stringify({ value: "🤩".repeat(cap / 4) });
  assert.ok(byteHeavy.length < cap);
  await assert.rejects(readJsonObject(request(byteHeavy)), (error) => error.status === 413);
});

test("media/profile writes stop before mutations on rejected JSON and retain normal authorized writes", async () => {
  const json = await load("../src/lib/request-json.ts");
  let administrator = true;
  let writes = 0;
  const common = {
    "@/lib/request-json": json,
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/database": { usesDatabase: false },
    "@/lib/local-storage": { usesLocalStorage: true },
    "@/lib/media": { isSignedMuxUrl: () => false, isMediaVisibility: () => true },
  };
  const media = await load("../src/app/api/media/route.ts", { ...common,
    "@/lib/db": { updateLocalMediaDetails: async () => { writes++; return { title: "Edited" }; } },
  });
  const profiles = await load("../src/app/api/profiles/route.ts", { ...common,
    "@/lib/profiles": { ProfileInputError: class extends Error {}, saveProfile: async () => { writes++; return { id: "test" }; } },
  });
  for (const route of [media.PATCH, profiles.POST, profiles.PATCH]) {
    const oversized = JSON.stringify({ id: "test", value: "x".repeat(json.maximumAdminJsonBytes) });
    const denied = await route(request(oversized));
    assert.equal(denied.status, 413);
    assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
    assert.equal((await route(request("{}", { "Content-Type": "text/plain" }))).status, 415);
    assert.equal((await route(request("null"))).status, 400);
  }
  assert.equal(writes, 0);
  const valid = JSON.stringify({ id: "test", title: "Edited", name: "Profile", slug: "profile" });
  assert.equal((await media.PATCH(request(valid))).status, 200);
  assert.equal((await profiles.POST(request(valid))).status, 201);
  assert.equal((await profiles.PATCH(request(valid))).status, 200);
  assert.equal(writes, 3);
  administrator = false;
  for (const route of [media.PATCH, profiles.POST, profiles.PATCH]) assert.equal((await route(request("{"))).status, 401);
  assert.equal(writes, 3);
});
