export const siteThemes = ["indigo", "forest", "sunset", "midnight"] as const;
export type SiteTheme = typeof siteThemes[number];

export function isSiteTheme(value: unknown): value is SiteTheme {
  return typeof value === "string" && (siteThemes as readonly string[]).includes(value);
}
