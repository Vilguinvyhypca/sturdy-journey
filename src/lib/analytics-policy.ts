// Only routes that exclusively list public content for anonymous visitors.
// Detail pages can contain unlisted media and intentionally remain excluded.
export function isAnalyticsRoute(pathname: string) {
  return ["/", "/photos", "/videos", "/feed", "/albums"].includes(pathname)
    || /^\/p\/[a-z0-9-]+$/.test(pathname);
}

export function isAnalyticsUrl(url: URL) {
  if (!isAnalyticsRoute(url.pathname) || url.hash) return false;
  // Legacy media-sharing links and arbitrary query values must not be recorded.
  return [...url.searchParams].every(([key, value]) =>
    key === "type" && ["photo", "video"].includes(value));
}
