import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}

test("administrator quotas are atomic, persistent, bounded, independent, and recover after the rolling window", { timeout: 30000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-limits-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const require = createRequire(import.meta.url);
  const code = await compile("../src/lib/rate-limit.ts");
  function load() {
    const exports = {};
    new Function("require", "exports", "process", "Response", "console", code)(
      (name) => name === "./catalog-lock.cjs" ? require("../src/lib/catalog-lock.cjs") : require(name), exports,
      { env: { MEDIA_DATA_DIR: directory } }, Response, { error() {} },
    );
    return exports;
  }
  const instances = [load(), load()];
  const responses = await Promise.all(Array.from({ length: 16 }, (_, index) => instances[index % 2].limitAdminAction("signin", 100_000)));
  assert.equal(responses.filter((response) => response === null).length, 10);
  assert.equal(responses.filter((response) => response?.status === 429).length, 6);
  const denied = responses.find((response) => response?.status === 429);
  assert.equal(denied.headers.get("Retry-After"), "60");
  assert.equal(denied.headers.get("Cache-Control"), "private, no-store");
  assert.equal((await load().limitAdminAction("signin", 130_000)).headers.get("Retry-After"), "30");
  assert.equal(await load().limitAdminAction("signin", 160_000), null);
  for (let index = 0; index < 120; index++) assert.equal(await instances[0].limitAdminAction("upload", 100_000), null);
  assert.equal((await instances[1].limitAdminAction("upload", 100_000)).status, 429);
  for (const [action, cap] of [["poll", 600], ["delete", 60]]) {
    const state = join(directory, "rate-limits", `${action}.json`);
    await writeFile(state, JSON.stringify(Array(cap - 1).fill(100_000)));
    assert.equal(await instances[0].limitAdminAction(action, 100_000), null);
    const response = await instances[1].limitAdminAction(action, 100_000);
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("Retry-After"), "60");
    assert.match((await response.json()).error, action === "poll" ? /upload-status/ : /deletion/);
    assert.equal(await load().limitAdminAction(action, 160_000), null);
  }
  const file = join(directory, "rate-limits", "upload.json");
  assert.equal(JSON.parse(await readFile(file, "utf8")).length, 120);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  await writeFile(file, "corrupt state");
  assert.equal((await instances[0].limitAdminAction("upload", 200_000)).status, 503);
  assert.equal(await readFile(file, "utf8"), "corrupt state");
});

test("auth limits login submissions and provider starts while leaving session, CSRF, signout and OAuth callbacks available", async () => {
  let counted = 0;
  let handled = 0;
  let limited = true;
  const route = {};
  const mocks = {
    "next-auth": { default: () => async () => { handled++; return new Response(null, { status: 204 }); } },
    "@/lib/auth": { authOptions: {} },
    "@/lib/rate-limit": { limitAdminAction: async () => { counted++; return limited ? Response.json({ error: "Too many sign-in attempts" }, { status: 429, headers: { "Retry-After": "60" } }) : null; } },
  };
  vm.runInNewContext(await compile("../src/app/api/auth/[...nextauth]/route.ts"), {
    exports: route, require: (name) => { assert.ok(name in mocks, name); return mocks[name]; }, URL, Response,
  });
  const contextFor = (path) => ({ params: Promise.resolve({ nextauth: path.split("/").filter(Boolean).map(decodeURIComponent) }) });
  for (const [method, path] of [["POST", "callback/credentials"], ["POST", "signin/github"], ["GET", "signin/github/"], ["POST", "callback/%63redentials/extra"]]) {
    assert.equal((await route[method](new Request(`https://site.test/api/auth/${path}`, { method, headers: { "x-forwarded-for": String(counted), "cf-connecting-ip": String(counted) } }), contextFor(path))).status, 429);
  }
  assert.equal(counted, 4);
  assert.equal(handled, 0);
  const denied = await route.POST(new Request("https://site.test/api/auth/callback/credentials", { method: "POST" }), contextFor("callback/credentials"));
  const clientResult = await denied.json();
  assert.equal(new URL(clientResult.url).searchParams.get("error"), "RateLimited");
  assert.equal(denied.headers.get("Retry-After"), "60");
  counted = 4;
  for (const [method, path] of [["GET", "session"], ["GET", "csrf"], ["GET", "signin"], ["POST", "signout"], ["GET", "callback/github"]]) {
    assert.equal((await route[method](new Request(`https://site.test/api/auth/${path}`, { method }), contextFor(path))).status, 204);
  }
  assert.equal(counted, 4);
  limited = false;
  assert.equal((await route.POST(new Request("https://site.test/api/auth/callback/credentials", { method: "POST" }), contextFor("callback/credentials"))).status, 204);
  assert.equal(counted, 5);
});

test("local upload rejects unauthenticated requests before quota use and throttles administrators before storing bytes", async () => {
  let administrator = false;
  let counted = 0;
  let stored = 0;
  const route = {};
  const mocks = {
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/admin-origin": { validateAdminOrigin: () => null },
    "@/lib/auth": { authOptions: {}, isAdmin: (user) => user.isAdmin },
    "@/lib/local-storage": { usesLocalStorage: true, storeLocalUpload: async () => { stored++; } },
    "@/lib/rate-limit": { limitAdminAction: async () => { counted++; return new Response(null, { status: 429 }); } },
  };
  vm.runInNewContext(await compile("../src/app/api/local-upload/route.ts"), {
    exports: route, require: (name) => mocks[name] ?? {}, Response,
  });
  const request = () => new Request("https://site.test/api/local-upload", { method: "POST", body: "bytes" });
  assert.equal((await route.POST(request())).status, 401);
  assert.equal(counted, 0);
  administrator = true;
  assert.equal((await route.POST(request())).status, 429);
  assert.equal(counted, 1);
  assert.equal(stored, 0);
});
