import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
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
