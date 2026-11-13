import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withCatalogLock } from "./catalog-lock.cjs";
import { recordApplicationFailure } from "./operational-logging";

const windowMs = 60_000;
const maximumEvents = 1_200;
const maximumSessionEvents = 60;
const directory = join(process.env.MEDIA_DATA_DIR || join(process.cwd(), "data"), "rate-limits");
type Entry = { at: number; sessionId: string };

// Shared rolling quota: rotating client-controlled session IDs cannot bypass
// the overall bound. No IP/forwarding headers are used or persisted.
export async function limitExperienceEvent(sessionId: string, now = Date.now()): Promise<Response | null> {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  try {
    return await withCatalogLock(directory, async () => {
      const file = join(directory, "experience.json");
      let previous: Entry[] = [];
      try {
        previous = JSON.parse(await readFile(file, "utf8"));
        if (!Array.isArray(previous) || previous.length > maximumEvents || !previous.every((entry) =>
          entry && Number.isFinite(entry.at) && typeof entry.sessionId === "string" && entry.sessionId.length <= 36)) {
          throw new Error("Invalid experience rate-limit state");
        }
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const recent = previous.filter((entry) => entry.at > now - windowMs).sort((a, b) => a.at - b.at);
      const session = recent.filter((entry) => entry.sessionId === sessionId);
      const globalOldest = recent.length >= maximumEvents ? recent[0] : null;
      const sessionOldest = session.length >= maximumSessionEvents ? session[0] : null;
      const oldest = globalOldest && sessionOldest
        ? (globalOldest.at > sessionOldest.at ? globalOldest : sessionOldest)
        : globalOldest ?? sessionOldest;
      if (oldest) {
        return Response.json({ accepted: false }, { status: 429,
          headers: { ...headers, "Retry-After": String(Math.max(1, Math.ceil((oldest.at + windowMs - now) / 1000))) } });
      }
      recent.push({ at: now, sessionId });
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(recent), { mode: 0o600 });
        await rename(temporary, file);
      } finally { await rm(temporary, { force: true }); }
      return null;
    }, 1);
  } catch (error) {
    await recordApplicationFailure({ route: "service", operation: "experience_rate_limit_state", error });
    return Response.json({ error: "Event collection is temporarily unavailable." },
      { status: 503, headers: { ...headers, "Retry-After": "10" } });
  }
}
