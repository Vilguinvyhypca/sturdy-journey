"use client";

import { useEffect, useState } from "react";
import { siteThemes, type SiteTheme } from "@/lib/theme";

const themeLabels: Record<SiteTheme, string> = {
  indigo: "Indigo",
  forest: "Forest",
  sunset: "Sunset",
  midnight: "Midnight",
};

export function ThemeSettings() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<SiteTheme>("indigo");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((response) => response.json())
      .then((data: { theme?: SiteTheme }) => {
        if (data.theme) setTheme(data.theme);
      })
      .catch(() => undefined);
  }, []);

  async function chooseTheme(nextTheme: SiteTheme) {
    const previousTheme = theme;
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: nextTheme }) });
    const data = await response.json() as { error?: string };
    setSaving(false);
    if (!response.ok) {
      setTheme(previousTheme);
      document.documentElement.setAttribute("data-theme", previousTheme);
      setMessage(data.error ?? "Could not save the theme.");
    }
    else setMessage("Theme saved.");
  }

  return <div className="relative">
    <button onClick={() => setOpen((current) => !current)} className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">Theme</button>
    {open && <div className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-12 sm:right-0 sm:w-80">
      <p className="font-black text-slate-900">App theme</p>
      <p className="mt-1 text-sm text-slate-500">Only administrators can change this. It is saved for this app.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">{siteThemes.map((choice) => <button key={choice} onClick={() => chooseTheme(choice)} disabled={saving} className={`rounded-xl border p-3 text-left text-sm font-bold ${theme === choice ? "border-[var(--accent)] ring-2 ring-[var(--accent-soft)]" : "border-slate-200 hover:bg-slate-50"}`}><span className={`mb-2 block h-8 rounded-lg theme-swatch theme-swatch-${choice}`} />{themeLabels[choice]}</button>)}</div>
      {message && <p className={`mt-4 text-sm font-medium ${message === "Theme saved." ? "text-emerald-700" : "text-rose-700"}`}>{message}</p>}
      <button onClick={() => setOpen(false)} className="mt-4 w-full rounded-xl px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100">Done</button>
    </div>}
  </div>;
}
