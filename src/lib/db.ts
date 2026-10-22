import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { inferMediaStorage, type MediaStorageRecord } from "./media-storage";
import type { MediaItem } from "./media";
import { mediaProfileId } from "./profile-types";
import { withCatalogLock } from "./catalog-lock.cjs";

const dataDirectory = process.env.MEDIA_DATA_DIR && join(process.env.MEDIA_DATA_DIR) || join(process.cwd(), "data");
const dataFile = join(dataDirectory, "media.json");

type LocalMediaRecord = MediaItem & { storage?: MediaStorageRecord };

let cachedRecords: LocalMediaRecord[] | undefined;
let cachedSignature: string | undefined;

async function mediaFileSignature() {
  try {
    const file = await stat(dataFile, { bigint: true });
    return `${file.dev}:${file.ino}:${file.size}:${file.mtimeNs}`;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readRecords(): Promise<LocalMediaRecord[]> {
  const signature = await mediaFileSignature();
  if (signature === null) {
    cachedRecords = undefined;
    cachedSignature = undefined;
    return [];
  }
  if (cachedRecords && signature === cachedSignature) return cachedRecords;
  try {
    const media = JSON.parse(await readFile(dataFile, "utf8")) as LocalMediaRecord[];
    const records = media.map((item) => ({ ...item, visibility: item.visibility ?? "public", storage: item.storage ?? inferMediaStorage(item) }));
    // Only cache a consistent snapshot. Imports and edits replace the catalog atomically.
    if (await mediaFileSignature() === signature) {
      cachedRecords = records;
      cachedSignature = signature;
    }
    return records;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

// Queue this process's requests; flock coordinates with other app/import processes.
// Atomic rename prevents readers seeing partial JSON.
let pendingWrite: Promise<unknown> = Promise.resolve();
function mutateRecords<T>(edit: (records: LocalMediaRecord[]) => T | Promise<T>): Promise<T> {
  const operation = pendingWrite.then(() => withCatalogLock(dataDirectory, async () => {
    const records = (await readRecords()).map((item) => ({ ...item, ...(item.storage ? { storage: { ...item.storage } } : {}) }));
    const result = await edit(records);
    await mkdir(dataDirectory, { recursive: true });
    const temporary = `${dataFile}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(records, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, dataFile);
      cachedRecords = undefined;
      cachedSignature = undefined;
    } finally {
      await rm(temporary, { force: true });
    }
    return result;
  }));
  pendingWrite = operation.catch(() => undefined);
  return operation;
}

export class DuplicateMediaError extends Error {
  constructor() {
    super("That exact photo or video has already been uploaded.");
    this.name = "DuplicateMediaError";
  }
}

export async function addMedia(item: MediaItem, storage: MediaStorageRecord = inferMediaStorage(item)) {
  return mutateRecords((media) => {
    // Check in the same serialized operation as insertion, including legacy
    // records whose missing profileId means the default profile.
    if (item.contentHash && media.some((existing) => existing.contentHash === item.contentHash && mediaProfileId(existing) === mediaProfileId(item))) {
      throw new DuplicateMediaError();
    }
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

export async function removeMedia(id: string, beforeRemove?: (item: MediaItem, storage: MediaStorageRecord | null) => Promise<void>) {
  return mutateRecords(async (media) => {
    const index = media.findIndex((item) => item.id === id);
    if (index === -1) return false;
    if (beforeRemove) await beforeRemove(publicMedia(media[index]), media[index].storage ?? null);
    media.splice(index, 1);
    return true;
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
  return item?.storage ? { ...item.storage } : null;
}
