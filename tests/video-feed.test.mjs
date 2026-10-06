import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const jsx = (type, props, key) => ({ type, props, key });
async function load(path, dependencies, globals = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, { exports, URLSearchParams, AbortController, ...globals, require: (name) => {
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports;
}

test("feed route resolves profile slugs to IDs and rejects unknown or ambiguous profiles", async () => {
  const VideoFeed = () => {};
  const route = await load("../src/app/feed/page.tsx", {
    "@/components/VideoFeed": { VideoFeed },
    "next/navigation": { notFound: () => { throw new Error("404"); } },
    "@/lib/profiles": { getProfileBySlug: async (slug) => slug === "new-profile" ? { id: "profile-uuid", slug } : null },
    "@/lib/database": { usesDatabase: false },
    "@/lib/local-storage": { usesLocalStorage: true },
  });
  const page = await route.default({ searchParams: Promise.resolve({ profile: "new-profile" }) });
  assert.equal(page.type, VideoFeed);
  assert.equal(page.props.profileId, "profile-uuid");
  assert.equal(page.props.galleryHref, "/p/new-profile");
  assert.equal(page.key, "profile-uuid");
  assert.equal((await route.default({ searchParams: Promise.resolve({}) })).props.profileId, undefined);
  for (const profile of ["missing", ["new-profile", "other"]]) {
    await assert.rejects(route.default({ searchParams: Promise.resolve({ profile }) }), /404/);
  }
});

function find(node, predicate) {
  if (!node || typeof node !== "object") return;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, predicate); if (result) return result; }
}

test("feed requests only public profile videos on initial and subsequent pages", async () => {
  let index = 0;
  const state = [];
  let effects = [];
  const requests = [];
  const media = await load("../src/lib/media.ts", {});
  const component = await load("../src/components/VideoFeed.tsx", {
    react: {
      useState: (initial) => { const key = index++; if (!(key in state)) state[key] = initial; return [state[key], value => { state[key] = typeof value === "function" ? value(state[key]) : value; }]; },
      useRef: (current) => ({ current }), useCallback: (callback) => callback,
      useEffect: (effect) => { effects.push(effect); },
    },
    "next/link": { default: "a" }, "@mux/mux-player-react": { default: "mux-player" },
    "@/lib/media": media, "./ExperienceTracker": { trackExperience: () => {} },
  }, {
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ media: [{ id: `video-${requests.length}`, title: "Video", type: "video", url: "/video.mp4" }], nextCursor: requests.length === 1 ? "cursor-2" : null }) };
    },
  });
  const render = () => { index = 0; effects = []; return component.VideoFeed({ profileId: "profile-uuid", galleryHref: "/p/new-profile" }); };
  render(); const cleanup = effects[0]();
  await new Promise(resolve => setImmediate(resolve));
  const tree = render();
  const more = find(tree, node => node.type === "button" && node.props.children === "Load more videos");
  assert.ok(more);
  await more.props.onClick();
  for (const request of requests) {
    const query = new URL(request.url, "https://test").searchParams;
    assert.equal(query.get("profile"), "profile-uuid");
    assert.equal(query.get("type"), "video");
    assert.equal(query.get("visibility"), "public");
  }
  assert.equal(new URL(requests[1].url, "https://test").searchParams.get("cursor"), "cursor-2");
  const finalTree = render();
  assert.equal(find(finalTree, node => node.type === "button" && node.props.children === "Load more videos"), undefined);
  assert.ok(find(finalTree, node => node.props?.galleryHref === "/p/new-profile"));
  cleanup(); assert.equal(requests[0].options.signal.aborted, true);
});
