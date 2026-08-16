import type { MediaItem } from "@/lib/media";
import { AlbumPicker } from "./AlbumPicker";
import { MediaDetails } from "./MediaDetails";
import { ShareMediaButton } from "./ShareMediaButton";

export function PhotoViewer({ item, onClose, onDelete, onOrganize }: { item: MediaItem; onClose: () => void; onDelete?: () => void; onOrganize?: (albumIds: string[], albumName: string) => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-5" onClick={onClose}>
    <div className="max-h-full max-w-4xl overflow-visible rounded-2xl bg-white" onClick={(event) => event.stopPropagation()}>
      <img src={item.url} alt="Uploaded photo" className="max-h-[75vh] w-full rounded-t-2xl bg-black object-contain" />
      <MediaDetails item={item} />
      <div className="flex items-center justify-end gap-2 p-4"><ShareMediaButton mediaId={item.id} />{onOrganize && <AlbumPicker item={item} onSaved={onOrganize} />}{onDelete && <button onClick={onDelete} className="rounded-lg px-3 py-2 text-rose-600 hover:bg-rose-50">Delete</button>}<button onClick={onClose} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Close</button></div>
    </div>
  </div>;
}
