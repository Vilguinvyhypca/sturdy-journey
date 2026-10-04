import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, writeFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

test("local media catalog cache refreshes after app writes and external atomic imports", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-catalog-"));
  const previousDataDirectory = process.env.MEDIA_DATA_DIR;
  process.env.MEDIA_DATA_DIR = directory;
  t.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.MEDIA_DATA_DIR;
    else process.env.MEDIA_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  const sources = new Map();
  for (const name of ["media-storage"]) {
    const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    const compiled = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const file = join(directory, `${name}.cjs`);
    await writeFile(file, compiled);
    sources.set(`./${name}`, createRequire(import.meta.url)(file));
  }
  const dbSource = await readFile(new URL("../src/lib/db.ts", import.meta.url), "utf8");
  const compiledDb = ts.transpileModule(dbSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledFile = join(directory, "catalog-api.cjs");
  await writeFile(compiledFile, compiledDb);
  const require = (name) => {
    if (sources.has(name)) return sources.get(name);
    return createRequire(compiledFile)(name);
  };
  const exports = {};
  new Function("require", "exports", "process", compiledDb)(require, exports, process);
  const catalog = join(directory, "media.json");
  const first = { id: "first", title: "First", url: "/uploads/first.mp4", type: "video" };
  await writeFile(catalog, JSON.stringify([first]));
  assert.equal((await exports.readMedia()).map((item) => item.id).join(), "first");

  const imported = { id: "imported", title: "Imported", url: "/uploads/imported.mp4", type: "video" };
  const temporary = join(directory, "media.json.import.tmp");
  await writeFile(temporary, JSON.stringify([imported]));
  await rename(temporary, catalog);
  assert.equal((await exports.readMedia()).map((item) => item.id).join(), "imported");

  await exports.addMedia({ id: "uploaded", title: "Uploaded", url: "/uploads/uploaded.mp4", type: "video" });
  assert.deepEqual((await exports.readMedia()).map((item) => item.id), ["uploaded", "imported"]);
});
