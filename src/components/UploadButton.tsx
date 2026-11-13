"use client";

import { useState } from "react";

export function UploadButton({ onSelect, uploading = false }: { onSelect?: (files: File[]) => void; uploading?: boolean }) {
  const [folderMessage, setFolderMessage] = useState("");
  const buttonClass = `rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition ${uploading ? "cursor-wait opacity-60" : "cursor-pointer hover:bg-indigo-700"}`;
  const mimeByExtension: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif",
    webp: "image/webp", avif: "image/avif", heic: "image/heic", heif: "image/heif",
    mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  };
  const formatByMime: Record<string, string> = {
    "image/jpeg": "JPEG", "image/png": "PNG", "image/gif": "GIF", "image/webp": "WebP",
    "image/avif": "AVIF", "image/heic": "HEIC", "image/heif": "HEIF",
    "video/mp4": "MP4", "video/webm": "WebM", "video/quicktime": "MOV",
  };
  const photoMimeTypes = new Set(Object.values(mimeByExtension).filter((type) => type.startsWith("image/")));
  function prepareFile(file: File) {
    const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
    const inferredType = mimeByExtension[extension];
    const suppliedType = file.type.toLowerCase().split(";")[0];
    const suppliedTypeIsSupported = Object.values(mimeByExtension).includes(suppliedType);
    const type = suppliedTypeIsSupported ? suppliedType : inferredType ?? "";
    return {
      file: type && file.type !== type ? new File([file], file.name, { type, lastModified: file.lastModified }) : file,
      inferred: !suppliedTypeIsSupported && inferredType ? { extension, format: formatByMime[inferredType] } : null,
    };
  }
  function selectedFiles(input: HTMLInputElement, folder: boolean) {
    const files = Array.from(input.files ?? []);
    input.value = "";
    setFolderMessage("");
    if (files.length === 0) {
      if (!folder) return;
      setFolderMessage("No files were returned from that folder. Try Upload media and select multiple photos instead.");
      return;
    }
    const preparedFiles = files.map(prepareFile);
    const inferredFiles = preparedFiles.filter((entry) => entry.inferred);
    if (inferredFiles.length) {
      const fileList = inferredFiles.slice(0, 4)
        .map(({ file, inferred }) => `• ${file.name} → ${inferred!.format} from .${inferred!.extension}`)
        .join("\n");
      const remaining = inferredFiles.length > 4 ? `\n…and ${inferredFiles.length - 4} more` : "";
      const count = inferredFiles.length === 1 ? "one file" : `${inferredFiles.length} files`;
      const confirmed = window.confirm(
        `The browser could not identify ${count}'s type. Use the file extension to prepare ${count} for upload? The file data will remain unchanged, and the server will validate it.\n\n${fileList}${remaining}`,
      );
      if (!confirmed) {
        setFolderMessage("Upload canceled. No files were sent.");
        return;
      }
    }
    if (!folder) {
      onSelect?.(preparedFiles.map(({ file }) => file));
      return;
    }
    const photos = preparedFiles.map(({ file }) => file).filter((file) => photoMimeTypes.has(file.type));
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
