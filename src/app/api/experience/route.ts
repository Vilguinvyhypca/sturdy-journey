import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { recordExperienceEvent, validateExperienceEvent } from "@/lib/experience";
import { validateRequestOrigin } from "@/lib/admin-origin";
import { limitExperienceEvent } from "@/lib/experience-rate-limit";
import { recordApplicationFailure } from "@/lib/operational-logging";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  const denied = validateRequestOrigin(request, "event");
  if (denied) {
    denied.headers.set("X-Content-Type-Options", "nosniff");
    return denied;
  }
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return Response.json({ error: "Invalid event content type." }, { status: 415, headers: responseHeaders });
  if (Number(request.headers.get("content-length")) > 4_096) {
    await request.body?.cancel().catch(() => undefined);
    return Response.json({ error: "Event is too large." }, { status: 413, headers: responseHeaders });
  }

  let raw = "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const reader = request.body?.getReader();
  if (!reader) return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders });
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 4_096) {
        await reader.cancel().catch(() => undefined);
        return Response.json({ error: "Event is too large." }, { status: 413, headers: responseHeaders });
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode();
  } catch {
    await reader.cancel().catch(() => undefined);
    return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders });
  } finally { reader.releaseLock(); }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders }); }
  const event = validateExperienceEvent(body);
  if (!event) return Response.json({ error: "Invalid event." }, { status: 400, headers: responseHeaders });

  const limited = await limitExperienceEvent(event.sessionId);
  if (limited) return limited;

  try {
    await recordExperienceEvent(event);
    return Response.json({ accepted: true }, { headers: responseHeaders });
  } catch (error) {
    await recordApplicationFailure({ route: "/api/experience", operation: "store_experience_event", error });
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
