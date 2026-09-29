"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { VisitorAnalytics } from "@/components/VisitorAnalytics";

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return <SessionProvider session={session}><VisitorAnalytics>{children}</VisitorAnalytics></SessionProvider>;
}
