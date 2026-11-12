import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const alt = "Hymecymeyseh — a personal space for your photos and videos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const monofett = readFile(join(process.cwd(), "public/fonts/monofett.ttf"));

export default async function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "76px 88px",
          color: "#ffffff",
          background: "linear-gradient(135deg, #111827 0%, #25245a 58%, #4338ca 100%)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            right: -105,
            top: -130,
            width: 450,
            height: 450,
            borderRadius: 225,
            background: "linear-gradient(135deg, #af52de 0%, #007aff 50%, #00c7be 100%)",
            opacity: 0.24,
          }}
        />
        <div
          style={{
            position: "absolute",
            right: 100,
            bottom: -250,
            width: 480,
            height: 480,
            borderRadius: 240,
            background: "linear-gradient(135deg, #ff3b30 0%, #ff9500 50%, #ffcc00 100%)",
            opacity: 0.17,
          }}
        />
        <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
          <span style={{ fontFamily: "Monofett", fontSize: 112, lineHeight: 1 }}>
            hymecymeyseh
          </span>
        </div>
        <div
          style={{
            width: 230,
            height: 8,
            borderRadius: 4,
            marginBottom: 28,
            background: "linear-gradient(90deg, #ff3b30, #ff9500, #ffcc00, #34c759, #00c7be, #007aff, #af52de, #ff2d55)",
          }}
        />
        <div style={{ fontSize: 38, fontWeight: 600, letterSpacing: -0.5 }}>
          A personal space for your photos and videos
        </div>
        <div style={{ display: "flex", marginTop: 44, fontSize: 18, letterSpacing: 4, color: "#c7d2fe" }}>
          PHOTOS&nbsp;&nbsp;·&nbsp;&nbsp;VIDEOS&nbsp;&nbsp;·&nbsp;&nbsp;YOUR SPACE
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Monofett",
          data: await monofett,
          style: "normal",
          weight: 400,
        },
      ],
    },
  );
}
