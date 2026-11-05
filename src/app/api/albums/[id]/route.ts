import { validateAdminOrigin } from "@/lib/admin-origin";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { deleteAlbum, getAlbum, updateAlbum, usesDatabase } from "@/lib/database";
import { privatePhotoDeliveryUrl } from "@/lib/media";
import { isPrivateBlobUrl } from "@/lib/storage";
import { limitAdminAction } from "@/lib/rate-limit";
import { JsonRequestError, readJsonObject } from "@/lib/request-json";

const headers = { "Cache-Control": "private, no-store" };

export async function GET(_request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503, headers });
  const session = await getServerSession(authOptions);
  const administrator = isAdmin(session?.user as { isAdmin?: boolean } | undefined);
  const { id } = await params;
  const result = await getAlbum(id, administrator);
  if (!result) return NextResponse.json({ error: "Album not found." }, { status: 404, headers });
  return NextResponse.json({
    ...result,
    media: result.media.map((item) =>
      item.type === "photo" && isPrivateBlobUrl(item.url)
        ? { ...item, url: privatePhotoDeliveryUrl(item) }
        : item,
    ),
  }, { headers });
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to edit an album." }, { status: 401, headers });
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503, headers });
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await readJsonObject(request); }
  catch (error) {
    if (!(error instanceof JsonRequestError)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.status, headers });
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 80 || description.length > 500) return NextResponse.json({ error: "Enter a name and keep the details within the allowed length." }, { status: 400, headers });
  try {
    const album = await updateAlbum(id, name, description);
    if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404, headers });
    return NextResponse.json({ album }, { headers });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return NextResponse.json({ error: "An album with that name already exists." }, { status: 409, headers });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete an album." }, { status: 401, headers });
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503, headers });
  const limited = await limitAdminAction("delete");
  if (limited) return limited;
  const { id } = await params;
  if (!await deleteAlbum(id)) return NextResponse.json({ error: "Album not found." }, { status: 404, headers });
  return NextResponse.json({ deleted: true }, { headers });
}
