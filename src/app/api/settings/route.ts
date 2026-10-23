import { validateAdminOrigin } from "@/lib/admin-origin";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { getSiteTheme, saveSiteTheme } from "@/lib/database";
import { JsonRequestError, readJsonObject } from "@/lib/request-json";
import { isSiteTheme } from "@/lib/theme";

export async function GET() {
  return NextResponse.json({ theme: await getSiteTheme() });
}

export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) return NextResponse.json({ error: "Sign in as the administrator to change the theme." }, { status: 401 });
  const originDenied = validateAdminOrigin(request);
  if (originDenied) return originDenied;
  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request);
  } catch (error) {
    if (!(error instanceof JsonRequestError)) throw error;
    return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
  }
  if (!isSiteTheme(body.theme)) return NextResponse.json({ error: "That theme is not available." }, { status: 400 });
  await saveSiteTheme(body.theme);
  return NextResponse.json({ theme: body.theme });
}
