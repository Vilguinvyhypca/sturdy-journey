import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { rename, rm } from "node:fs/promises";

export async function generateThumbnail(source) {
  const destination = `${source}.jpg`;
  const temporary = `${destination}.${randomUUID()}.jpg`;
  try {
    await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", "0.5", "-i", source, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", "-y", temporary], { stdio: "ignore" });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with status ${code}`)));
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function generatePlayback(source) {
  const destination = `${source}.web.mp4`;
  const temporary = `${destination}.${randomUUID()}.tmp.mp4`;
  try {
    const { stdout } = await promisify(execFile)("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "default=nw=1:nk=1", source]);
    const videoCodec = stdout.trim();
    const codecArgs = videoCodec === "h264" ? ["-c:v", "copy", "-c:a", "copy"] : ["-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k"];
    await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", source, "-map", "0:v:0", "-map", "0:a?", ...codecArgs, "-movflags", "+faststart", "-y", temporary], { stdio: "ignore" });
      child.once("error", reject);
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg exited with status ${code}`)));
    });
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
  return `${source}.web.mp4`;
}
