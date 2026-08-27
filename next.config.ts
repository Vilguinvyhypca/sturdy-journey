import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.1.129", "100.124.104.100"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "*.public.blob.vercel-storage.com", pathname: "/media/**" }],
    formats: ["image/avif", "image/webp"],
    qualities: [70, 75],
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },
};

export default nextConfig;
