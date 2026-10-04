"use client";

import { useState } from "react";

export function UploadButton({ onSelect, uploading = false }: { onSelect?: (files: File[]) => void; uploading?: boolean }) {
  const [folderMessage, setFolderMessage] = useState("");
  const buttonClass = `rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-indigo-700"}`;
  const photoMimeByExtension: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif" };
  function selectedFiles(input: HTMLInputElement, folder: boolean) {
    const files = Array.from(input.files ?? []);
    input.value = "";
    setFolderMessage("");
    if (!folder) { if (files.length > 0) onSelect?.(files); return; }
    if (files.length === 0) {
      setFolderMessage("No files were returned from that folder. Try Upload media and select multiple photos instead.");
      return;
    }
    const photos = files.flatMap((file) => {
      const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
      const inferredType = photoMimeByExtension[extension];
      const suppliedType = file.type.toLowerCase().split(";")[0];
      const type = Object.values(photoMimeByExtension).includes(suppliedType) ? suppliedType : inferredType;
      if (!type || !Object.values(photoMimeByExtension).includes(type)) return [];
      return [file.type === type ? file : new File([file], file.name, { type, lastModified: file.lastModified })];
    });
    const skipped = files.length - photos.length;
    setFolderMessage(photos.length ? `${photos.length} photos selected${skipped ? `; skipped ${skipped} unsupported files` : ""}.` : "No supported photos were found in that folder.");
    if (photos.length > 0) onSelect?.(photos);
  }
  return <div className="flex flex-wrap items-center gap-2">
    <label className={buttonClass}>
      {uploading ? "Uploading..." : "Upload media"}
      <input className="hidden" type="file" accept="image/*,video/*" multiple disabled={uploading} onChange={(event) => selectedFiles(event.currentTarget, false)} />
    </label>
    <label className={`${buttonClass} bg-white text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50`}>
      Upload photo folder
      <input ref={(element) => element?.setAttribute("webkitdirectory", "")} className="hidden" type="file" accept="image/jpeg,image/png,image/gif,image/webp,image/avif,image/heic,image/heif" multiple disabled={uploading} onChange={(event) => selectedFiles(event.currentTarget, true)} />
    </label>
    {folderMessage && <span role="status" aria-live="polite" className="basis-full text-xs font-medium text-slate-600">{folderMessage}</span>}
  </div>;
}
