import { validateAdminOrigin } from "@/lib/admin-origin";
import { createHash } from "node:crypto";
import * as exifr from "exifr";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { saveMedia, usesDatabase } from "@/lib/database";
import { listBlobMedia, usesBlobStorage } from "@/lib/storage";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to scan media." }, { status: 401 });
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  if (!usesDatabase || !usesBlobStorage) return NextResponse.json({ error: "Fingerprint scanning is available after connecting Blob storage and the database." }, { status: 503 });

  const media = await listBlobMedia();
  let scanned = 0;
  for (const item of media) {
    const response = await fetch(item.url);
    if (!response.ok) continue;
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentHash = createHash("sha256").update(bytes).digest("hex");
    let capturedAt: string | null = null;
    if (item.type === "photo") {
      try {
        const metadata = await exifr.parse(bytes, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
        const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
        if (date instanceof Date && !Number.isNaN(date.getTime())) capturedAt = date.toISOString();
      } catch {
        // Some images do not include readable EXIF metadata.
      }
    }
    await saveMedia({ ...item, contentHash, capturedAt, fileSizeBytes: bytes.byteLength });
    scanned += 1;
  }
  return NextResponse.json({ scanned, total: media.length });
}
