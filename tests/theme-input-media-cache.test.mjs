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
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, TextDecoder });
  return exports;
}

test("theme writes reject invalid or oversized JSON without saving, after authentication and origin checks", async () => {
  const json = await load("../src/lib/request-json.ts");
  let administrator = true;
  let originDenied = false;
  const saved = [];
  const route = await load("../src/app/api/settings/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/admin-origin": { validateAdminOrigin: () => originDenied ? new Response(null, { status: 403 }) : null },
    "@/lib/request-json": json,
    "@/lib/theme": { isSiteTheme: (value) => value === "dark" },
    "@/lib/database": { saveSiteTheme: async (value) => saved.push(value), getSiteTheme: async () => "dark" },
  });
  const req = (body, type = "application/json") => new Request("https://site.test/api/settings", {
    method: "PATCH", headers: { "content-type": type }, body,
  });
  for (const [body, type, status] of [["{", undefined, 400], ["null", undefined, 400], ["[]", undefined, 400], ["{}", "text/plain", 415], [JSON.stringify({ theme: "dark", padding: "x".repeat(json.maximumAdminJsonBytes) }), undefined, 413]]) {
    const response = await route.PATCH(req(body, type));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.deepEqual(saved, []);
  administrator = false;
  assert.equal((await route.PATCH(req("{"))).status, 401);
  administrator = true;
  originDenied = true;
  assert.equal((await route.PATCH(req("{"))).status, 403);
  assert.deepEqual(saved, []);
  originDenied = false;
  assert.equal((await route.PATCH(req('{"theme":"unknown"}'))).status, 400);
  assert.equal((await route.PATCH(req('{"theme":"dark"}'))).status, 200);
  assert.deepEqual(saved, ["dark"]);
  assert.equal((await route.GET()).status, 200);
});

test("media listings are private/no-store for every provider, role and handled error", async () => {
  const helpers = await load("../src/lib/media.ts");
  const profileTypes = await load("../src/lib/profile-types.ts");
  const pagination = await load("../src/lib/media-page.ts", { "./media": helpers });
  for (const mode of ["local", "database", "blob"]) {
    for (const role of ["anonymous", "member", "administrator"]) {
      const administrator = role === "administrator";
      const items = [{ id: "public", type: "photo", title: "Public", url: "/uploads/p.jpg", visibility: "public", originalFileName: "original.jpg" },
        { id: "private", type: "photo", title: "Private", url: "/uploads/q.jpg", visibility: "private" }];
      const route = await load("../src/app/api/media/route.ts", {
        "next/server": { NextResponse: Response },
        "next-auth": { getServerSession: async () => role === "anonymous" ? null : ({ user: { isAdmin: administrator } }) },
        "@/lib/auth": { isAdmin: (user) => user?.isAdmin === true },
        "@/lib/media": helpers,
        "@/lib/media-page": pagination,
        "@/lib/profile-types": profileTypes,
        "@/lib/profiles": { getProfile: async (id) => id !== "missing" },
        "@/lib/local-storage": { usesLocalStorage: mode === "local" },
        "@/lib/db": { readMedia: async () => items },
        "@/lib/database": { usesDatabase: mode === "database", listDatabaseMediaPage: async ({ includeNonPublic }) => {
          assert.equal(includeNonPublic, administrator);
          return { media: items.filter((item) => includeNonPublic || item.visibility === "public") };
        } },
        "@/lib/storage": { usesBlobStorage: mode === "blob", listBlobMedia: async () => items, isPrivateBlobUrl: () => false },
      });
      const response = await route.GET(new Request("https://site.test/api/media"));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "private, no-store", `${mode}/${role}`);
      const body = await response.json();
      assert.equal(body.media.length, administrator ? 2 : 1);
      assert.equal(body.media[0].originalFileName, administrator ? "original.jpg" : undefined);
      const denied = await route.GET(new Request("https://site.test/api/media?profile=missing"));
      assert.equal(denied.status, mode === "local" ? 404 : 503);
      assert.equal(denied.headers.get("cache-control"), "private, no-store");
      if (mode === "local") {
        const invalid = await route.GET(new Request("https://site.test/api/media?cursor=invalid"));
        assert.equal(invalid.status, 400);
        assert.equal(invalid.headers.get("cache-control"), "private, no-store");
      }
    }
  }
});
