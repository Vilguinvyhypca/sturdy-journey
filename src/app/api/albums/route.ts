import { validateAdminOrigin } from "@/lib/admin-origin";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { createAlbum, listAlbums, listAlbumsPage, usesDatabase } from "@/lib/database";
import { JsonRequestError, readJsonObject } from "@/lib/request-json";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  if (!usesDatabase) return NextResponse.json({ albums: [] }, { headers });
  const session = await getServerSession(authOptions);
  const administrator = isAdmin(session?.user as { isAdmin?: boolean } | undefined);
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.has("limit") || searchParams.has("cursor")) {
    const requestedLimit = Number(searchParams.get("limit") ?? "24");
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 24;
    return NextResponse.json(await listAlbumsPage({ includeNonPublic: administrator, cursor: searchParams.get("cursor"), limit }), { headers });
  }
  return NextResponse.json({ albums: await listAlbums(administrator) }, { headers });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to create an album." }, { status: 401, headers });
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503, headers });

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); }
  catch (error) {
    if (!(error instanceof JsonRequestError)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name) return NextResponse.json({ error: "Give the album a name." }, { status: 400, headers });
  if (name.length > 80 || description.length > 500) return NextResponse.json({ error: "Album details are too long." }, { status: 400, headers });

  try {
    const album = await createAlbum(randomUUID(), name, description);
    return NextResponse.json({ album }, { status: 201, headers });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return NextResponse.json({ error: "An album with that name already exists." }, { status: 409, headers });
    throw error;
  }
}
