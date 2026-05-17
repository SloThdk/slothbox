// Apple touch icon — 180x180 PNG generated at request time by Next 15's
// ImageResponse runtime. iOS Safari uses this when a visitor adds the
// site to their home screen; Android Chrome falls back to the
// manifest's `purpose: "maskable"` SVG icon.
//
// We re-emit the same lockbox glyph as `icon.svg` so the brand reads
// as a single asset across favicon / PWA install / iOS home-screen.
// Single source of truth lives here + in `apps/web/src/app/icon.svg`;
// changing the palette means editing both.

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
        {/* Padlock shackle, open at top-right — encryption the receiver
            controls, not the platform. */}
        <path
          d="M11 14 V11 a5 5 0 0 1 10 0 v3"
          stroke="#5b9eff"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
        {/* Body + keyhole in sky-blue against the slate tile. */}
        <rect x="8.5" y="13.5" width="15" height="11" rx="1.6" fill="#5b9eff" />
        <circle cx="16" cy="18.5" r="1.6" fill="#0a0d14" />
        <rect x="15.25" y="18.5" width="1.5" height="3.2" fill="#0a0d14" />
      </svg>
    </div>,
    { ...size }
  );
}
