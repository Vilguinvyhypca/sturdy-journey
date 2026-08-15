"use client";

export function UploadButton({ onSelect, uploading = false }: { onSelect?: (files: File[]) => void; uploading?: boolean }) {
  return <label className={`rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-indigo-700"}`}>
    {uploading ? "Uploading..." : "Upload media"}
    <input className="hidden" type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={(event) => {
      const files = Array.from(event.target.files ?? []);
      if (files.length > 0) onSelect?.(files);
      event.target.value = "";
    }} />
  </label>;
}
