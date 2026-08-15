import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

const uploadDirectory = join(process.cwd(), "public", "uploads");

export async function uploadMedia(file: File) {
  await mkdir(uploadDirectory, { recursive: true });
  const extension = extname(file.name).toLowerCase().replace(/[^.a-z0-9]/g, "") || ".bin";
  const fileName = `${randomUUID()}${extension}`;
  await writeFile(join(uploadDirectory, fileName), Buffer.from(await file.arrayBuffer()));
  return `/uploads/${fileName}`;
}
