import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function loadPage({ item, profile, database = false, localStorage = true }) {
  const source = await readFile(new URL("../src/app/videos/[id]/page.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const jsx = (type, props) => ({ type, props });
  let profileLookups = 0;
  const mocks = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "next/link": { default: "Link" },
    "next/navigation": { notFound: () => { throw new Error("notFound"); } },
    react: { cache: (fn) => fn },
    "next-auth": { getServerSession: async () => null },
    "@/lib/db": { readMedia: async () => [item] },
    "@/lib/database": {
      getMediaById: async () => item,
      getMuxVideo: async () => null,
      usesDatabase: database,
    },
    "@/lib/media": { isSignedMuxUrl: () => false, muxPlaybackIdFromUrl: () => null },
    "@/lib/site-url": { getSiteUrl: () => new URL("https://site.test") },
    "@/lib/auth": { authOptions: {}, isAdmin: () => false },
    "@/lib/mux": { createMuxPlaybackTokens: () => undefined },
    "@/lib/profiles": { getProfile: async (id) => { profileLookups++; return profile?.id === id ? profile : null; } },
    "@/lib/profile-types": { mediaProfileId: (media) => media.profileId ?? "hymecymeyseh" },
    "@/lib/local-storage": { usesLocalStorage: localStorage },
    "@/components/ShareMediaButton": { ShareMediaButton: "ShareMediaButton" },
    "@/components/MediaDetails": { MediaDetails: "MediaDetails" },
    "@/components/VideoPlayback": { VideoPlayback: "VideoPlayback" },
  };
  const exports = {};
  vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, URL, encodeURIComponent, JSON });
  return { page: exports.default, profileLookupCount: () => profileLookups };
}

function findProfileLink(tree) {
  if (!tree || typeof tree !== "object") return null;
  if (Array.isArray(tree)) return tree.map(findProfileLink).find(Boolean) ?? null;
  if (tree.type === "Link" && String(tree.props?.children ?? "").startsWith("Watch more from ")) return tree;
  return findProfileLink(tree.props?.children);
}

const video = { id: "video-1", type: "video", title: "A video", url: "https://cdn.test/video.mp4", visibility: "public", profileId: "profile-a" };
const profileA = { id: "profile-a", slug: "profile-a", name: "Profile A" };
const props = { params: Promise.resolve({ id: "video-1" }) };

test("video page links to the matching profile with a readable label", async () => {
  const { page } = await loadPage({ item: video, profile: profileA });
  const link = findProfileLink(await page(props));
  assert.equal(link?.props.href, "/p/profile-a");
  assert.equal(link?.props.children.join(""), "Watch more from Profile A");
});

test("legacy videos use the default profile and unknown profiles have no broken link", async () => {
  const legacy = { ...video, profileId: undefined };
  const defaultProfile = { id: "hymecymeyseh", slug: "hymecymeyseh", name: "Hymecymeyseh" };
  const legacyPage = await loadPage({ item: legacy, profile: defaultProfile });
  assert.equal(findProfileLink(await legacyPage.page(props))?.props.href, "/p/hymecymeyseh");

  const unknownPage = await loadPage({ item: video, profile: null });
  assert.equal(findProfileLink(await unknownPage.page(props)), null);
});

test("database or non-local configurations do not look up or link local profiles", async () => {
  for (const config of [{ database: true }, { localStorage: false }]) {
    const { page, profileLookupCount } = await loadPage({ item: video, profile: profileA, ...config });
    assert.equal(findProfileLink(await page(props)), null);
    assert.equal(profileLookupCount(), 0);
  }
});
