import * as exifr from "exifr";

export type UploadDetails = {
  capturedAt: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number;
};

function readVideoDuration(file: File) {
  return new Promise<number | null>((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const finish = (duration: number | null) => {
      URL.revokeObjectURL(url);
      video.remove();
      resolve(duration);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => finish(Number.isFinite(video.duration) ? Math.round(video.duration) : null);
    video.onerror = () => finish(null);
    video.src = url;
  });
}

export async function readUploadDetails(file: File): Promise<UploadDetails> {
  let capturedAt: string | null = null;
  let durationSeconds: number | null = null;
  if (file.type.startsWith("image/")) {
    try {
      const metadata = await exifr.parse(file, ["DateTimeOriginal", "CreateDate", "ModifyDate"]);
      const date = metadata?.DateTimeOriginal ?? metadata?.CreateDate ?? metadata?.ModifyDate;
      if (date instanceof Date && !Number.isNaN(date.getTime())) capturedAt = date.toISOString();
    } catch {
      // Some image formats do not contain readable EXIF metadata.
    }
  }
  if (file.type.startsWith("video/")) durationSeconds = await readVideoDuration(file);
  return { capturedAt, durationSeconds, fileSizeBytes: file.size };
}
