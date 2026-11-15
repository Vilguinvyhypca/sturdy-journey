import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile, readdir, rm, stat, symlink, truncate } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ts from "typescript";

const require = createRequire(import.meta.url);
const logPath = resolve("src/lib/operation-log.cjs");
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-operations-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const journal = [];
  const compiledModule = { exports: {} };
  new Function("require", "module", "console", await readFile(logPath, "utf8"))(
    createRequire(logPath), compiledModule, { error: (line) => journal.push(JSON.parse(line)) },
  );
  return { directory, journal, log: compiledModule.exports, file: join(directory, "operations", new Date().toISOString().slice(0, 10) + ".jsonl") };
}

test("operation records exclude secrets, identify saved changes, expire old files and preserve unrelated files", async (t) => {
  const { directory, journal, log, file } = await fixture(t);
  await log.recordOperation(directory, "media.create", { id: "local:fixture", visibility: "private" });
  const folder = join(directory, "operations");
  await writeFile(join(folder, "2000-01-01.jsonl"), "expired");
  await writeFile(join(folder, "keep.txt"), "keep");
  const error = Object.assign(new Error("password=secret-token /private/media.jpg https://private.test/file"), { code: "ENOSPC", stdout: "secret stdout" });
  error.stack = "Error: secret message\n at save (/app/src/lib/db.ts:15:9)\n at secret (https://private.test/secret:1:1)";
  await log.recordOperation(directory, "media.update", {
    id: "https://private.test/file?token=secret-token", beforeVisibility: "public", visibility: "private",
    fields: ["title", "visibility", "password=secret-token"], title: "private title", token: "secret-token",
  });
  await log.recordOperation(directory, "media.delete", { route: "/app/photos/[id]/page", method: "GET" }, error);
  const text = await readFile(file, "utf8");
  for (const secret of ["secret-token", "private.test", "private title", "secret stdout", "secret message", "/private/media.jpg"]) assert.equal(text.includes(secret), false, secret);
  const events = text.trim().split("\n").map(JSON.parse);
  assert.equal(events[1].outcome, "saved");
  assert.equal(events[1].beforeVisibility, "public");
  assert.equal(events[1].visibility, "private");
  assert.deepEqual(events[1].fields, ["title", "visibility"]);
  assert.match(events[1].targetHash, /^[a-f0-9]{64}$/);
  assert.equal(events[2].outcome, "failed");
  assert.equal(events[2].errorCode, "ENOSPC");
  assert.equal(events[2].route, "/photos/[id]");
  assert.equal(events[2].method, "GET");
  assert.deepEqual(events[2].locations, ["src/lib/db.ts:15:9"]);
  assert.equal(journal.length, 1);
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  assert.equal((await stat(folder)).mode & 0o777, 0o700);
  const files = await readdir(folder);
  assert.equal(files.includes("2000-01-01.jsonl"), false);
  assert.equal(files.includes("keep.txt"), true);
});

test("full or symlinked log files fall back safely without rejecting completed operations", async (t) => {
  const { directory, journal, log, file } = await fixture(t);
  await log.recordOperation(directory, "theme.update");
  await truncate(file, log.maximumDailyBytes);
  await log.recordOperation(directory, "profile.update", { id: "fixture" });
  assert.equal((await stat(file)).size, log.maximumDailyBytes);
  assert.equal(journal.at(-1).logStorageUnavailable, true);
  assert.equal(journal.at(-1).outcome, "saved");
  await rm(file);
  const target = join(directory, "untouched");
  await writeFile(target, "untouched");
  await symlink(target, file);
  await log.recordOperation(directory, "media.delete");
  assert.equal(await readFile(target, "utf8"), "untouched");
  assert.equal(journal.at(-1).logStorageUnavailable, true);
});

test("separate processes append complete records without losing concurrent changes", async (t) => {
  const { directory, file } = await fixture(t);
  const run = promisify(execFile);
  await Promise.all(Array.from({ length: 3 }, (_, worker) => run(process.execPath, ["-e",
    "const log=require(process.argv[1]);Promise.all(Array.from({length:8},(_,i)=>log.recordOperation(process.argv[2],'media.create',{id:process.argv[3]+i}))).catch(()=>process.exit(1));",
    logPath, directory, String(worker)], { timeout: 30000 })));
  const events = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);
  assert.equal(events.length, 24);
  assert.equal(new Set(events.map((event) => event.id)).size, 24);
  assert.equal(events.every((event) => event.outcome === "saved"), true);
});

test("real catalog operations log only committed changes and report failed deletions without losing records", async (t) => {
  const { directory, log, file } = await fixture(t);
  const modules = new Map([["./operation-log.cjs", log], ["./catalog-lock.cjs", require("../src/lib/catalog-lock.cjs")]]);
  for (const name of ["profile-types", "media-storage", "db"]) {
    const source = await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports = {};
    new Function("require", "exports", "process", code)((name) => modules.has(name) ? modules.get(name) : require(name), exports, { env: { MEDIA_DATA_DIR: directory } });
    modules.set(`./${name}`, exports);
  }
  const db = modules.get("./db");
  const item = { id: "local:fixture", title: "Secret title", url: "https://secret.test/file", type: "video", visibility: "public" };
  await db.addMedia(item);
  await db.updateLocalMediaDetails(item.id, "New private title", "secret description", "private");
  assert.equal(await db.removeMedia("missing"), false);
  await assert.rejects(db.removeMedia(item.id, async () => { throw Object.assign(new Error("private path"), { code: "EACCES" }); }));
  assert.equal((await db.readMedia()).length, 1);
  await db.removeMedia(item.id);
  const events = (await readFile(file, "utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.map(({ action, outcome }) => [action, outcome]), [
    ["media.create", "saved"], ["media.update", "saved"], ["media.delete", "failed"], ["media.delete", "saved"],
  ]);
  assert.equal(events[1].beforeVisibility, "public");
  assert.equal(events[1].visibility, "private");
  assert.equal(JSON.stringify(events).includes("secret"), false);
});

test("profile and theme saves produce private change records without their values", async (t) => {
  const { directory, log, file } = await fixture(t);
  const modules = new Map([
    ["./operation-log.cjs", log], ["./catalog-lock.cjs", require("../src/lib/catalog-lock.cjs")],
    ["@neondatabase/serverless", { neon: () => { throw new Error("No database calls in local mode"); } }],
    ["path", { default: require("node:path") }],
  ]);
  for (const name of ["profile-types", "theme", "media-storage", "profiles", "database"]) {
    const code = ts.transpileModule(await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    new Function("require", "exports", "process", code)((name) => modules.has(name) ? modules.get(name) : require(name), exports, { env: { MEDIA_DATA_DIR: directory } });
    modules.set(`./${name}`, exports);
  }
  const profiles = modules.get("./profiles");
  const input = { name: "Private display name", slug: "private-slug", socialLinks: ["https://secret.test/profile"] };
  const profile = await profiles.saveProfile(input);
  await profiles.saveProfile({ ...input, bio: "Private biography" }, profile.id);
  await assert.rejects(profiles.saveProfile(input));
  await modules.get("./database").saveSiteTheme("indigo");
  const text = await readFile(file, "utf8");
  assert.deepEqual(text.trim().split("\n").map(JSON.parse).map(({ action }) => action), ["profile.create", "profile.update", "theme.update"]);
  for (const value of [input.name, input.slug, "secret.test", "Private biography"]) assert.equal(text.includes(value), false);
});

test("Next instrumentation passes only the error and route template/method to the safe sink, and skips Edge", async () => {
  const code = ts.transpileModule(await readFile(new URL("../src/instrumentation.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  for (const runtime of ["nodejs", "edge"]) {
    const calls = [];
    const exports = {};
    new Function("require", "exports", "process", code)(() => ({ recordFailure: async (...args) => calls.push(args) }), exports, { env: { NEXT_RUNTIME: runtime } });
    const error = new Error("private message");
    await exports.onRequestError(error, { method: "GET", path: "/photos/private-id?token=secret", headers: { cookie: "secret" } }, { routePath: "/photos/[id]" });
    assert.deepEqual(calls, runtime === "nodejs" ? [["request.error", error, { route: "/photos/[id]", method: "GET" }]] : []);
  }
});
