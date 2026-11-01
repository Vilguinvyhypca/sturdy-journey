import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions, isAdmin } from "@/lib/auth";
import { getMuxUsageSummary, usesMux } from "@/lib/mux";

const headers = { "Cache-Control": "private, no-store" };

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
    return NextResponse.json({ error: "Sign in as the administrator to view usage." }, { status: 401, headers });
  }
  if (!usesMux) return NextResponse.json({ error: "Mux is not configured yet." }, { status: 503, headers });

  try {
    return NextResponse.json({ usage: await getMuxUsageSummary() }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Mux usage could not be loaded." }, { status: 502, headers });
  }
}