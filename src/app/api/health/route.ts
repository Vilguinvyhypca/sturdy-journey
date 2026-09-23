export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    { status: "ok", release: process.env.MEDIA_RELEASE_ID ?? "development" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
