import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import "./globals.css";
import { Providers } from "./providers";
import { getSiteTheme } from "@/lib/database";
import { getSiteUrl } from "@/lib/site-url";
import { OfflineSupport } from "@/components/OfflineSupport";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: "Hymecymeyseh",
  description: "A personal space for your photos and videos.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Hymecymeyseh",
    title: "Hymecymeyseh",
    description: "A personal space for your photos and videos.",
    images: [
      {
        url: "/hymecymeyseh-social-card.jpg",
        width: 832,
        height: 1232,
        alt: "Hymecymeyseh social preview image",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hymecymeyseh",
    description: "A personal space for your photos and videos.",
    images: ["/hymecymeyseh-social-card.jpg"],
  },
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
      <body className="min-h-full flex flex-col"><OfflineSupport /><Providers session={session}>{children}</Providers></body>
    </html>
  );
}
