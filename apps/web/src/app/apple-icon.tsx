// Apple touch icon — 180x180 PNG generated at request time by Next 15's
// ImageResponse runtime. iOS Safari uses this when a visitor adds the
// site to their home screen; Android Chrome falls back to the
// manifest's `purpose: "maskable"` SVG icon.
//
// Same box-with-keyhole glyph as icon.svg and Header.tsx Wordmark.
// Single source of truth — when the brand mark changes, all three
// update in lockstep.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#060910",
        // iOS rounds the corners itself — no border-radius needed here.
      }}
    >
      <svg width="180" height="180" viewBox="0 0 32 32">
        {/* Inner glass-edge stroke at the panel signature. */}
        <rect
          x="0.5"
          y="0.5"
          width="31"
          height="31"
          rx="5.5"
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth="1"
        />
        {/* Isometric cube — same coords as Header CubeMark + favicon + OG. */}
        <path d="M16 3.5 L27 10 L16 16.5 L5 10 Z" fill="#2ee6c6" />
        <path d="M5 10 L16 16.5 L16 29 L5 22.5 Z" fill="#0fb89c" />
        <path d="M27 10 L16 16.5 L16 29 L27 22.5 Z" fill="#118a78" />
      </svg>
    </div>,
    { ...size }
  );
}
