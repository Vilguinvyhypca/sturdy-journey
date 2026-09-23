import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import "./globals.css";
import { Providers } from "./providers";
import { getSiteTheme } from "@/lib/database";
import { getSiteUrl } from "@/lib/site-url";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "MediaSpace",
  description: "Your personal media library",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [theme, session] = await Promise.all([
    getSiteTheme().catch(() => "indigo"),
    getServerSession(authOptions),
  ]);

  return (
    <html lang="en" className="h-full antialiased" data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Monofett&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col"><Providers session={session}>{children}</Providers></body>
    </html>
  );
}
