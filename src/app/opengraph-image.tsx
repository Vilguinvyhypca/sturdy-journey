import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Hymecymeyseh social preview image";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const sourceImage = await readFile(join(process.cwd(), "public/hymecymeyseh-social-card.jpg"));
const sourceImageData = `data:image/jpeg;base64,${sourceImage.toString("base64")}`;

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f4f2f0",
        }}
      >
        <div
          style={{
            width: 425,
            height: 630,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={sourceImageData}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>
      </div>
    ),
    size,
  );
}
