import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";
import catalogLock from "../src/lib/catalog-lock.cjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "mediaspace-writers-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const data = join(root, "catalog");
  const storage = join(root, "storage");
  const source = join(root, "source");
  await Promise.all([data, storage, source, join(root, "app")].map((path) => mkdir(path)));
  for (const name of ["media-storage", "profile-types", "db", "profiles"]) {
    const code = ts.transpileModule(await readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    await writeFile(join(root, `${name}.js`), code);
  }
  await copyFile(new URL("../src/lib/catalog-lock.cjs", import.meta.url), join(root, "catalog-lock.cjs"));
  return { root, data, storage, source };
}

function worker(t, root, data, operation, environment = {}) {
  const child = spawn(process.execPath, ["-e", `process.stdout.write('ready\\n');(async()=>{${operation}})().catch(e=>{console.error(e);process.exitCode=1})`], {
    cwd: root, env: { ...process.env, MEDIA_DATA_DIR: data, ...environment }, stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
  let stdout = "";
  let stderr = "";
  const ready = new Promise((resolve) => child.stdout.once("data", resolve));
  child.stdout.on("data", (bytes) => { stdout += bytes; });
  child.stderr.on("data", (bytes) => { stderr += bytes; });
  const done = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, ready, done };
}

test("app writers and a direct folder import preserve each other's records across processes", { timeout: 30000 }, async (t) => {
  const { root, data, storage, source } = await fixture(t);
  await writeFile(join(source, "new.jpg"), "imported photo fixture");
  const importer = pathToFileURL(resolve("scripts/import-local-media.mjs")).href;
  const workers = [];
  await catalogLock.withCatalogLock(data, async () => {
    workers.push(worker(t, root, data, `const db=require('./db.js');await db.updateLocalMediaDetails('edit','Updated','Description','private');await db.removeMedia('delete');await db.addMedia({id:'app',url:'/uploads/app.jpg',type:'photo',title:'App',contentHash:'app-hash'});`));
    workers.push(worker(t, root, data, `process.chdir(${JSON.stringify(join(root, "app"))});process.argv=['node','import','--source',${JSON.stringify(source)},'--profile','creator','--apply'];await import(${JSON.stringify(importer)});`, {
      MEDIA_UPLOAD_PROVIDER: "local", MEDIA_STORAGE_ROOT: storage, DATABASE_URL: "", DATABASE_URL_DATABASE_URL: "",
    }));
    await Promise.all(workers.map((entry) => entry.ready));
    // Both writers have started while this process owns the lock. Their reads
    // must happen after release, including the importer's initial snapshot.
    await writeFile(join(data, "media.json"), JSON.stringify([
      { id: "edit", title: "Old", type: "photo", url: "/uploads/edit.jpg" },
      { id: "delete", title: "Delete", type: "photo", url: "/uploads/delete.jpg" },
      { id: "retained", title: "Keep", type: "photo", url: "/uploads/retained.jpg" },
    ]));
  });
  for (const result of await Promise.all(workers.map((entry) => entry.done))) assert.equal(result.code, 0, result.stderr);
  const records = JSON.parse(await readFile(join(data, "media.json"), "utf8"));
  assert.equal(records.length, 4);
  assert.equal(records.find((item) => item.id === "edit").title, "Updated");
  assert.equal(records.find((item) => item.id === "edit").visibility, "private");
  assert.ok(records.some((item) => item.id === "retained"));
  assert.ok(records.some((item) => item.id === "app"));
  assert.ok(!records.some((item) => item.id === "delete"));
  assert.equal(records.filter((item) => item.title === "new").length, 1);
});

test("separate app processes reject duplicate content and preserve profile updates", { timeout: 30000 }, async (t) => {
  const { root, data } = await fixture(t);
  const jobs = Array.from({ length: 4 }, (_, index) => worker(t, root, data, `
    const db=require('./db.js');try{await db.addMedia({id:'item-${index}',url:'/uploads/test.jpg',type:'photo',title:'Test',contentHash:'same'});console.log('saved')}
    catch(error){if(error instanceof db.DuplicateMediaError)console.log('duplicate');else throw error}
    await require('./profiles.js').saveProfile({name:'Profile ${index}',slug:'profile-${index}',socialLinks:[]});`));
  const results = await Promise.all(jobs.map((job) => job.done));
  for (const result of results) assert.equal(result.code, 0, result.stderr);
  assert.equal(results.filter((result) => result.stdout.includes("saved")).length, 1);
  assert.equal(results.filter((result) => result.stdout.includes("duplicate")).length, 3);
  assert.equal(JSON.parse(await readFile(join(data, "media.json"), "utf8")).length, 1);
  assert.equal(JSON.parse(await readFile(join(data, "profiles.json"), "utf8")).length, 5);
});

test("lock contention fails before mutation and exceptions release the lock", async (t) => {
  const { data } = await fixture(t);
  await catalogLock.withCatalogLock(data, async () => {
    await assert.rejects(catalogLock.withCatalogLock(data, async () => assert.fail("Must not write"), 0.05), { code: "CATALOG_BUSY" });
  });
  await assert.rejects(catalogLock.withCatalogLock(data, async () => { throw new Error("Rejected mutation"); }), /Rejected mutation/);
  assert.equal(await catalogLock.withCatalogLock(data, async () => "released"), "released");
});

test("a killed writer releases its OS lock without deleting a stale lock file", { timeout: 10000 }, async (t) => {
  const { root, data } = await fixture(t);
  const job = worker(t, root, data, `await require('./catalog-lock.cjs').withCatalogLock(process.env.MEDIA_DATA_DIR,async()=>{console.log('held');await new Promise(()=>{})});`);
  await new Promise((resolve) => job.child.stdout.on("data", (bytes) => { if (bytes.toString().includes("held")) resolve(); }));
  job.child.kill("SIGKILL");
  await job.done;
  assert.equal(await catalogLock.withCatalogLock(data, async () => "recovered", 2), "recovered");
});
