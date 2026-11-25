#!/usr/bin/env node
import catalogLock from "../src/lib/catalog-lock.cjs";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { open, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { generatePlayback } from "./local-thumbnail.mjs";

const OBJECT_KEY = /^[0-9a-f-]+\.(mp4|webm|mov)$/;
const STATE_FILE = "backfill-local-playback-state.json";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonAtomically(path, value) {
  const temporary = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

async function localVideos(dataDirectory) {
  return catalogLock.withCatalogLock(dataDirectory, async () => {
    const records = await readJson(join(dataDirectory, "media.json"));
    return records.filter((item) => item.type === "video" && item.storage?.provider === "local" && OBJECT_KEY.test(item.storage.objectKey))
      .map(({ id, storage }) => ({ id, objectKey: storage.objectKey, status: "pending", error: null }));
  });
}

export async function runBackfillBatch({ dataDirectory, storageRoot, batchSize = 10, rebuild = false, resume = false, generatePlaybackFn = generatePlayback }) {
  return withJobLock(dataDirectory, () => runBackfillBatchLocked({ dataDirectory, storageRoot, batchSize, rebuild, resume, generatePlaybackFn }));
}

async function runBackfillBatchLocked({ dataDirectory, storageRoot, batchSize, rebuild, resume, generatePlaybackFn }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("batchSize must be an integer from 1 to 100.");
  if (!isAbsolute(storageRoot)) throw new Error("storageRoot must be an absolute path.");
  const dataFile = join(dataDirectory, "media.json");
  const statePath = join(dataDirectory, STATE_FILE);
  let state;
  try {
    state = await readJson(statePath);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (resume) {
    if (!state) throw new Error("No backfill state exists. Start without --resume first.");
    if (state.rebuild !== rebuild) throw new Error("Resume options must match the existing run; keep --rebuild consistent.");
  } else {
    if (state && state.items.some((item) => item.status === "pending" || item.status === "failed")) {
      throw new Error("An unfinished backfill exists. Use --resume to continue it.");
    }
    state = { version: 1, rebuild, createdAt: new Date().toISOString(), items: await localVideos(dataDirectory) };
    await writeJsonAtomically(statePath, state);
  }

  const selected = state.items.filter((item) => item.status === "pending" || item.status === "failed").slice(0, batchSize);
  let created = 0;
  let rebuilt = 0;
  let existing = 0;
  let failed = 0;
  let skipped = 0;

  for (const item of selected) {
    const source = join(storageRoot, item.objectKey);
    const key = `${item.objectKey}.web.mp4`;
    const destination = join(storageRoot, key);
    try {
      const sourceInfo = await stat(source);
      if (!sourceInfo.isFile()) throw new Error("Source is not a regular file.");
      const present = await stat(destination).catch((error) => error.code === "ENOENT" ? null : Promise.reject(error));
      if (present?.isFile() && present.size > 0 && !state.rebuild) {
        existing++;
      } else {
        await generatePlaybackFn(source);
        if (present?.isFile() && present.size > 0) rebuilt++;
        else created++;
      }

      const applied = await catalogLock.withCatalogLock(dataDirectory, async () => {
        const records = await readJson(dataFile);
        const current = records.find((record) => record.id === item.id);
        if (!current || current.storage?.provider !== "local" || current.storage.objectKey !== item.objectKey) return false;
        current.storage.playbackObjectKey = key;
        await writeJsonAtomically(dataFile, records);
        return true;
      });
      if (!applied) {
        skipped++;
        item.status = "skipped";
        item.error = "Catalog record was removed or changed during conversion.";
      } else {
        item.status = "complete";
        item.error = null;
      }
    } catch (error) {
      failed++;
      item.status = "failed";
      item.error = String(error?.message || error).slice(0, 300);
      console.error(`${item.id}: ${item.error}`);
    }
    item.updatedAt = new Date().toISOString();
    await writeJsonAtomically(statePath, state);
  }

  const counts = Object.fromEntries(["pending", "failed", "complete", "skipped"].map((status) => [status, state.items.filter((item) => item.status === status).length]));
  console.log(`Batch processed ${selected.length}/${batchSize}; ${created} created, ${rebuilt} rebuilt, ${existing} existing, ${skipped} skipped, ${failed} failed. Remaining: ${counts.pending + counts.failed}.`);
  return { counts, created, rebuilt, existing, skipped, failed };
}

async function withJobLock(dataDirectory, operation) {
  const file = await open(join(dataDirectory, ".playback-backfill.lock"), "a", 0o600);
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn("flock", ["--exclusive", "--timeout", "0", "3"], { stdio: ["ignore", "ignore", "ignore", file.fd] });
      child.once("error", reject);
      child.once("close", resolve);
    });
    if (code !== 0) throw new Error("Another playback backfill is already running.");
    return await operation();
  } finally {
    await file.close();
  }
}

function optionValue(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = Number(process.argv[index + 1]);
  if (!Number.isInteger(value)) throw new Error(`${name} requires an integer.`);
  return value;
}

async function main() {
  const dataDirectory = process.env.MEDIA_DATA_DIR || join(process.cwd(), "data");
  const statePath = join(dataDirectory, STATE_FILE);
  if (process.argv.includes("--status")) {
    const state = await readJson(statePath);
    const counts = Object.fromEntries(["pending", "failed", "complete", "skipped"].map((status) => [status, state.items.filter((item) => item.status === status).length]));
    console.log(JSON.stringify({ createdAt: state.createdAt, rebuild: state.rebuild, ...counts }, null, 2));
    return;
  }
  const storageRoot = process.env.MEDIA_STORAGE_ROOT;
  if (!storageRoot || !isAbsolute(storageRoot)) throw new Error("MEDIA_STORAGE_ROOT must be an absolute path.");
  const result = await runBackfillBatch({ dataDirectory, storageRoot, batchSize: optionValue("--batch-size", 10), rebuild: process.argv.includes("--rebuild"), resume: process.argv.includes("--resume") });
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
