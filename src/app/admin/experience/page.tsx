import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions, isAdmin } from "@/lib/auth";
import { readExperienceSummary } from "@/lib/experience";
import { ExperienceLinkBuilder } from "@/components/ExperienceLinkBuilder";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Visitor experience | MediaSpace", robots: { index: false, follow: false } };

function CountList({ title, items }: { title: string; items: { label: string; count: number }[] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold text-slate-950">{title}</h2>{items.length ? <ol className="mt-4 space-y-3">{items.map((item) => <li key={item.label} className="flex justify-between gap-3 text-sm"><span className="min-w-0 break-all text-slate-700">{item.label}</span><strong className="shrink-0 text-slate-950">{item.count.toLocaleString()}</strong></li>)}</ol> : <p className="mt-3 text-sm text-slate-500">No recorded activity in this period.</p>}</section>;
}

export default async function ExperiencePage() {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session?.user as { isAdmin?: boolean } | undefined)) {
    return <main className="mx-auto max-w-3xl px-5 py-10"><h1 className="text-2xl font-black">Administrator access required</h1><Link className="mt-4 inline-block font-bold text-indigo-700" href="/admin">Go to sign in</Link></main>;
  }
  const report = await readExperienceSummary(30);
  return <main className="mx-auto min-h-screen max-w-6xl px-5 py-8 sm:px-8">
    <Link href="/admin" className="font-bold text-indigo-700">← Admin dashboard</Link>
    <header className="my-6"><p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-600">MediaSpace</p><h1 className="mt-2 text-3xl font-black text-slate-950">Visitor experience</h1><p className="mt-2 text-sm text-slate-600">Session-level activity from the last 30 days. Session replay is off; search text, IP addresses, and full referrer URLs are not stored.</p></header>
    <section aria-label="Visitor activity totals" className="grid grid-cols-2 gap-3 sm:grid-cols-5">{[
      { label: "Page views", value: report.pageViews }, { label: "Browser sessions", value: report.sessions },
      { label: "Playback and browser errors", value: report.errors }, { label: "Avg. page load", value: report.averageLoadMs === null ? "—" : `${(report.averageLoadMs / 1000).toFixed(1)}s` },
      { label: "Avg. time per page", value: report.averageDurationMs === null ? "—" : `${(report.averageDurationMs / 1000).toFixed(1)}s` },
    ].map((item) => <article key={item.label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm font-semibold text-slate-500">{item.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</p></article>)}</section>
    <div className="my-6 grid gap-4 md:grid-cols-2"><CountList title="Most visited pages" items={report.popularPages} /><CountList title="How visitors arrived" items={report.sources} /><CountList title="Where visits stop" items={report.behavior} /><CountList title="Common visitor journeys" items={report.commonJourneys} /><CountList title="Actions visitors took" items={report.actions} /><CountList title="External sites visitors clicked" items={report.externalLinks} /><section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-bold text-slate-950">Daily activity</h2><ol className="mt-4 max-h-80 space-y-2 overflow-y-auto">{report.daily.map((day) => <li key={day.date} className="flex justify-between gap-3 text-sm"><span className="text-slate-600">{day.date}</span><span className="font-semibold text-slate-900">{day.pageViews} views · {day.sessions} sessions · {day.errors} errors</span></li>)}</ol></section><ExperienceLinkBuilder /></div>
  </main>;
}
