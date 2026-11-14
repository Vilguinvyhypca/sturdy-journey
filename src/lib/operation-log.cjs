/* eslint-disable @typescript-eslint/no-require-imports -- Also used by native Node catalog tests and maintenance tools. */
const { createHash, randomUUID } = require("node:crypto");
const { constants } = require("node:fs");
const { mkdir, open, readdir, rm } = require("node:fs/promises");
const { join } = require("node:path");
const { withCatalogLock } = require("./catalog-lock.cjs");

const maximumDailyBytes = 5 * 1024 * 1024;
const retentionDays = 30;
const actions = new Set(["media.create", "media.update", "media.delete", "profile.create", "profile.update", "theme.update",
  "upload.playback", "upload.thumbnail", "upload.cleanup", "upload.save", "media.original", "media.playback", "media.thumbnail", "experience.store", "request.error"]);
const codes = new Set(["ENOSPC", "EACCES", "EPERM", "EROFS", "ENOENT", "EIO", "ELOOP", "ETIMEDOUT", "CATALOG_BUSY", "ERR_INVALID_STATE", "ABORT_ERR"]);
const errorNames = new Set(["Error", "TypeError", "RangeError", "SyntaxError", "AbortError", "LocalUploadError", "DuplicateMediaError", "ProfileInputError"]);
const fields = new Set(["title", "description", "visibility", "profileId", "name", "bio", "handle", "socialLinks", "avatarMediaId", "theme"]);
const routes = new Set(["/", "/admin", "/admin/experience", "/admin/profiles", "/admin/profiles/[slug]", "/p/[slug]", "/photos", "/photos/[id]", "/videos", "/videos/[id]", "/feed", "/profiles", "/albums", "/albums/[id]",
  "/api/media", "/api/profiles", "/api/settings", "/api/local-upload", "/api/local-media", "/api/local-playback", "/api/local-thumbnail", "/api/experience", "/api/upload-config", "/api/health", "/api/auth/[...nextauth]"]);
let pending = Promise.resolve();

function safeEvent(action, details = {}, error) {
  const event = { id: randomUUID(), at: new Date().toISOString(), action: actions.has(action) ? action : "request.error",
    outcome: error === undefined ? "saved" : "failed" };
  // Correlate catalog objects without recording names, URLs or original filenames.
  if (typeof details.id === "string") event.targetHash = createHash("sha256").update(details.id).digest("hex");
  for (const key of ["beforeVisibility", "visibility"]) {
    if (["public", "unlisted", "private"].includes(details[key])) event[key] = details[key];
  }
  if (Array.isArray(details.fields)) event.fields = [...new Set(details.fields.filter((field) => fields.has(field)))];
  const route = typeof details.route === "string" ? details.route.replace(/^\/app(?=\/|$)/, "").replace(/\/(?:page|route)$/, "") || "/" : undefined;
  if (routes.has(route)) event.route = route;
  if (["GET", "HEAD", "POST", "PATCH", "DELETE"].includes(details.method)) event.method = details.method;
  if (/^\d{8}T\d{12}Z-[a-f0-9]{8,40}$/.test(process.env.MEDIA_RELEASE_ID ?? "")) event.release = process.env.MEDIA_RELEASE_ID;
  if (error !== undefined) {
    event.errorType = errorNames.has(error?.name) ? error.name : "Error";
    if (codes.has(error?.code)) event.errorCode = error.code;
    // Never serialize an Error object, its message, command output, request or headers.
    const frames = typeof error?.stack === "string" ? error.stack.split("\n").slice(1) : [];
    const locations = frames.map((frame) => frame.match(/(?:src\/[A-Za-z0-9_./[\]-]{1,160}\.(?:ts|tsx|js)|\.next\/server\/[A-Za-z0-9_./[\]-]{1,160}\.js):\d{1,8}:\d{1,8}/)?.[0]).filter(Boolean).slice(0, 5);
    if (locations.length) event.locations = locations;
  }
  return event;
}

function recordOperation(dataDirectory, action, details = {}, error) {
  const event = safeEvent(action, details, error);
  const line = JSON.stringify(event) + "\n";
  const operation = pending.then(async () => {
    const directory = join(dataDirectory, "operations");
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await withCatalogLock(directory, async () => {
        const date = event.at.slice(0, 10);
        const cutoff = new Date(event.at);
        cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays + 1);
        const cutoffDate = cutoff.toISOString().slice(0, 10);
        for (const name of await readdir(directory)) {
          if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(name) && name.slice(0, 10) < cutoffDate) await rm(join(directory, name));
        }
        const file = await open(join(directory, `${date}.jsonl`), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
        try {
          const info = await file.stat();
          if (!info.isFile() || info.size + Buffer.byteLength(line) > maximumDailyBytes) throw new Error("Operation log full");
          await file.writeFile(line);
        } finally { await file.close(); }
      }, 1);
      if (event.outcome === "failed") console.error(line.trimEnd());
    } catch {
      // A completed catalog change must not become a failed upload/delete because
      // its audit write failed. Only this sanitized event reaches the journal.
      console.error(JSON.stringify({ ...event, logStorageUnavailable: true }));
    }
  });
  pending = operation.catch(() => undefined);
  return pending;
}

function recordFailure(action, error, details = {}) {
  return recordOperation(process.env.MEDIA_DATA_DIR || join(process.cwd(), "data"), action, details, error ?? new Error());
}

module.exports = { recordOperation, recordFailure, maximumDailyBytes, retentionDays };
