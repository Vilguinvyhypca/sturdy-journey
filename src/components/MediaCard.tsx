import type { MediaItem } from "@/lib/media";
import { VideoThumbnail } from "./VideoThumbnail";

export function MediaCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  return <button onClick={() => onSelect(item)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-200">
      {item.type === "video" ? <VideoThumbnail src={item.url} title="Uploaded video" /> : <img src={item.url} alt="Uploaded photo" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
      {item.type === "video" && <span className="absolute left-3 top-3 rounded-full bg-slate-950/75 px-2.5 py-1 text-xs font-bold text-white">▶ Video</span>}
    </div>
    <div className="p-2 sm:p-4"><p className="text-xs font-semibold capitalize text-slate-700 sm:text-sm">{item.type} <span className="hidden sm:inline">· {item.createdAt}</span></p></div>
  </button>;
}
