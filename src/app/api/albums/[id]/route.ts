import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { deleteAlbum, getAlbum, updateAlbum, usesDatabase } from "@/lib/database";

export async function GET(_request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  const session = await getServerSession(authOptions);
  const administrator = isAdmin(session?.user as { isAdmin?: boolean } | undefined);
  const { id } = await params;
  const result = await getAlbum(id, administrator);
  if (!result) return NextResponse.json({ error: "Album not found." }, { status: 404 });
  return NextResponse.json(result);
}

export async function PATCH(request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to edit an album." }, { status: 401 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  const { id } = await params;
  const body = await request.json() as { name?: unknown; description?: unknown };
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 80 || description.length > 500) return NextResponse.json({ error: "Enter a name and keep the details within the allowed length." }, { status: 400 });
  try {
    const album = await updateAlbum(id, name, description);
    if (!album) return NextResponse.json({ error: "Album not found." }, { status: 404 });
    return NextResponse.json({ album });
  } catch (error) {
    if (error instanceof Error && error.message.includes("unique")) return NextResponse.json({ error: "An album with that name already exists." }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to delete an album." }, { status: 401 });
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  const { id } = await params;
  if (!await deleteAlbum(id)) return NextResponse.json({ error: "Album not found." }, { status: 404 });
  return NextResponse.json({ deleted: true });
}
