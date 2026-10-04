import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

test("visitor experience events are allowlisted, session-scoped, aggregated, and expire after 90 days", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "mediaspace-experience-"));
  const previousDataDirectory = process.env.MEDIA_DATA_DIR;
  process.env.MEDIA_DATA_DIR = directory;
  t.after(async () => {
    if (previousDataDirectory === undefined) delete process.env.MEDIA_DATA_DIR;
    else process.env.MEDIA_DATA_DIR = previousDataDirectory;
    await rm(directory, { recursive: true, force: true });
  });

  const source = await readFile(new URL("../src/lib/experience.ts", import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const compiledFile = join(directory, "experience.cjs");
  await writeFile(compiledFile, compiled);
  const exports = {};
  new Function("require", "exports", "process", compiled)(createRequire(compiledFile), exports, process);

  const firstSession = "b2222222-2222-4222-8222-222222222222";
  const secondSession = "c3333333-3333-4333-8333-333333333333";
  assert.equal(exports.validateExperienceEvent({ sessionId: firstSession, name: "page_view", path: "/p/sample?email=private" }), null);
  assert.equal(exports.validateExperienceEvent({ sessionId: firstSession, name: "search", path: "/", query: "private phrase" }).query, undefined);

  const oldDate = new Date();
  oldDate.setUTCDate(oldDate.getUTCDate() - 100);
  const oldLog = join(directory, "experience", `${oldDate.toISOString().slice(0, 10)}.jsonl`);
  await mkdir(join(directory, "experience"), { recursive: true });
  await writeFile(oldLog, "old event\n");

  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: firstSession, name: "page_view", path: "/p/sample", source: "instagram / social", campaign: "fall" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: firstSession, name: "page_load", path: "/p/sample", loadMs: 1200 }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: firstSession, name: "search", path: "/p/sample", queryLength: 4, resultCount: 12, query: "private phrase" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: firstSession, name: "page_exit", path: "/p/sample", durationMs: 8000 }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: secondSession, name: "page_view", path: "/videos/abc" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: secondSession, name: "media_open", path: "/", mediaType: "video", mediaId: "abc" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: secondSession, name: "video_start", path: "/videos/abc", mediaType: "video", mediaId: "abc" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: secondSession, name: "video_error", path: "/videos/abc", mediaType: "video", errorType: "playback_error" }));
  await exports.recordExperienceEvent(exports.validateExperienceEvent({ sessionId: secondSession, name: "outbound_click", path: "/p/sample", destinationHost: "instagram.com", url: "https://instagram.com/private" }));

  const summary = await exports.readExperienceSummary(30);
  assert.equal(summary.pageViews, 2);
  assert.equal(summary.sessions, 2);
  assert.equal(summary.errors, 1);
  assert.equal(summary.averageLoadMs, 1200);
  assert.equal(summary.averageDurationMs, 8000);
  assert.equal(summary.popularPages[0].label, "/p/sample");
  assert.equal(summary.sources[0].label, "instagram / social · fall");
  assert.equal(summary.externalLinks[0].label, "instagram.com");
  assert.equal(summary.behavior.find((event) => event.label === "Profile visit without opening media").count, 1);
  assert.equal(summary.behavior.find((event) => event.label === "Started playback but did not finish").count, 1);
  assert(summary.commonJourneys.some((journey) => journey.label === "/videos/abc → open video → play video → visit instagram.com"));
  assert.equal(summary.actions.find((action) => action.label === "search").count, 1);

  const logFiles = await readdir(join(directory, "experience"));
  assert.equal(logFiles.includes(basename(oldLog)), false);
  const today = new Date().toISOString().slice(0, 10);
  const contents = await readFile(join(directory, "experience", `${today}.jsonl`), "utf8");
  assert.equal(contents.includes("private phrase"), false);
});
