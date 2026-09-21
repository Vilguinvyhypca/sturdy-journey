#!/usr/bin/env node
import { readFile, stat } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { generateThumbnail } from "./local-thumbnail.mjs";

const root = process.env.MEDIA_STORAGE_ROOT;
if (!root || !isAbsolute(root)) throw new Error("MEDIA_STORAGE_ROOT must be an absolute path.");
const records = JSON.parse(await readFile("data/media.json", "utf8"));
const videos = records.filter((item) => item.type === "video" && item.storage?.provider === "local" && /^[0-9a-f-]+\.(mp4|webm|mov)$/.test(item.storage.objectKey));
let created = 0;
let skipped = 0;
let failed = 0;
for (const [index, item] of videos.entries()) {
  const source = join(root, item.storage.objectKey);
  const thumbnail = `${source}.jpg`;
  try {
    const existing = await stat(thumbnail).catch(() => null);
    if (existing?.isFile() && existing.size > 0) skipped++;
    else { await generateThumbnail(source); created++; }
  } catch (error) {
    failed++;
    console.error(`${index + 1}/${videos.length} ${item.id}: ${error.message}`);
  }
  if ((index + 1) % 10 === 0 || index + 1 === videos.length) console.log(`${index + 1}/${videos.length} videos checked; ${created} created, ${skipped} existing, ${failed} failed`);
}
if (failed) process.exitCode = 1;
