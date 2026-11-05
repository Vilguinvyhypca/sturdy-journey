/* eslint-disable @typescript-eslint/no-require-imports -- Isolated native decoder invoked by local-storage.ts. */
async function main() {
  let sharp;
  try { sharp = require("sharp"); }
  catch { throw Object.assign(new Error("Image validator unavailable"), { unavailable: true }); }
  const [source, contentType, pixelLimit] = process.argv.slice(2);
  const maximumPixels = Number(pixelLimit);
  if (!source || !Number.isSafeInteger(maximumPixels) || maximumPixels <= 0 || maximumPixels > 64_000_000) {
    throw Object.assign(new Error("Invalid validator configuration"), { unavailable: true });
  }
  sharp.cache(false);
  sharp.concurrency(1);
  const image = sharp(source, { failOn: "warning", limitInputPixels: maximumPixels, pages: 1, unlimited: false });
  const metadata = await image.metadata();
  const expected = {
    "image/jpeg": "jpeg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "image/avif": "heif", "image/heic": "heif", "image/heif": "heif",
  }[contentType];
  if (!expected || metadata.format !== expected
    || (contentType === "image/avif" && metadata.compression !== "av1")
    || (contentType === "image/heic" && metadata.compression !== "hevc")
    || (contentType === "image/heif" && !["hevc", "av1"].includes(metadata.compression))) {
    throw new Error("IMAGE_FORMAT_MISMATCH");
  }
  const width = metadata.width;
  const height = metadata.pageHeight ?? metadata.height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width * height > maximumPixels) {
    throw new Error("IMAGE_TOO_LARGE");
  }
  // Bundled libvips can inspect HEVC HEIF headers but may lack its decoder.
  // The caller always follows this with bounded FFmpeg conversion and JPEG validation.
  const requiresConversion = metadata.compression === "hevc";
  if (!requiresConversion) {
    await image.resize({ width: 1, height: 1, fit: "inside" }).raw().timeout({ seconds: 15 }).toBuffer();
  }
  process.stdout.write(JSON.stringify({ format: metadata.format, width, height, requiresConversion }));
}

main().catch((error) => {
  const unavailable = error.unavailable || ["ENOENT", "EACCES"].includes(error.code)
    || /support for this compression format has not been built|unable to allocate|out of memory|timed out|timeout|input file is missing/i.test(error.message);
  const tooLarge = /pixel limit|IMAGE_TOO_LARGE/i.test(error.message);
  process.stderr.write(unavailable ? "IMAGE_VALIDATOR_UNAVAILABLE" : tooLarge ? "IMAGE_TOO_LARGE" : "IMAGE_INVALID");
  process.exitCode = unavailable ? 69 : 2;
});
