import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { saveMedia, usesDatabase } from "@/lib/database";
import { listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to scan media." }, { status: 401 });
  if (!usesDatabase || !usesBlobStorage) return NextResponse.json({ error: "Fingerprint scanning is available after connecting Blob storage and the database." }, { status: 503 });

  const media = await listBlobMedia();
  let scanned = 0;
  for (const item of media) {
    const response = await fetch(item.url);
    if (!response.ok) continue;
    const contentHash = createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex");
    await saveMedia({ ...item, contentHash });
    scanned += 1;
  }
  return NextResponse.json({ scanned, total: media.length });
}
