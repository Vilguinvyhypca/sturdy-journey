import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { usesLocalStorage, maximumLocalUploadBytes } from "@/lib/local-storage";
import { usesMux } from "@/lib/mux";
import { usesPrivateBlobStorage } from "@/lib/storage";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return Response.json({ error: "Sign in to upload." }, { status: 401, headers });
  return Response.json({
    local: usesLocalStorage, mux: usesMux,
    photo: usesPrivateBlobStorage ? "private-blob" : "server",
    maximumBytes: usesLocalStorage ? maximumLocalUploadBytes : 50 * 1024 * 1024,
  }, { headers });
}
