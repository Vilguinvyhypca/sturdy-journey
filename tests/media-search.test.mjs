import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

test("media search includes the complete normalized original filename", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-search-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = await readFile(new URL("../src/lib/media.ts", import.meta.url), "utf8");
  await writeFile(join(directory, "media.cjs"), ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const { matchesMediaSearch, normalizeOriginalFileName } = createRequire(import.meta.url)(join(directory, "media.cjs"));
  const item = {
    title: "A title edited in the admin",
    originalFileName: normalizeOriginalFileName("C:\\Uploads\\[date_2026-07-16] clip.mp4"),
    description: "A description",
  };
  assert.equal(item.originalFileName, "[date_2026-07-16] clip.mp4");
  assert.equal(matchesMediaSearch(item, "2026"), true);
  assert.equal(matchesMediaSearch(item, "CLIP.MP4"), true);
  assert.equal(matchesMediaSearch(item, "absent"), false);
});
