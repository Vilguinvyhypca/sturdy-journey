import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ts from "typescript";

test("local catalog pages stay small and stable when a new item arrives", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-pages-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of ["media", "media-page"]) {
    const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    await writeFile(join(directory, `${name}.js`), output);
  }
  const { paginateMedia } = createRequire(import.meta.url)(join(directory, "media-page.js"));
  const items = Array.from({ length: 31 }, (_, index) => ({ id: `media-${index}`, type: index % 2 ? "photo" : "video", fileSizeBytes: 10 }));
  const first = paginateMedia(items);
  assert.equal(first.media.length, 12);
  assert.equal(first.totalCount, 31);
  assert.equal(first.knownStorageBytes, 310);
  assert(first.nextCursor);
  const second = paginateMedia([{ id: "new-media", type: "video" }, ...items], 12, first.nextCursor);
  assert.equal(second.media.length, 12);
  assert.equal(second.media[0].id, "media-12");
  const third = paginateMedia(items, 12, second.nextCursor);
  assert.equal(third.media.length, 7);
  assert.equal(third.nextCursor, null);
  assert.throws(() => paginateMedia(items, 12, "invalid"), /cursor/i);
});
