import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { limitAdminAction } from "@/lib/rate-limit";

const handler = NextAuth(authOptions);

async function limitedHandler(request: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) {
  // Use the same decoded route parameters as NextAuth, including when an
  // attacker encodes provider names or appends unused path segments.
  const { nextauth } = await context.params;
  const [action, provider] = nextauth;
  const login = (request.method === "POST" && action === "callback" && provider === "credentials")
    || (action === "signin" && Boolean(provider));
  if (login) {
    const limited = await limitAdminAction("signin");
    if (limited) {
      // NextAuth's credentials client expects a URL even for a failed response.
      const url = new URL("/api/auth/error", request.url);
      url.searchParams.set("error", limited.status === 429 ? "RateLimited" : "TemporarilyUnavailable");
      return Response.json({ ...await limited.json(), url: url.href }, { status: limited.status, headers: limited.headers });
    }
  }
  return handler(request, context);
}

export { limitedHandler as GET, limitedHandler as POST };
