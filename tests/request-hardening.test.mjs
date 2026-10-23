import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, mocks) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, Response, URL, process, TextDecoder });
  return exports;
}

test("media edits reject malformed and non-object JSON before catalog changes", async () => {
  let administrator = true;
  let writes = 0;
  const json = await load("../src/lib/request-json.ts", {});
  const route = await load("../src/app/api/media/route.ts", {
    "@/lib/request-json": json,
    "next/server": { NextResponse: Response },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/admin-origin": { validateAdminOrigin: () => null },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/media": { isSignedMuxUrl: () => false, isMediaVisibility: (value) => ["public", "private", "unlisted"].includes(value) },
    "@/lib/database": { usesDatabase: false },
    "@/lib/db": { updateLocalMediaDetails: async (_id, title) => { writes++; return { title }; } },
  });
  const request = (body) => new Request("https://site.test/api/media", { method: "PATCH", headers: { "Content-Type": "application/json" }, body });
  for (const body of ["{", "null", "[]", '"text"', "42", "true"]) {
    const response = await route.PATCH(request(body));
    assert.equal(response.status, 400, body);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  }
  assert.equal(writes, 0);
  assert.equal((await route.PATCH(request(JSON.stringify({ id: "local:test", title: "Edited", visibility: "private" })))).status, 200);
  assert.equal(writes, 1);
  administrator = false;
  assert.equal((await route.PATCH(request("{"))).status, 401);
  assert.equal(writes, 1);
});

test("video structured data cannot terminate its script and is absent on protected items", async () => {
  const title = '</script><script>alert("title")</script>';
  const description = '</ScRiPt><img src=x onerror="alert(1)">';
  let visibility = "public";
  const jsx = (type, props) => ({ type, props });
  const page = await load("../src/app/videos/[id]/page.tsx", {
    "react": { cache: (fn) => fn }, "react/jsx-runtime": { jsx, jsxs: jsx },
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { isAdmin: () => true },
    "@/lib/db": { readMedia: async () => [{ id: "mux:sample", type: "video", title, description, url: "mux:sample", visibility }] },
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { muxPlaybackIdFromUrl: () => "sample", isSignedMuxUrl: () => false },
    "@/lib/site-url": { getSiteUrl: () => new URL("https://site.test") },
  });
  function scripts(node) {
    if (!node || typeof node !== "object") return [];
    if (Array.isArray(node)) return node.flatMap(scripts);
    return [...(node.type === "script" ? [node] : []), ...scripts(node.props?.children)];
  }
  const props = { params: Promise.resolve({ id: "mux:sample" }) };
  const [script] = scripts(await page.default(props));
  const serialized = script.props.dangerouslySetInnerHTML.__html;
  assert.equal(serialized.includes("<"), false);
  assert.equal(JSON.parse(serialized).name, title);
  assert.equal(JSON.parse(serialized).description, description);
  for (visibility of ["private", "unlisted"]) assert.equal(scripts(await page.default(props)).length, 0);
});
