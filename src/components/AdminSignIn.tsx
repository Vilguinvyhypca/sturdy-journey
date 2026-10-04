"use client";

import { FormEvent, useEffect, useState } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

function SessionLoading() {
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(timer);
  }, []);

  return <div>
    <p role={timedOut ? "alert" : "status"} className="text-sm font-medium text-slate-600">
      {timedOut ? "We couldn’t finish checking your sign-in. Reload the page to try again." : "Checking administrator session…"}
    </p>
    {timedOut && <button type="button" onClick={() => window.location.reload()} className="mt-4 rounded-xl border border-slate-300 px-4 py-2 font-bold text-slate-700">Try again</button>}
  </div>;
}

export function AdminSignIn() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await signIn("credentials", {
        password,
        redirect: false,
        callbackUrl: "/admin",
      });
      if (!result?.ok) {
        setError(result?.error === "CredentialsSignin"
          ? "That administrator password is incorrect."
          : "We couldn’t sign you in. Please try again.");
        return;
      }
      router.push("/admin");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (status === "loading") {
    return <SessionLoading />;
  }

  if (session) {
    return <div>
      <p className="text-sm font-semibold text-emerald-700">You are signed in as the administrator.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => router.push("/admin")} className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white hover:bg-indigo-700">Open dashboard</button>
        <button type="button" onClick={() => signOut({ callbackUrl: "/" })} className="rounded-xl border border-slate-300 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50">Sign out</button>
      </div>
    </div>;
  }

  return <form onSubmit={submit} className="text-left">
    <noscript><p className="mb-4 text-sm text-rose-700">Enable JavaScript to sign in to MediaSpace.</p></noscript>
    <input type="text" name="username" value="Administrator" readOnly autoComplete="username" className="sr-only" tabIndex={-1} aria-hidden="true" />
    <label htmlFor="admin-password" className="block text-sm font-bold text-slate-800">Administrator password</label>
    <input id="admin-password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required autoFocus className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 text-slate-950 outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
    {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}
    <button type="submit" disabled={submitting || !password} className="mt-5 w-full rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white shadow-sm hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">{submitting ? "Signing in…" : "Sign in"}</button>
  </form>;
}
