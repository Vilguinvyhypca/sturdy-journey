"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import Link from "next/link";

export function AuthControls({ showSignIn = false, showDashboardLink = true }: { showSignIn?: boolean; showDashboardLink?: boolean }) {
  const { data: session, status } = useSession();
  if (status === "loading") return null;
  if (!session) {
    if (!showSignIn) return null;

    return <button onClick={() => signIn()} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700">Admin sign in</button>;
  }

  return <div className="flex items-center gap-3">{showDashboardLink && <Link href="/admin" className="text-sm font-bold text-indigo-700 hover:underline">Admin dashboard</Link>}<button onClick={() => signOut()} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Sign out</button></div>;
}
