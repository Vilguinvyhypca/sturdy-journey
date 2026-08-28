import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MediaItem } from "./media";

const dataDirectory = join(process.cwd(), "data");
const dataFile = join(dataDirectory, "media.json");

export async function readMedia(): Promise<MediaItem[]> {
  try {
    const media = JSON.parse(await readFile(dataFile, "utf8")) as Array<Omit<MediaItem, "visibility"> & { visibility?: MediaItem["visibility"] }>;
    return media.map((item) => ({ ...item, visibility: item.visibility ?? "public" }));
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

export async function updateLocalMediaDetails(id: string, title: string, description: string, visibility: MediaItem["visibility"] = "public") {
  const media = await readMedia();
  const index = media.findIndex((item) => item.id === id);
  if (index === -1) return null;
  media[index] = { ...media[index], title, description, visibility };
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify(media, null, 2), "utf8");
  return media[index];
}

export async function removeMedia(id: string) {
  const media = await readMedia();
  await mkdir(dataDirectory, { recursive: true });
  await writeFile(dataFile, JSON.stringify(media.filter((item) => item.id !== id), null, 2), "utf8");
}
