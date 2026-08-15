"use client";

export function UploadButton({ onSelect }: { onSelect?: (file: File) => void }) {
  return <label className="cursor-pointer rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-indigo-700">
    Upload media
    <input className="hidden" type="file" accept="image/*,video/*" onChange={(event) => {
      const file = event.target.files?.[0];
      if (file) onSelect?.(file);
      event.target.value = "";
    }} />
  </label>;
}
