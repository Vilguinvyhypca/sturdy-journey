import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaItem } from "./media";

const dataDirectory = join(process.cwd(), "data");
const dataFile = join(dataDirectory, "media.json");

export async function readMedia(): Promise<MediaItem[]> {
  try {
    return JSON.parse(await readFile(dataFile, "utf8")) as MediaItem[];
  } catch {
    return [];
  }
}

export async function addMedia(item: MediaItem) {
  const media = await readMedia();
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify([item, ...media], null, 2), "utf8");
  return item;
}
