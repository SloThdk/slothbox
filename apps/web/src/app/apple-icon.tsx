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
        background: "#0a0d14",
        // iOS rounds the corners itself — no border-radius needed here.
      }}
    >
      <svg width="180" height="180" viewBox="0 0 32 32">
        {/* Inner glass-edge stroke at the visionOS panel signature. */}
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
        {/* Box outline — same coords as Header Wordmark + favicon. */}
        <rect
          x="6"
          y="6"
          width="20"
          height="20"
          rx="3.5"
          stroke="#5b9eff"
          strokeWidth="2"
          fill="none"
        />
        {/* Keyhole — circle + descending notch, centred on the upper half. */}
        <circle cx="16" cy="14.5" r="2" fill="#5b9eff" />
        <rect x="15" y="14.5" width="2" height="5" fill="#5b9eff" />
      </svg>
    </div>,
    { ...size }
  );
}
