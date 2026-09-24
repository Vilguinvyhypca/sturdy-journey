import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { inferMediaStorage, type MediaStorageRecord } from "./media-storage";
import type { MediaItem } from "./media";

const dataDirectory = process.env.MEDIA_DATA_DIR && join(process.env.MEDIA_DATA_DIR) || join(process.cwd(), "data");
const dataFile = join(dataDirectory, "media.json");

type LocalMediaRecord = MediaItem & { storage?: MediaStorageRecord };

async function readRecords(): Promise<LocalMediaRecord[]> {
  try {
    const media = JSON.parse(await readFile(dataFile, "utf8")) as LocalMediaRecord[];
    return media.map((item) => ({ ...item, visibility: item.visibility ?? "public", storage: item.storage ?? inferMediaStorage(item) }));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// One writer per development server; atomic rename prevents readers seeing partial JSON.
let pendingWrite: Promise<unknown> = Promise.resolve();
function mutateRecords<T>(edit: (records: LocalMediaRecord[]) => T): Promise<T> {
  const operation = pendingWrite.then(async () => {
    const records = await readRecords();
    const result = edit(records);
    await mkdir(dataDirectory, { recursive: true });
    const temporary = `${dataFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(records, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, dataFile);
    } finally {
      await rm(temporary, { force: true });
    }
    return result;
  });
  pendingWrite = operation.catch(() => undefined);
  return operation;
}

export async function addMedia(item: MediaItem, storage: MediaStorageRecord = inferMediaStorage(item)) {
  return mutateRecords((media) => {
    media.unshift({ ...item, storage });
    return item;
  });
}

export async function updateLocalMediaDetails(id: string, title: string, description: string, visibility?: MediaItem["visibility"], profileId?: string) {
  return mutateRecords((media) => {
    const index = media.findIndex((item) => item.id === id);
    if (index === -1) return null;
    media[index] = { ...media[index], title, description, visibility: visibility ?? media[index].visibility ?? "public", ...(profileId ? { profileId } : {}) };
    return publicMedia(media[index]);
  });
}

export async function removeMedia(id: string) {
  await mutateRecords((media) => {
    const index = media.findIndex((item) => item.id === id);
    if (index !== -1) media.splice(index, 1);
  });
}

// Keep internal locators out of public API responses and client component props.
function publicMedia(record: LocalMediaRecord): MediaItem {
  const { storage, ...item } = record;
  if (storage?.playbackObjectKey && item.type === "video" && item.id.startsWith("local:")) {
    return { ...item, url: `/api/local-playback?id=${encodeURIComponent(item.id)}` };
  }
  return item;
}

export async function readMedia(): Promise<MediaItem[]> {
  return (await readRecords()).map(publicMedia);
}

export async function getLocalMediaStorage(id: string): Promise<MediaStorageRecord | null> {
  const item = (await readRecords()).find((record) => record.id === id);
  return item?.storage ?? null;
}
