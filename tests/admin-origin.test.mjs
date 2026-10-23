import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, env = {}, mocks = {}) {
  const code = ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, process: { env } });
  return exports;
}
const canonical = "https://site.test";
const request = (headers = {}) => new Request("http://127.0.0.1:3000/api/media?pathname=local:test", { method: "PATCH", headers });

test("administrator origins match configured scheme, host and port independently of proxy headers", async () => {
  const { validateAdminOrigin: check } = await load("../src/lib/admin-origin.ts", {
    NEXTAUTH_URL: canonical, MEDIA_ADMIN_ORIGINS: "http://100.75.180.84:3001,https://phone.test:8443",
    MEDIA_DEV_ORIGINS: "bare.test",
  });
  for (const origin of [canonical, "https://SITE.test:443", "http://100.75.180.84:3001", "https://phone.test:8443"]) {
    assert.equal(check(request({ origin, host: "internal:3000", "x-forwarded-host": "other.test" })), null);
  }
  for (const origin of ["http://site.test", "https://site.test:8443", "https://site.test.evil.test", "https://bare.test", "null", "bad", "https://user@site.test", "https://site.test/path", "https://site.test?q=1", "https://site.test#fragment", "https://site.test, https://evil.test", "https://evil.test"]) {
    const denied = check(request({ origin, host: "evil.test", "x-forwarded-host": "evil.test", forwarded: "host=evil.test;proto=https", "cf-connecting-ip": "127.0.0.1", referer: canonical + "/admin" }));
    assert.equal(denied.status, 403, origin);
    assert.equal(denied.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(check(request({ referer: canonical + "/admin?tab=media" })), null);
  assert.equal(check(request()).status, 403);
  assert.equal(check(request({ referer: "https://evil.test/admin" })).status, 403);
  assert.equal(check(request({ origin: canonical, "sec-fetch-site": "cross-site" })).status, 403);
});

test("administrator origin configuration fails closed", async () => {
  for (const env of [{}, { NEXTAUTH_URL: "broken" }, { NEXTAUTH_URL: "ftp://site.test" }, { NEXTAUTH_URL: "https://user:pass@site.test" }, { NEXTAUTH_URL: canonical, MEDIA_ADMIN_ORIGINS: "phone.test" }, { NEXTAUTH_URL: canonical, MEDIA_ADMIN_ORIGINS: "https://phone.test/path" }]) {
    const { validateAdminOrigin } = await load("../src/lib/admin-origin.ts", env);
    assert.equal(validateAdminOrigin(request({ origin: canonical })).status, 503);
  }
  const { validateAdminOrigin } = await load("../src/lib/admin-origin.ts", { NEXT_PUBLIC_SITE_URL: canonical });
  assert.equal(validateAdminOrigin(request({ origin: canonical })), null);
});

test("all guarded mutations authenticate first and reject cross-origin requests before quota, body or storage work", async () => {
  const guard = await load("../src/lib/admin-origin.ts", { NEXTAUTH_URL: canonical });
  let administrator = true;
  let effects = 0;
  const effect = () => { effects++; throw new Error("Unexpected side effect"); };
  const mocks = {
    "@/lib/admin-origin": guard,
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/database": { usesDatabase: false, saveSiteTheme: effect },
    "@/lib/local-storage": { usesLocalStorage: true, storeLocalUpload: effect },
    "@/lib/rate-limit": { limitAdminAction: effect },
    "@/lib/request-json": { readJsonObject: effect },
    "@/lib/db": { removeMedia: effect, updateLocalMediaDetails: effect },
    "@/lib/profiles": { saveProfile: effect },
  };
  const routes = [];
  for (const [path, methods] of [["local-upload", ["POST"]], ["media", ["PATCH", "DELETE"]], ["profiles", ["POST", "PATCH"]], ["settings", ["PATCH"]], ["albums", ["POST"]], ["albums/[id]", ["PATCH", "DELETE"]], ["media/fingerprints", ["POST"]]]) {
    const route = await load(`../src/app/api/${path}/route.ts`, {}, mocks);
    for (const method of methods) routes.push(route[method]);
  }
  for (const route of routes) {
    assert.equal((await route(request({ origin: "https://evil.test" }), { params: Promise.resolve({ id: "test" }) })).status, 403);
  }
  administrator = false;
  for (const route of routes) assert.equal((await route(request(), { params: Promise.resolve({ id: "test" }) })).status, 401);
  assert.equal(effects, 0);
});

test("a configured origin permits an authenticated theme update behind an internal proxy URL", async () => {
  const guard = await load("../src/lib/admin-origin.ts", { NEXTAUTH_URL: canonical });
  let saved;
  const route = await load("../src/app/api/settings/route.ts", {}, {
    "@/lib/admin-origin": guard,
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/theme": { isSiteTheme: (theme) => theme === "dark" },
    "@/lib/database": { saveSiteTheme: async (theme) => { saved = theme; } },
  });
  const result = await route.PATCH(new Request("http://127.0.0.1:3000/api/settings", {
    method: "PATCH", headers: { origin: canonical, "content-type": "application/json" }, body: JSON.stringify({ theme: "dark" }),
  }));
  assert.equal(result.status, 200);
  assert.equal(saved, "dark");
});
