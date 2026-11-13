import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

async function loadLogger(directory) {
  const source = await readFile(new URL("../src/lib/operational-logging.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledFile = join(directory, "operational-logging.cjs");
  await writeFile(compiledFile, compiled);
  const exports = {};
  new Function("require", "exports", "process", compiled)(createRequire(compiledFile), exports, process);
  return exports;
}

test("operational logs retain safe audit and failure records for 90 days", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-operations-"));
  const previousDataDirectory = process.env.MEDIA_DATA_DIR;
  process.env.MEDIA_DATA_DIR = directory;
  t.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.MEDIA_DATA_DIR;
    else process.env.MEDIA_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  const logger = await loadLogger(directory);
  const oldDate = new Date();
  oldDate.setUTCDate(oldDate.getUTCDate() - 100);
  const operationsDirectory = join(directory, "operations");
  await mkdir(operationsDirectory, { recursive: true });
  const oldFile = `${oldDate.toISOString().slice(0, 10)}.jsonl`;
  await writeFile(join(operationsDirectory, oldFile), "old record\n");

  await logger.recordAdminChange("media.updated", "media", "local:private-media-id", {
    changedFields: ["title", "visibility", "private field"],
    previousVisibility: "private",
    visibility: "public",
  });
  await logger.recordAdminChange("theme.updated", "site_theme", "site_theme", {
    changedFields: ["theme"],
    theme: "sunset",
  });
  await logger.recordAdminChange("media.unapproved_action", "media", "private-data");
  await logger.recordApplicationFailure({
    route: "/api/local-upload",
    operation: "save_upload",
    error: Object.assign(new Error("secret filename and bearer token must not be logged"), { code: "ERR_DISK_FULL" }),
  });
  await logger.recordApplicationFailure({
    route: "/api/local-upload?token=secret",
    operation: "request contained bearer secret",
    error: new Error("ignored invalid context"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const text = await readFile(join(operationsDirectory, `${today}.jsonl`), "utf8");
  const [audit, theme, failure, invalidContext] = text.trim().split("\n").map((line) => JSON.parse(line));
  assert.equal(audit.kind, "administrator_change");
  assert.equal(audit.actor, "administrator");
  assert.equal(audit.resourceRef.length, 24);
  assert.deepEqual(audit.changedFields, ["title", "visibility"]);
  assert.equal(audit.previousVisibility, "private");
  assert.equal(audit.visibility, "public");
  assert.equal(JSON.stringify(audit).includes("local:private-media-id"), false);
  assert.equal(theme.theme, "sunset");
  assert.equal(failure.kind, "application_failure");
  assert.equal(failure.route, "/api/local-upload");
  assert.equal(failure.operation, "save_upload");
  assert.equal(failure.errorName, "Error");
  assert.equal(failure.errorCode, "ERR_DISK_FULL");
  assert.equal(text.includes("secret filename"), false);
  assert.equal(text.includes("bearer token"), false);
  assert.equal(invalidContext.route, "unknown");
  assert.equal(invalidContext.operation, "unknown");
  assert.equal(text.includes("token=secret"), false);
  assert.equal((await readdir(operationsDirectory)).includes(oldFile), false);
});

test("runtime failure monitor records safe error identity synchronously", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-runtime-log-"));
  const previousDataDirectory = process.env.MEDIA_DATA_DIR;
  process.env.MEDIA_DATA_DIR = directory;
  const originalWrite = process.stderr.write;
  let stderr = "";
  process.stderr.write = (value) => { stderr += value; return true; };
  t.after(async () => {
    process.stderr.write = originalWrite;
    if (previousDataDirectory === undefined) delete process.env.MEDIA_DATA_DIR;
    else process.env.MEDIA_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  const logger = await loadLogger(directory);
  logger.recordRuntimeFailure(Object.assign(new TypeError("private message"), { code: "ERR_INVALID_STATE" }), "uncaught_exception");
  const today = new Date().toISOString().slice(0, 10);
  const text = await readFile(join(directory, "operations", `${today}.jsonl`), "utf8");
  const event = JSON.parse(text.trim());
  assert.equal(event.route, "runtime");
  assert.equal(event.operation, "uncaught_exception");
  assert.equal(event.errorName, "TypeError");
  assert.equal(event.errorCode, "ERR_INVALID_STATE");
  assert.equal(text.includes("private message"), false);
  assert(stderr.includes('"kind":"application_failure"'));
});
