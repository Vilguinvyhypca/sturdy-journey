import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function metadataFor(type, visibility, administrator = false) {
  const item = { id: "local:sample", type, title: "Sample media", url: "/api/local-media?id=local%3Asample", visibility };
  const dependencies = {
    "react": { cache: fn => fn },
    "react/jsx-runtime": {},
    "next/link": {}, "next/navigation": {},
    "next-auth": { getServerSession: async () => ({ user: { isAdmin: administrator } }) },
    "@/lib/auth": { isAdmin: user => user?.isAdmin === true },
    "@/lib/db": { readMedia: async () => [item] },
    "@/lib/database": { usesDatabase: false },
    "@/lib/media": { muxPlaybackIdFromUrl: () => null, isSignedMuxUrl: () => false },
    "@/lib/site-url": { getSiteUrl: () => new URL("https://example.test") },
    "@/lib/mux": {}, "@/lib/storage": { isPrivateBlobUrl: () => false },
    "@/components/MediaDetails": {}, "@/components/ShareMediaButton": {},
    "@/components/VideoPlayback": {}, "next/image": {},
  };
  const source = await readFile(new URL(`../src/app/${type}s/[id]/page.tsx`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URL, require: name => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`);
    return dependencies[name];
  }});
  return exports.generateMetadata({ params: Promise.resolve({ id: "local:sample" }) });
}

for (const type of ["video", "photo"]) {
  for (const visibility of ["public", "unlisted"]) {
    test(`${visibility} ${type} card links to the app page with an absolute preview image`, async () => {
      const metadata = await metadataFor(type, visibility);
      assert.equal(metadata.openGraph.url, `/${type}s/local%3Asample`);
      assert.equal(metadata.openGraph.siteName, "Hymecymeyseh");
      const image = metadata.openGraph.images[0].url;
      assert.equal(image, `https://example.test/api/${type === "video" ? "local-thumbnail" : "local-media"}?id=local%3Asample`);
      assert.equal(metadata.twitter.images[0], image);
      if (visibility === "unlisted") assert.equal(metadata.robots.index, false);
    });
  }
  test(`private ${type} has no social preview, even in an administrator session`, async () => {
    const anonymous = await metadataFor(type, "private");
    assert.equal(anonymous.openGraph, undefined);
    const admin = await metadataFor(type, "private", true);
    assert.equal(admin.openGraph.images.length, 0);
    assert.equal(admin.twitter.images.length, 0);
    assert.equal(admin.robots.index, false);
  });
}
