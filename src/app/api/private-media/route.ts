import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { getMediaById, usesDatabase } from "@/lib/database";
import { getPrivateBlob, isPrivateBlobUrl, usesPrivateBlobStorage } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!usesDatabase || !usesPrivateBlobStorage) {
    return new NextResponse("Not found", { status: 404 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id || id.length > 2_048) {
    return new NextResponse("Not found", { status: 404 });
  }

  const media = await getMediaById(id);
  if (!media || media.type !== "photo" || !isPrivateBlobUrl(media.url)) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (media.visibility === "private") {
    const session = await getServerSession(authOptions);
    if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
      return new NextResponse("Not found", { status: 404 });
    }
  }

  const result = await getPrivateBlob(media.url, request.headers.get("if-none-match") ?? undefined);
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }
  const commonHeaders = {
    ETag: result.blob.etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
  if (result.statusCode === 304) {
    return new NextResponse(null, { status: 304, headers: commonHeaders });
  }
  return new NextResponse(result.stream, {
    headers: { ...commonHeaders, "Content-Type": result.blob.contentType },
  });
}