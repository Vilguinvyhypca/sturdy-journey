export function getSiteUrl() {
  const rawUrl =
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000");

  try {
    return new URL(rawUrl);
  } catch {
    return new URL("http://localhost:3000");
  }
}
