"use client";

import { FormEvent, useState } from "react";

export function ExperienceLinkBuilder() {
  const [destination, setDestination] = useState("/");
  const [source, setSource] = useState("");
  const [medium, setMedium] = useState("social");
  const [campaign, setCampaign] = useState("");
  const [generated, setGenerated] = useState("");
  const [message, setMessage] = useState("");

  function generate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const current = new URL(window.location.origin);
      const target = new URL(destination.trim() || "/", current);
      if (target.origin !== current.origin || target.pathname.startsWith("/admin") || target.pathname.startsWith("/api/")) {
        throw new Error("Choose a public MediaSpace page on this site.");
      }
      if (!source.trim()) throw new Error("Enter where you will share this link.");
      target.searchParams.set("utm_source", source.trim().slice(0, 80));
      target.searchParams.set("utm_medium", (medium.trim() || "social").slice(0, 80));
      if (campaign.trim()) target.searchParams.set("utm_campaign", campaign.trim().slice(0, 80));
      setGenerated(target.toString());
    } catch (error) {
      setGenerated("");
      setMessage(error instanceof Error ? error.message : "Could not create the tracked link.");
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(generated);
      setMessage("Tracked link copied.");
    } catch {
      setMessage("Copy was blocked by the browser. Select and copy the link below.");
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900";
  return <section className="rounded-2xl border border-slate-200 bg-white p-5">
    <h2 className="text-lg font-bold text-slate-950">Create a tracked link</h2>
    <p className="mt-1 text-sm text-slate-600">Use a different source or campaign for each place you share a link to see which ones bring visitors.</p>
    <form onSubmit={generate} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Public page path<input value={destination} onChange={(event) => setDestination(event.target.value)} placeholder="/p/sabaideesana" className={field} /></label>
      <label className="text-sm font-semibold text-slate-700">Shared on<input required value={source} onChange={(event) => setSource(event.target.value)} placeholder="instagram" className={field} /></label>
      <label className="text-sm font-semibold text-slate-700">Link type<input value={medium} onChange={(event) => setMedium(event.target.value)} placeholder="social" className={field} /></label>
      <label className="text-sm font-semibold text-slate-700 sm:col-span-2">Campaign (optional)<input value={campaign} onChange={(event) => setCampaign(event.target.value)} placeholder="new-profile-launch" className={field} /></label>
      <button className="w-fit rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white sm:col-span-2">Create tracked link</button>
    </form>
    {generated && <div className="mt-4 rounded-xl bg-slate-50 p-3"><p className="break-all text-sm text-slate-700">{generated}</p><button type="button" onClick={copy} className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700">Copy link</button></div>}
    {message && <p role="status" className="mt-3 text-sm font-semibold text-slate-700">{message}</p>}
  </section>;
}
