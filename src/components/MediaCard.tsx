import type { MediaItem } from "@/lib/media";

export function MediaCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  return <button onClick={() => onSelect(item)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-200">
      {item.type === "video" ? <video src={item.url} muted preload="metadata" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <img src={item.url} alt={item.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
      {item.type === "video" && <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-xs font-bold text-white">▶ Video</span>}
    </div>
    <div className="p-4"><p className="font-semibold">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.album} · {item.createdAt}</p></div>
  </button>;
}
