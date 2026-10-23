/** Exact operator-configured origins; proxy and request host headers are not trusted. */
export function validateAdminOrigin(request: Request): Response | null {
  const reject = (status: number, error: string) => Response.json({ error }, {
    status, headers: { "Cache-Control": "private, no-store" },
  });
  let allowed: Set<string>;
  try {
    const canonical = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (!canonical) throw new Error("Missing canonical origin");
    const parse = (value: string, originOnly: boolean) => {
      const url = new URL(value);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
        || (originOnly && (url.pathname !== "/" || url.search || url.hash))) throw new Error("Invalid origin");
      return url.origin;
    };
    allowed = new Set([parse(canonical, false)]);
    for (const value of (process.env.MEDIA_ADMIN_ORIGINS ?? "").split(",").map((part) => part.trim()).filter(Boolean)) {
      allowed.add(parse(value, true));
    }
  } catch {
    return reject(503, "Administrator origins are not configured correctly.");
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") return reject(403, "Invalid administrator request origin.");
  const origin = request.headers.get("origin");
  const source = origin ?? request.headers.get("referer");
  try {
    if (!source) throw new Error("Missing origin");
    const url = new URL(source);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password
      || (origin !== null && (url.pathname !== "/" || url.search || url.hash))
      || !allowed.has(url.origin)) throw new Error("Untrusted origin");
  } catch {
    return reject(403, "Invalid administrator request origin.");
  }
  return null;
}
