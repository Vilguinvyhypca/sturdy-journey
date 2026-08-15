import type { MediaItem } from "@/lib/media";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function MediaDetails({ item }: { item: MediaItem }) {
  const details = [
    item.capturedAt ? `Taken ${new Date(item.capturedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : null,
    item.durationSeconds !== null && item.durationSeconds !== undefined ? formatDuration(item.durationSeconds) : null,
    item.fileSizeBytes ? formatBytes(item.fileSizeBytes) : null,
  ].filter(Boolean);
  if (details.length === 0) return null;
  return <p className="px-4 pt-4 text-sm text-slate-500">{details.join(" · ")}</p>;
}
