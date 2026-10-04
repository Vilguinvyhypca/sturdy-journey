import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { recordExperienceEvent, validateExperienceEvent } from "@/lib/experience";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const recentEvents = new Map<string, { startedAt: number; count: number }>();
const responseHeaders = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const requestUrl = new URL(request.url);
      const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? requestUrl.host).split(",")[0].trim().toLowerCase();
      if (originUrl.host.toLowerCase() !== host) return Response.json({ error: "Invalid event origin." }, { status: 403, headers: responseHeaders });
    } catch { return Response.json({ error: "Invalid event origin." }, { status: 403, headers: responseHeaders }); }
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return Response.json({ error: "Invalid event origin." }, { status: 403, headers: responseHeaders });
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return Response.json({ error: "Invalid event content type." }, { status: 415, headers: responseHeaders });

  let raw = "";
  const decoder = new TextDecoder();
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders });
  let size = 0;
  while (true) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try { chunk = await reader.read(); } catch { return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders }); }
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 4_096) {
      await reader.cancel().catch(() => undefined);
      return Response.json({ error: "Event is too large." }, { status: 413, headers: responseHeaders });
    }
    raw += decoder.decode(chunk.value, { stream: true });
  }
  raw += decoder.decode();
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders }); }
  const event = validateExperienceEvent(body);
  if (!event) return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders });

  const now = Date.now();
  const rate = recentEvents.get(event.sessionId);
  if (rate && now - rate.startedAt < 60_000 && rate.count >= 60) {
    return Response.json({ accepted: false }, { status: 429, headers: responseHeaders });
  }
  if (!rate || now - rate.startedAt >= 60_000) recentEvents.set(event.sessionId, { startedAt: now, count: 1 });
  else rate.count += 1;
  if (recentEvents.size > 10_000) {
    for (const [sessionId, entry] of recentEvents) if (now - entry.startedAt >= 60_000) recentEvents.delete(sessionId);
  }

  try {
    await recordExperienceEvent(event);
    return Response.json({ accepted: true }, { headers: responseHeaders });
  } catch (error) {
    console.error("Experience event could not be stored", error);
    return Response.json({ error: "Event could not be stored." }, { status: 503, headers: responseHeaders });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
    return Response.json({ error: "Sign in as the administrator to view experience reports." }, { status: 401, headers: responseHeaders });
  }
  const { readExperienceSummary } = await import("@/lib/experience");
  return Response.json(await readExperienceSummary(), { headers: responseHeaders });
}
