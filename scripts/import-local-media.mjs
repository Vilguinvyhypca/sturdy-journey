#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, copyFile, lstat, mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const formats = new Map([
  [".jpg", "photo"], [".jpeg", "photo"], [".png", "photo"], [".gif", "photo"],
  [".webp", "photo"], [".avif", "photo"], [".mp4", "video"],
  [".webm", "video"], [".mov", "video"],
]);

const args = process.argv.slice(2);
const sourceIndex = args.indexOf("--source");
const apply = args.includes("--apply");
if (sourceIndex < 0 || !args[sourceIndex + 1] || args.some((arg) => arg.startsWith("--") && !["--source", "--apply"].includes(arg))) {
  console.error("Usage: node --env-file=.env.local scripts/import-local-media.mjs --source /absolute/staging/folder [--apply]");
  process.exit(2);
}
if (process.env.DATABASE_URL || process.env.DATABASE_URL_DATABASE_URL) {
  console.error("This importer supports only the local JSON catalog. Do not use it with DATABASE_URL set.");
  process.exit(2);
}
if (process.env.MEDIA_UPLOAD_PROVIDER !== "local") {
  console.error("MEDIA_UPLOAD_PROVIDER must be local.");
  process.exit(2);
}
const storageSetting = process.env.MEDIA_STORAGE_ROOT;
if (!storageSetting || !isAbsolute(storageSetting)) {
  console.error("MEDIA_STORAGE_ROOT must be an absolute path.");
  process.exit(2);
}
const source = await realpath(resolve(args[sourceIndex + 1]));
const storageRoot = await realpath(storageSetting);
const repository = await realpath(process.cwd());
const inside = (parent, child) => {
  const path = relative(parent, child);
  return !path || (!path.startsWith("../") && path !== ".." && !isAbsolute(path));
};
if (inside(repository, source) || inside(repository, storageRoot) || inside(storageRoot, source) || inside(source, storageRoot)) {
  console.error("The source, storage root, and repository must be separate directories.");
  process.exit(2);
}
if (!(await stat(source)).isDirectory()) {
  console.error("The source must be a directory.");
  process.exit(2);
}
const dataDirectory = join(repository, "data");
const dataFile = join(dataDirectory, "media.json");
let records;
try {
  records = JSON.parse(await readFile(dataFile, "utf8"));
  if (!Array.isArray(records)) throw new Error("Catalog is not an array.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  records = [];
}

async function* candidates(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) yield* candidates(path);
    else if (entry.isFile() && formats.has(extname(entry.name).toLowerCase())) yield path;
  }
}

const files = [];
let totalBytes = 0;
for await (const path of candidates(source)) {
  const details = await lstat(path);
  if (!details.isFile()) continue;
  files.push({ path, bytes: details.size });
  totalBytes += details.size;
}
console.log(`${apply ? "Importing" : "Dry run:"} ${files.length} supported files (${(totalBytes / 1024 / 1024 / 1024).toFixed(2)} GiB) from ${source}`);
if (!apply) {
  console.log("No files changed. Stop mediaspace.service and rerun with --apply to import.");
  process.exit(0);
}
await mkdir(dataDirectory, { recursive: true });
await access(storageRoot);
try {
  await copyFile(dataFile, join(dataDirectory, `media.json.before-import-${Date.now()}`));
  console.log("Backed up the existing catalog in data/.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const hashes = new Set(records.map((record) => record.contentHash).filter(Boolean));
let imported = 0;
let duplicates = 0;
let failed = 0;
for (const { path } of files) {
  const extension = extname(path).toLowerCase();
  const id = randomUUID();
  const key = `${id}${extension === ".jpeg" ? ".jpg" : extension}`;
  const destination = join(storageRoot, key);
  const hash = createHash("sha256");
  let size = 0;
  try {
    await pipeline(createReadStream(path), new Transform({
      transform(chunk, _encoding, callback) {
        size += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    }), createWriteStream(destination, { flags: "wx", mode: 0o600 }));
    if (!size) throw new Error("Empty file");
    const contentHash = hash.digest("hex");
    if (hashes.has(contentHash)) {
      duplicates++;
      await rm(destination);
      continue;
    }
    const mediaId = `local:${id}`;
    const title = basename(path, extname(path)).slice(0, 120) || "Untitled media";
    const record = {
      id: mediaId,
      url: `/api/local-media?id=${encodeURIComponent(mediaId)}`,
      title,
      type: formats.get(extension),
      createdAt: "Just now",
      album: "Uploads",
      contentHash,
      fileSizeBytes: size,
      visibility: "private",
      capturedAt: null,
      durationSeconds: null,
      storage: { provider: "local", objectKey: key, playbackId: null, access: "private" },
    };
    const next = [record, ...records];
    const temporary = join(dataDirectory, `media.json.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(next, null, 2), { mode: 0o600 });
      await rename(temporary, dataFile);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    records = next;
    hashes.add(contentHash);
    imported++;
  } catch (error) {
    failed++;
    await rm(destination, { force: true });
    console.error(`Skipped ${relative(source, path)}: ${error.message}`);
  }
}
console.log(`Done: ${imported} imported, ${duplicates} exact duplicates skipped, ${failed} failed. Originals remain in ${source}.`);
if (failed) process.exitCode = 1;
