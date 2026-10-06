"use client";

import { useState } from "react";
import { trackExperience } from "./ExperienceTracker";

export function ShareMediaButton({ mediaId, href, title = "Hymecymeyseh" }: { mediaId: string; href?: string; title?: string }) {
  const [message, setMessage] = useState("");
  const [manualUrl, setManualUrl] = useState("");

  async function share() {
    const url = new URL(href ?? `/photos/${encodeURIComponent(mediaId)}`, window.location.origin);
    setManualUrl("");
    setMessage("");
    trackExperience("share_link", { mediaId });

    if (navigator.share) {
      try {
        await navigator.share({ title, url: url.toString() });
        return;
      } catch (error) {
        // A dismissed share sheet should not trigger another sharing action.
        if (error instanceof Error && error.name === "AbortError") return;
      }
    }

    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url.toString());
      setMessage("Link copied");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setManualUrl(url.toString());
    }
  }

  return <span className="inline-flex max-w-full flex-col items-start" onClick={(event) => event.stopPropagation()}>
    <button type="button" onClick={share} className="rounded-lg px-3 py-2 text-indigo-700 hover:bg-indigo-50" aria-live="polite">{message || "Share"}</button>
    {manualUrl && <span className="mt-2 block w-full max-w-sm rounded-xl border border-slate-300 bg-white p-3 text-left text-sm text-slate-900">
      <span role="status" className="block">Touch and hold the link to copy or share it.</span>
      <a href={manualUrl} className="mt-2 block break-all font-semibold text-indigo-700 underline">{manualUrl}</a>
      <input aria-label="Link to share" readOnly value={manualUrl} onFocus={(event) => event.currentTarget.select()} className="mt-3 block w-full rounded border border-slate-300 p-2 text-base text-slate-900" />
      <button type="button" onClick={() => setManualUrl("")} className="mt-2 rounded px-2 py-1 font-semibold text-indigo-700">Close</button>
    </span>}
  </span>;
}
