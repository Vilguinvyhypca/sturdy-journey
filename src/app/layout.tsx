import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { getSiteTheme } from "@/lib/database";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "MediaSpace",
  description: "Your personal media library",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const theme = await getSiteTheme().catch(() => "indigo");

  return (
    <html lang="en" className="h-full antialiased" data-theme={theme}>
      <body className="min-h-full flex flex-col"><Providers>{children}</Providers></body>
    </html>
  );
}
