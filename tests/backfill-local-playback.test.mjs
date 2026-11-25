import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { runBackfillBatch } from "../scripts/backfill-local-playback.mjs";

async function fixture(t, count = 3) {
  const base = await mkdtemp(join(tmpdir(), "playback-backfill-"));
  t.after(() => rm(base, { recursive: true, force: true }));
  const dataDirectory = join(base, "data");
  const storageRoot = join(base, "media");
  await mkdir(dataDirectory);
  await mkdir(storageRoot);
  const records = Array.from({ length: count }, (_, index) => ({
    id: `video-${index}`,
    type: "video",
    title: `Video ${index}`,
    storage: { provider: "local", objectKey: `${index}-abc.mp4` },
  }));
  await writeFile(join(dataDirectory, "media.json"), JSON.stringify(records));
  for (const record of records) await writeFile(join(storageRoot, record.storage.objectKey), "original");
  return { dataDirectory, storageRoot, records };
}

const encoder = async (source) => writeFile(`${source}.web.mp4`, "playback");

test("backfill processes bounded batches and resumes from saved state", async (t) => {
  const f = await fixture(t, 3);
  const first = await runBackfillBatch({ ...f, batchSize: 2, generatePlaybackFn: encoder });
  assert.equal(first.counts.complete, 2);
  assert.equal(first.counts.pending, 1);
  const second = await runBackfillBatch({ ...f, batchSize: 2, resume: true, generatePlaybackFn: encoder });
  assert.equal(second.counts.complete, 3);
  assert.equal(second.counts.pending, 0);
  const catalog = JSON.parse(await readFile(join(f.dataDirectory, "media.json"), "utf8"));
  assert.ok(catalog.every((record) => record.storage.playbackObjectKey === `${record.storage.objectKey}.web.mp4`));
  assert.ok((await readFile(join(f.storageRoot, f.records[0].storage.objectKey), "utf8")) === "original");
});

test("failed conversions are retried by resume", async (t) => {
  const f = await fixture(t, 1);
  const first = await runBackfillBatch({ ...f, generatePlaybackFn: async () => { throw new Error("temporary encoder error"); } });
  assert.equal(first.counts.failed, 1);
  const result = await runBackfillBatch({ ...f, resume: true, generatePlaybackFn: encoder });
  assert.equal(result.counts.complete, 1);
  assert.equal(result.counts.failed, 0);
});

test("a changed catalog item is skipped without adding a catalog reference", async (t) => {
  const f = await fixture(t, 1);
  const result = await runBackfillBatch({ ...f, generatePlaybackFn: async (source) => {
    await writeFile(`${source}.web.mp4`, "playback");
    await writeFile(join(f.dataDirectory, "media.json"), "[]");
  } });
  assert.equal(result.counts.skipped, 1);
  assert.equal((await stat(join(f.storageRoot, "0-abc.mp4.web.mp4"))).isFile(), true);
});

test("existing copies are retained unless rebuild is requested", async (t) => {
  const f = await fixture(t, 1);
  await writeFile(join(f.storageRoot, "0-abc.mp4.web.mp4"), "old playback");
  let calls = 0;
  await runBackfillBatch({ ...f, generatePlaybackFn: async () => { calls++; } });
  assert.equal(calls, 0);

  const rebuilt = await runBackfillBatch({ ...f, rebuild: true, generatePlaybackFn: async (source) => { calls++; await writeFile(`${source}.web.mp4`, "new playback"); } });
  assert.equal(calls, 1);
  assert.equal(rebuilt.rebuilt, 1);
  assert.equal(await readFile(join(f.storageRoot, "0-abc.mp4.web.mp4"), "utf8"), "new playback");
});

test("catalog fields changed during conversion are preserved", async (t) => {
  const f = await fixture(t, 1);
  await runBackfillBatch({ ...f, generatePlaybackFn: async (source) => {
    await writeFile(`${source}.web.mp4`, "playback");
    const catalogPath = join(f.dataDirectory, "media.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog[0].title = "Updated while encoding";
    await writeFile(catalogPath, JSON.stringify(catalog));
  } });
  const catalog = JSON.parse(await readFile(join(f.dataDirectory, "media.json"), "utf8"));
  assert.equal(catalog[0].title, "Updated while encoding");
  assert.equal(catalog[0].storage.playbackObjectKey, "0-abc.mp4.web.mp4");
});
