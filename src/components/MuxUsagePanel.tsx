"use client";

import { useEffect, useState } from "react";
import type { MuxUsageSummary } from "@/lib/mux";

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

export function MuxUsagePanel({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<MuxUsageSummary | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/mux-usage", { signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { usage?: MuxUsageSummary; error?: string };
        if (!response.ok || !data.usage) throw new Error(data.error ?? "Mux usage could not be loaded.");
        setError("");
        setUsage(data.usage);
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Mux usage could not be loaded.");
      });
    return () => controller.abort();
  }, [refreshKey]);

  if (error) return <section className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><p className="font-bold">Mux usage unavailable</p><p className="mt-1">{error}</p></section>;
  if (!usage) return <section className="mt-5 animate-pulse rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500">Loading Mux storage usage…</section>;

  const percent = Math.min(100, Math.round((usage.assetCount / usage.capacity) * 100));
  const atLimit = usage.assetCount >= usage.capacity;
  const nearLimit = !atLimit && usage.assetCount / usage.capacity >= 0.7;
  const accent = atLimit ? "bg-rose-600" : nearLimit ? "bg-amber-500" : "bg-emerald-500";

  return <section className={`mt-5 rounded-2xl border p-5 ${atLimit ? "border-rose-200 bg-rose-50" : nearLimit ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"}`} aria-labelledby="mux-usage-heading">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[.18em] text-indigo-600">Storage &amp; usage</p><h2 id="mux-usage-heading" className="mt-1 text-xl font-black text-slate-950">Mux video capacity</h2></div>
      <p className="text-2xl font-black text-slate-950">{usage.assetCount} <span className="text-base font-semibold text-slate-500">/ {usage.capacity}</span></p>
    </div>
    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-label="Mux video capacity used" aria-valuemin={0} aria-valuemax={usage.capacity} aria-valuenow={usage.assetCount}><div className={`h-full rounded-full ${accent}`} style={{ width: `${percent}%` }} /></div>
    <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
      <div><p className="text-slate-500">Remaining</p><p className="font-black text-slate-900">{usage.remaining}</p></div>
      <div><p className="text-slate-500">Stored duration</p><p className="font-black text-slate-900">{formatDuration(usage.storedDurationSeconds)}</p></div>
      <div><p className="text-slate-500">Ready / processing</p><p className="font-black text-slate-900">{usage.readyCount} / {usage.preparingCount}</p></div>
      <div><p className="text-slate-500">Signed / public IDs</p><p className="font-black text-slate-900">{usage.signedPlaybackCount} / {usage.publicPlaybackCount}</p></div>
    </div>
    {usage.erroredCount > 0 && <p className="mt-3 text-sm font-bold text-rose-700">{usage.erroredCount} errored Mux {usage.erroredCount === 1 ? "asset is" : "assets are"} still using capacity.</p>}
    {atLimit ? <p className="mt-3 text-sm font-bold text-rose-700">Video uploads are blocked at the configured limit. Delete an unused Mux video before uploading another.</p> : nearLimit ? <p className="mt-3 text-sm font-bold text-amber-800">Capacity is getting low. Review unused videos before uploading more.</p> : <p className="mt-3 text-sm text-slate-600">MediaSpace checks Mux directly before every video upload.</p>}
  </section>;
}