"use client";

import { useState } from "react";
import { trackExperience } from "./ExperienceTracker";

export function ShareMediaButton({ mediaId, href }: { mediaId: string; href?: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = new URL(href ?? `/photos/${encodeURIComponent(mediaId)}`, window.location.origin);
    trackExperience("share_link", { mediaId });

    if (navigator.share) {
      try {
        await navigator.share({ title: "MediaSpace", url: url.toString() });
      } catch {
        // Closing the device share sheet is not an error the visitor needs to see.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(url.toString());
      setMessage("Link copied");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setMessage("Could not copy link");
    }
  }

  return <button onClick={share} className="rounded-lg px-3 py-2 text-indigo-700 hover:bg-indigo-50">{message || "Share"}</button>;
}
