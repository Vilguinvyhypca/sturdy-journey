import { randomUUID } from "node:crypto";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { withCatalogLock } from "./catalog-lock.cjs";

const policies = { signin: 10, upload: 120 } as const;
type Action = keyof typeof policies;
const windowMs = 60_000;
const directory = join(process.env.MEDIA_DATA_DIR || join(process.cwd(), "data"), "rate-limits");

// Service-wide limits for the single administrator. Never trust arbitrary
// forwarding headers or client-selected session IDs as quota identities.
export async function limitAdminAction(action: Action, now = Date.now()): Promise<Response | null> {
  const headers = { "Cache-Control": "private, no-store" };
  try {
    return await withCatalogLock(directory, async () => {
      const file = join(directory, `${action}.json`);
      let previous: number[] = [];
      try {
        previous = JSON.parse(await readFile(file, "utf8"));
        if (!Array.isArray(previous) || previous.length > policies[action] || !previous.every((at) => Number.isFinite(at))) throw new Error("Invalid rate-limit state");
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const recent = previous.filter((at) => at > now - windowMs).sort((a, b) => a - b);
      if (recent.length >= policies[action]) {
        const retry = Math.max(1, Math.ceil((recent[0] + windowMs - now) / 1000));
        return Response.json({ error: `Too many ${action === "signin" ? "sign-in attempts" : "uploads"}. Please try again in ${retry} seconds.` },
          { status: 429, headers: { ...headers, "Retry-After": String(retry) } });
      }
      recent.push(now);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(recent), { mode: 0o600 });
        await rename(temporary, file);
      } finally { await rm(temporary, { force: true }); }
      return null;
    });
  } catch (error) {
    console.error("Administrator rate limit unavailable", error);
    return Response.json({ error: "This action is temporarily unavailable. Please retry shortly." },
      { status: 503, headers: { ...headers, "Retry-After": "10" } });
  }
}
