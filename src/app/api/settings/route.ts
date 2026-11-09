import { validateAdminOrigin } from "@/lib/admin-origin";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { getSiteTheme, saveSiteTheme } from "@/lib/database";
import { JsonRequestError, readJsonObject } from "@/lib/request-json";
import { isSiteTheme } from "@/lib/theme";
import { recordAdminChange, recordApplicationFailure } from "@/lib/operational-logging";

export async function GET() {
  return NextResponse.json({ theme: await getSiteTheme() });
}

async function updateTheme(request: Request) {
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
  const previousTheme = await getSiteTheme();
  await saveSiteTheme(body.theme);
  if (previousTheme !== body.theme) await recordAdminChange("theme.updated", "site_theme", "site_theme", { changedFields: ["theme"], theme: body.theme });
  return NextResponse.json({ theme: body.theme });
}

export async function PATCH(request: Request) {
  try {
    const response = await updateTheme(request);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    await recordApplicationFailure({ route: "/api/settings", operation: "update_theme", error });
    throw error;
  }
}
