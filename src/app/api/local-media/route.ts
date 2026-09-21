import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { getLocalMediaStorage, readMedia } from "@/lib/db";
import { getMediaById, getMediaStorage, usesDatabase } from "@/lib/database";
import { localMediaResponse } from "@/lib/local-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const missing = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || id.length > 2048) return missing();
  const media = usesDatabase ? await getMediaById(id) : (await readMedia()).find((item) => item.id === id);
  if (!media) return missing();
  if (media.visibility !== "public" && media.visibility !== "unlisted") {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return missing();
  }
  const storage = usesDatabase ? await getMediaStorage(id) : await getLocalMediaStorage(id);
  if (storage?.provider !== "local" || storage.access !== "private") return missing();
  try {
    return await localMediaResponse(storage.objectKey, request);
  } catch (error) {
    if (["ENOENT", "ELOOP"].includes((error as NodeJS.ErrnoException).code ?? "")) return missing();
    console.error("Local media unavailable", error);
    return new Response("Media temporarily unavailable", { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}

export const HEAD = GET;
