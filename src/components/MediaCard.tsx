import type { MediaItem } from "@/lib/media";
import { VideoThumbnail } from "./VideoThumbnail";

export function MediaCard({ item, onSelect }: { item: MediaItem; onSelect: (item: MediaItem) => void }) {
  return <button onClick={() => onSelect(item)} className="group aspect-square overflow-hidden bg-slate-200 text-left">
    <div className="relative h-full w-full overflow-hidden">
      {item.type === "video" ? <VideoThumbnail src={item.url} title="Uploaded video" /> : <img src={item.url} alt="Uploaded photo" loading="lazy" decoding="async" onError={(event) => {
        const image = event.currentTarget;
        if (image.dataset.retried) return;
        image.dataset.retried = "true";
        image.src = `${item.url}${item.url.includes("?") ? "&" : "?"}retry=${Date.now()}`;
      }} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />}
      {item.type === "video" && <span className="absolute right-2 top-2 rounded-full bg-slate-950/75 px-2 py-1 text-xs font-bold text-white">▶</span>}
    </div>
  </button>;
}
