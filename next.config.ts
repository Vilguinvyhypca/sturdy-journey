import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const nextConfig = (phase: string): NextConfig => {
  const releaseManifest = join(process.cwd(), "release.json");
  if (phase === PHASE_PRODUCTION_BUILD && existsSync(releaseManifest)) {
    const release = JSON.parse(readFileSync(releaseManifest, "utf8"));
    if (release.ready) throw new Error("Published releases cannot be rebuilt in place. Run npm run deploy:prod from the development checkout.");
  }
  return {
    distDir: process.env.NEXT_DIST_DIR ?? (phase === PHASE_DEVELOPMENT_SERVER ? ".next-dev" : ".next"),
    allowedDevOrigins: (process.env.MEDIA_DEV_ORIGINS ?? "").split(",").map((host) => host.trim()).filter(Boolean),
    images: {
      remotePatterns: [
        { protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/media/**" },
        { protocol: "https", hostname: "images.unsplash.com", pathname: "/photo-*" },
      ],
      formats: ["image/avif", "image/webp"],
      qualities: [70, 75],
      minimumCacheTTL: 60 * 60 * 24 * 30,
    },
  };
};

export default nextConfig;
