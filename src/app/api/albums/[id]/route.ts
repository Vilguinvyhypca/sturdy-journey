import { NextResponse } from "next/server";
import { getAlbum, usesDatabase } from "@/lib/database";

export async function GET(_request: Request, { params }: RouteContext<"/api/albums/[id]">) {
  if (!usesDatabase) return NextResponse.json({ error: "The database is not configured yet." }, { status: 503 });
  const { id } = await params;
  const result = await getAlbum(id);
  if (!result) return NextResponse.json({ error: "Album not found." }, { status: 404 });
  return NextResponse.json(result);
}
