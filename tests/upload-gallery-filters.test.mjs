import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function compile(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}

test("successful uploads respect active search, visibility and type filters without polluting results or counts", async () => {
  const media = {};
  vm.runInNewContext(await compile("../src/lib/media.ts"), { exports: media, require: () => ({}) });
  const code = await compile("../src/components/MediaFeed.tsx");
  const cases = [
    { search: "needle", include: false },
    { search: "  NEEDLE  ", uploaded: { title: "Needle photo" }, include: true },
    { search: "needle", uploaded: { description: "A needle in a haystack" }, include: true },
    { search: "needle", uploaded: { originalFileName: "needle-original.png" }, include: true },
    { search: "x".repeat(250), uploaded: { description: "x".repeat(200) }, include: true },
    { visibility: "public", include: false },
    { visibility: "unlisted", include: false },
    { visibility: "private", include: true },
    { mediaType: "video", include: false },
    { include: true },
  ];
  for (const scenario of cases) {
    let index = 0;
    let requests = 0;
    const state = [];
    const original = { id: "existing", title: "Existing needle", type: "photo", url: "/old.jpg", visibility: "private", fileSizeBytes: 10 };
    const uploaded = { id: "new", title: "Other photo", originalFileName: "other.png", type: "photo", url: "/new.png", visibility: "private", fileSizeBytes: 64, ...scenario.uploaded };
    const UploadButton = () => null;
    const jsx = (type, props) => ({ type, props });
    const mocks = {
      "react": { useEffect() {}, useRef: (initial) => ({ current: initial }), useState: (initial) => {
        const slot = index++;
        state[slot] = slot === 0 ? { local: true, maximumBytes: 5000000 }
          : slot === 6 ? scenario.search ?? "" : slot === 7 ? scenario.visibility ?? ""
            : typeof initial === "function" ? initial() : initial;
        return [state[slot], (value) => { state[slot] = typeof value === "function" ? value(state[slot]) : value; }];
      } },
      "react/jsx-runtime": { jsx, jsxs: jsx },
      "next-auth/react": { useSession: () => ({ data: { user: { isAdmin: true } } }) },
      "@/lib/media": media,
      "./UploadButton": { UploadButton },
      "@/lib/upload-details": { readUploadDetails: async () => ({ capturedAt: null, durationSeconds: null, fileSizeBytes: 64 }) },
    };
    const exports = {};
    vm.runInNewContext(code, { exports, require: (name) => mocks[name] ?? {}, AbortController, DOMException,
      fetch: async (url, options) => { assert.equal(url, "/api/local-upload"); assert.equal(options.method, "POST"); requests++; return Response.json({ media: uploaded }); },
    });
    const tree = exports.MediaFeed({ management: true, profile: { id: "profile", slug: "profile", name: "Profile" }, mediaType: scenario.mediaType,
      initialPage: { media: [original], nextCursor: "cursor", totalCount: 1, photoCount: 1, videoCount: 0, knownSizeCount: 1, knownStorageBytes: 10 },
    });
    function find(node) {
      if (!node || typeof node !== "object") return null;
      if (Array.isArray(node)) return node.map(find).find(Boolean);
      return node.type === UploadButton ? node : find(node.props?.children);
    }
    const control = find(tree);
    assert.ok(control, "Uses the actual upload event handler supplied to the UI");
    await control.props.onSelect([{ name: "other.png", type: "image/png", size: 64 }]);
    const label = JSON.stringify(scenario);
    assert.equal(requests, 1, label + ": upload still succeeds even when hidden by filters");
    assert.deepEqual(Array.from(state[2], (item) => item.id), scenario.include ? ["new", "existing"] : ["existing"], label);
    assert.equal(state[4].totalCount, scenario.include ? 2 : 1, label);
    assert.equal(state[4].photoCount, scenario.include ? 2 : 1, label);
    assert.equal(state[4].knownStorageBytes, scenario.include ? 74 : 10, label);
    assert.equal(state[3], "cursor", "Existing pagination cursor is retained");
  }
});
