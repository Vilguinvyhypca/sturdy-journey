import { createHash, randomUUID } from "node:crypto";
import { constants, chmodSync, closeSync, fchmodSync, mkdirSync, openSync, readdirSync, rmSync, writeSync } from "node:fs";
import { chmod, mkdir, open, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const retentionDays = 90;
const safeCode = /^[A-Z0-9_]{1,48}$/;
const safeErrorName = /^[A-Za-z][A-Za-z0-9_.]{0,63}$/;
const auditActions = new Set([
  "media.uploaded", "media.updated", "media.deleted", "media.album_assignment",
  "profile.created", "profile.updated", "theme.updated",
]);
const auditResourceTypes = new Set(["media", "profile", "album", "site_theme"]);
const auditFields = new Set(["title", "description", "visibility", "profileId", "albums", "name", "slug", "bio", "handle", "avatarMediaId", "socialLinks", "theme"]);
const visibilityValues = new Set(["public", "unlisted", "private"]);
const themeValues = new Set(["indigo", "forest", "sunset", "midnight"]);
const failureRoutes = new Set(["/api/local-upload", "/api/media", "/api/profiles", "/api/settings", "/api/local-media", "/api/local-playback", "/api/local-thumbnail", "/api/experience", "service", "runtime"]);
const failureOperations = new Set([
  "generate_playback_copy", "generate_thumbnail", "catalog_busy", "upload_validation_unavailable",
  "cleanup_rejected_upload", "save_upload", "update_media", "delete_media", "create_profile",
  "update_profile", "update_theme", "serve_local_media", "serve_local_playback", "serve_local_thumbnail",
  "store_experience_event", "admin_rate_limit_state", "experience_rate_limit_state",
  "uncaught_exception", "unhandled_rejection",
]);

type FailureContext = { route: string; operation: string; error: unknown; source?: "request" | "runtime" };
type AuditDetails = {
  changedFields?: unknown;
  mediaType?: unknown;
  previousVisibility?: unknown;
  visibility?: unknown;
  theme?: unknown;
};

let pendingWrite: Promise<void> = Promise.resolve();
let lastCleanupDate = "";

function logDirectory() {
  const dataDirectory = process.env.MEDIA_DATA_DIR ? join(process.env.MEDIA_DATA_DIR) : join(process.cwd(), "data");
  return join(dataDirectory, "operations");
}

function shortSafeName(value: unknown, pattern: RegExp, fallback: string) {
  return typeof value === "string" && pattern.test(value) ? value : fallback;
}

function errorDetails(error: unknown) {
  if (!error || typeof error !== "object") return { errorName: "UnknownError" };
  const candidate = error as { name?: unknown; code?: unknown; stack?: unknown };
  const errorName = shortSafeName(candidate.name, safeErrorName, "Error");
  const errorCode = typeof candidate.code === "string" && safeCode.test(candidate.code) ? candidate.code : undefined;
  const stackFrames = typeof candidate.stack === "string"
    ? candidate.stack.split("\n").slice(1, 7)
      .filter((line) => /^\s+at\s/.test(line))
      .map((line) => {
        let frame = line.trim().replaceAll(process.cwd(), "[app]");
        if (process.env.MEDIA_STORAGE_ROOT) frame = frame.replaceAll(process.env.MEDIA_STORAGE_ROOT, "[media-storage]");
        if (process.env.MEDIA_DATA_DIR) frame = frame.replaceAll(process.env.MEDIA_DATA_DIR, "[media-data]");
        return frame.replace(/\?.*?(?=\)|$)/g, "?[redacted]").slice(0, 240);
      })
    : [];
  return { errorName, ...(errorCode ? { errorCode } : {}), ...(stackFrames.length ? { stackFrames } : {}) };
}

function emit(event: Record<string, unknown>) {
  try { process.stderr.write(`${JSON.stringify(event)}\n`); } catch { /* logging must not replace the original failure */ }
}

function runtimeFailureEvent(error: unknown, operation: string) {
  return {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: "application_failure",
    source: "runtime",
    route: "runtime",
    operation: failureOperations.has(operation) ? operation : "unknown",
    ...errorDetails(error),
  };
}

export function recordRuntimeFailure(error: unknown, operation: string) {
  const event = runtimeFailureEvent(error, operation);
  emit(event);
  let descriptor: number | undefined;
  try {
    const directory = logDirectory();
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    const date = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(`${date}T00:00:00.000Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
    const cutoffDate = cutoff.toISOString().slice(0, 10);
    for (const file of readdirSync(directory)) {
      if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && file.slice(0, 10) < cutoffDate) rmSync(join(directory, file), { force: true });
    }
    const noFollowFlag = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
    descriptor = openSync(join(directory, `${date}.jsonl`), constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollowFlag, 0o600);
    fchmodSync(descriptor, 0o600);
    writeSync(descriptor, `${JSON.stringify(event)}\n`, null, "utf8");
  } catch {
    emit({ schemaVersion: 1, at: new Date().toISOString(), kind: "operational_log_write_failed", source: "runtime_failure" });
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* preserve the process failure */ }
    }
  }
}

async function pruneExpired(directory: string, today: string) {
  if (lastCleanupDate === today) return;
  const cutoff = new Date(`${today}T00:00:00.000Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  let files: string[];
  try { files = await readdir(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") files = [];
    else throw error;
  }
  await Promise.all(files
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(file) && file.slice(0, 10) < cutoffDate)
    .map((file) => rm(join(directory, file), { force: true })));
  lastCleanupDate = today;
}

async function appendEvent(event: Record<string, unknown>) {
  const operation = pendingWrite.then(async () => {
    const directory = logDirectory();
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const date = new Date().toISOString().slice(0, 10);
    await pruneExpired(directory, date);
    const path = join(directory, `${date}.jsonl`);
    const noFollowFlag = process.platform === "win32" ? 0 : constants.O_NOFOLLOW;
    const file = await open(path, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | noFollowFlag, 0o600);
    try {
      await file.chmod(0o600);
      await file.writeFile(`${JSON.stringify(event)}\n`, "utf8");
    }
    finally { await file.close(); }
  });
  pendingWrite = operation.catch(() => undefined);
  await operation;
}

export async function recordApplicationFailure({ route, operation, error, source = "request" }: FailureContext) {
  const safeRoute = failureRoutes.has(route) ? route : "unknown";
  const safeOperation = failureOperations.has(operation) ? operation : "unknown";
  const safeSource = source === "runtime" ? "runtime" : "request";
  const event = safeSource === "runtime"
    ? runtimeFailureEvent(error, safeOperation)
    : { schemaVersion: 1, id: randomUUID(), at: new Date().toISOString(), kind: "application_failure", source: safeSource, route: safeRoute, operation: safeOperation, ...errorDetails(error) };
  emit(event);
  try { await appendEvent(event); }
  catch { emit({ schemaVersion: 1, at: new Date().toISOString(), kind: "operational_log_write_failed", source: "application_failure" }); }
}

export async function recordAdminChange(action: string, resourceType: string, resourceId: string, details: AuditDetails = {}) {
  if (!auditActions.has(action) || !auditResourceTypes.has(resourceType)) return;
  const changedFields = Array.isArray(details.changedFields)
    ? [...new Set(details.changedFields.filter((field): field is string => typeof field === "string" && auditFields.has(field)))].slice(0, 12)
    : undefined;
  const mediaType = details.mediaType === "photo" || details.mediaType === "video" ? details.mediaType : undefined;
  const previousVisibility = typeof details.previousVisibility === "string" && visibilityValues.has(details.previousVisibility) ? details.previousVisibility : undefined;
  const visibility = typeof details.visibility === "string" && visibilityValues.has(details.visibility) ? details.visibility : undefined;
  const theme = typeof details.theme === "string" && themeValues.has(details.theme) ? details.theme : undefined;
  const event = {
    schemaVersion: 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    kind: "administrator_change",
    actor: "administrator",
    action,
    resourceType,
    resourceRef: createHash("sha256").update(resourceId.slice(0, 4096)).digest("hex").slice(0, 24),
    ...(changedFields?.length ? { changedFields } : {}),
    ...(mediaType ? { mediaType } : {}),
    ...(previousVisibility ? { previousVisibility } : {}),
    ...(visibility ? { visibility } : {}),
    ...(theme ? { theme } : {}),
  };
  try { await appendEvent(event); }
  catch { emit({ schemaVersion: 1, at: new Date().toISOString(), kind: "operational_log_write_failed", source: "administrator_change" }); }
}
