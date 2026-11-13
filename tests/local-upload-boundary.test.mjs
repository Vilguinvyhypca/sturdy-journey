import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as crypto from "node:crypto";

async function load(path, mocks = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => name === "node:crypto" ? crypto : mocks[name] ?? (name === "@/lib/operational-logging" ? { recordAdminChange: async () => {}, recordApplicationFailure: async () => {} } : {}), Response, Headers, File, Buffer, URL });
  return exports;
}

test("local mode rejects every legacy upload before authentication, body reads, provider callbacks or writes", async () => {
  let effects = 0;
  const unexpected = () => { effects++; throw new Error("Legacy upload reached a side effect"); };
  for (const blobConfigured of [false, true]) {
    const route = await load("../src/app/api/upload/route.ts", {
      "next/server": { NextResponse: Response },
      "next-auth": { getServerSession: unexpected },
      "@/lib/local-storage": { usesLocalStorage: true },
      "@/lib/storage": { usesBlobStorage: blobConfigured, uploadMedia: unexpected },
      "@/lib/db": { addMedia: unexpected, readMedia: unexpected },
      "@/lib/database": { usesDatabase: false, saveMedia: unexpected },
      "@vercel/blob/client": { handleUpload: unexpected },
    });
    for (const contentType of ["application/json", "application/json; charset=utf-8", "multipart/form-data; boundary=test", "application/octet-stream"]) {
      const response = await route.POST({ headers: new Headers({ "content-type": contentType }), json: unexpected, formData: unexpected });
      assert.equal(response.status, 503, contentType);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      assert.match((await response.json()).error, /Refresh the page and use Upload media/);
    }
  }
  assert.equal(effects, 0);
});

test("nonlocal provider callbacks and the retained demo upload path preserve existing behavior", async () => {
  let callbacks = 0;
  let writes = 0;
  const providerBody = { type: "blob.upload-completed" };
  const route = await load("../src/app/api/upload/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/local-storage": { usesLocalStorage: false },
    "@/lib/storage": { usesBlobStorage: true },
    "@vercel/blob/client": { handleUpload: async ({ body, request }) => { assert.equal(body, providerBody); assert.ok(request); callbacks++; return { handled: true }; } },
  });
  const callback = await route.POST({ headers: new Headers({ "content-type": "application/json" }), json: async () => providerBody });
  assert.equal(callback.status, 200);
  assert.equal(callbacks, 1);
  const demo = await load("../src/app/api/upload/route.ts", {
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/local-storage": { usesLocalStorage: false },
    "@/lib/storage": { usesBlobStorage: false, uploadMedia: async () => ({ id: "demo", url: "/uploads/demo.png" }) },
    "@/lib/db": { readMedia: async () => [], addMedia: async () => { writes++; } },
    "@/lib/database": { usesDatabase: false },
  });
  const form = new FormData(); form.set("file", new File(["demo bytes"], "demo.png", { type: "image/png" }));
  const response = await demo.POST({ headers: new Headers({ "content-type": "multipart/form-data" }), formData: async () => form });
  assert.equal(response.status, 201);
  assert.equal(writes, 1);
});

test("administrator configuration and usage responses prevent caching on success, denial, disabled mode and provider error", async () => {
  for (const role of ["anonymous", "member", "administrator"]) {
    let providerCalls = 0;
    let configured = true;
    let failure = false;
    const mocks = {
      "next/server": { NextResponse: Response },
      "next-auth": { getServerSession: async () => role === "anonymous" ? null : ({ user: { isAdmin: role === "administrator" } }) },
      "@/lib/auth": { isAdmin: (user) => user?.isAdmin === true },
      "@/lib/local-storage": { usesLocalStorage: true, maximumLocalUploadBytes: 500 * 1024 * 1024 },
      "@/lib/storage": { usesPrivateBlobStorage: false },
      "@/lib/mux": { get usesMux() { return configured; }, getMuxUsageSummary: async () => { providerCalls++; if (failure) throw new Error("Usage unavailable"); return { assetCount: 1 }; } },
    };
    const config = await load("../src/app/api/upload-config/route.ts", mocks);
    const usage = await load("../src/app/api/admin/mux-usage/route.ts", mocks);
    for (const route of [config, usage]) {
      const response = await route.GET();
      assert.equal(response.status, role === "administrator" ? 200 : 401);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      if (route === config && role === "administrator") assert.equal((await response.json()).local, true);
    }
    assert.equal(providerCalls, role === "administrator" ? 1 : 0);
    if (role === "administrator") {
      configured = false;
      let response = await usage.GET(); assert.equal(response.status, 503); assert.equal(response.headers.get("cache-control"), "private, no-store");
      configured = true; failure = true;
      response = await usage.GET(); assert.equal(response.status, 502); assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
  }
});

test("active administrator mutations prevent caching for rejected and successful operations", async () => {
  for (const role of ["anonymous", "member", "administrator"]) {
    let writes = 0;
    const mocks = {
      "next/server": { NextResponse: Response },
      "next-auth": { getServerSession: async () => role === "anonymous" ? null : ({ user: { isAdmin: role === "administrator" } }) },
      "@/lib/auth": { isAdmin: (user) => user?.isAdmin === true },
      "@/lib/admin-origin": { validateAdminOrigin: () => null },
      "@/lib/local-storage": { usesLocalStorage: false },
      "@/lib/database": { usesDatabase: false, getSiteTheme: async () => "light", saveSiteTheme: async () => { writes++; } },
      "@/lib/request-json": { readJsonObject: (request) => request.json() },
      "@/lib/theme": { isSiteTheme: (theme) => theme === "test" },
    };
    const request = () => new Request("https://site.test/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"theme":"test"}' });
    for (const [path, method, expected] of [["local-upload", "POST", 503], ["settings", "PATCH", 200], ["media", "PATCH", 503], ["media", "DELETE", 400]]) {
      const route = await load(`../src/app/api/${path}/route.ts`, mocks);
      const response = await route[method](request());
      assert.equal(response.status, role === "administrator" ? expected : 401, `${path}/${method}/${role}`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
    }
    assert.equal(writes, role === "administrator" ? 1 : 0);
  }
});
