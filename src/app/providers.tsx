"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { ExperienceTracker } from "@/components/ExperienceTracker";

export function Providers({ children, session }: { children: React.ReactNode; session: Session | null }) {
  return <SessionProvider session={session}><ExperienceTracker />{children}</SessionProvider>;
}
