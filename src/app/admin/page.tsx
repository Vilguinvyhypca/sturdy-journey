import type { Metadata } from "next";
import Link from "next/link";
import { AuthControls } from "@/components/AuthControls";

export const metadata: Metadata = {
  title: "Administrator sign in | MediaSpace",
  description: "Administrator access for MediaSpace.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-indigo-600">MediaSpace</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Administrator access</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Sign in to upload media, organize albums, and manage this library.
        </p>
        <div className="mt-8 flex justify-center">
          <AuthControls showSignIn />
        </div>
        <Link className="mt-7 inline-block text-sm font-bold text-slate-600 hover:text-slate-950" href="/">
          Back to MediaSpace
        </Link>
      </section>
    </main>
  );
}
