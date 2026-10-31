import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(path, mocks = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, URL, Response });
  return exports;
}

test("profile avatar updates accept only an existing public local photo owned by the profile", async () => {
  let candidate;
  let writes = 0;
  class ProfileInputError extends Error {}
  const route = await load("../src/app/api/profiles/route.ts", {
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: true } }) },
    "@/lib/auth": { isAdmin: (user) => user.isAdmin },
    "@/lib/admin-origin": { validateAdminOrigin: () => null },
    "@/lib/database": { usesDatabase: false },
    "@/lib/local-storage": { usesLocalStorage: true },
    "@/lib/db": { readMedia: async () => candidate ? [candidate] : [] },
    "@/lib/profile-types": { mediaProfileId: (item) => item.profileId ?? "default" },
    "@/lib/request-json": { readJsonObject: (request) => request.json() },
    "@/lib/profiles": { ProfileInputError, saveProfile: async (body) => { writes++; return body; } },
  });
  const request = (id = "local:photo") => new Request("https://site.test/api/profiles", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: "profile-a", name: "Profile A", slug: "profile-a", avatarMediaId: id }),
  });
  const valid = { id: "local:photo", profileId: "profile-a", type: "photo", visibility: "public" };
  for (const photo of [null, { ...valid, visibility: "private" }, { ...valid, visibility: "unlisted" }, { ...valid, profileId: "profile-b" }, { ...valid, type: "video" }, { ...valid, id: "remote:photo" }]) {
    candidate = photo;
    const response = await route.PATCH(request(photo?.id));
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  assert.equal(writes, 0);
  candidate = valid;
  assert.equal((await route.POST(request())).status, 400, "Avatar cannot be assigned during creation");
  assert.equal(writes, 0);
  assert.equal((await route.PATCH(request())).status, 200);
  assert.equal(writes, 1);
  assert.equal((await route.PATCH(request(""))).status, 200, "Clear selection to initials");
  assert.equal(writes, 2);
});

test("public profile rendering rechecks avatar eligibility after visibility, ownership or deletion changes", async () => {
  let candidate;
  const valid = { id: "local:photo", profileId: "profile-a", type: "photo", visibility: "public", url: "/api/local-media?id=local%3Aphoto" };
  const jsx = (type, props) => ({ type, props });
  const page = await load("../src/app/p/[slug]/page.tsx", {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/image": { default: "AvatarImage" },
    "@/lib/database": { usesDatabase: false },
    "@/lib/local-storage": { usesLocalStorage: true },
    "@/lib/profiles": { getProfileBySlug: async () => ({ id: "profile-a", slug: "profile-a", name: "Profile A", avatarMediaId: "local:photo", socialLinks: [] }) },
    "@/lib/profile-types": { mediaProfileId: (item) => item.profileId ?? "default" },
    "@/lib/public-media": { getInitialPublicMedia: async () => ({ media: [] }) },
    "@/lib/db": { readMedia: async () => candidate ? [candidate] : [] },
    "@/lib/site-url": { getSiteUrl: () => new URL("https://site.test") },
  });
  const props = { params: Promise.resolve({ slug: "profile-a" }), searchParams: Promise.resolve({}) };
  function images(tree) {
    if (!tree || typeof tree !== "object") return [];
    if (Array.isArray(tree)) return tree.flatMap(images);
    return [...(tree.type === "AvatarImage" ? [tree] : []), ...images(tree.props?.children)];
  }
  candidate = valid;
  assert.equal(images(await page.default(props)).length, 1);
  for (const photo of [null, { ...valid, visibility: "private" }, { ...valid, visibility: "unlisted" }, { ...valid, profileId: "profile-b" }, { ...valid, type: "video" }]) {
    candidate = photo;
    const result = await page.default(props);
    assert.equal(images(result).length, 0);
    assert.equal(JSON.stringify(result).includes('"aria-hidden":"true"'), true);
  }
  candidate = valid;
  assert.equal(images(await page.default(props)).length, 1, "Restored eligible image is shown again");
});
