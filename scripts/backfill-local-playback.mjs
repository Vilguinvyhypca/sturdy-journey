#!/usr/bin/env node
import catalogLock from "../src/lib/catalog-lock.cjs";
import { randomUUID } from "node:crypto";
import { readFile, stat, writeFile, rename } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { generatePlayback } from "./local-thumbnail.mjs";

const root = process.env.MEDIA_STORAGE_ROOT;
if (!root || !isAbsolute(root)) throw new Error("MEDIA_STORAGE_ROOT must be an absolute path.");
const dataDirectory = process.env.MEDIA_DATA_DIR || join(process.cwd(), "data");
const dataFile = join(dataDirectory, "media.json");
async function run() {
  const records = JSON.parse(await readFile(dataFile, "utf8"));
  const videos = records.filter((item) => item.type === "video" && item.storage?.provider === "local" && /^[0-9a-f-]+\.(mp4|webm|mov)$/.test(item.storage.objectKey));
  let created = 0;
  let existing = 0;
  let failed = 0;
  for (const [index, item] of videos.entries()) {
    const source = join(root, item.storage.objectKey);
    const key = `${item.storage.objectKey}.web.mp4`;
    const destination = join(root, key);
    try {
      const present = await stat(destination).catch(() => null);
      if (present?.isFile() && present.size > 0) existing++;
      else { await generatePlayback(source); created++; }
      item.storage.playbackObjectKey = key;
      const temporary = `${dataFile}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(records, null, 2), { mode: 0o600 });
      await rename(temporary, dataFile);
    } catch (error) {
      failed++;
      console.error(`${index + 1}/${videos.length} ${item.id}: ${error.message}`);
    }
    if ((index + 1) % 5 === 0 || index + 1 === videos.length) console.log(`${index + 1}/${videos.length} videos checked; ${created} created, ${existing} existing, ${failed} failed`);
  }
  if (failed) process.exitCode = 1;

}
await catalogLock.withCatalogLock(dataDirectory, run);
