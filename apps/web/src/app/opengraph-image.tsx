// Dynamic Open Graph image — generated at request time by Next 15's
// ImageResponse runtime. Used by Twitter/X, LinkedIn, Slack, Discord etc.
// when someone pastes a slothbox.philipsloth.com link.
//
// 1200x630 is the de facto standard. Smaller renders fine; larger gets
// downscaled by social platforms.

import { ImageResponse } from "next/og";
import { APP_NAME, APP_TAGLINE } from "@/lib/config";

// Force the route to render at the edge so the image is generated near
// the user, not on the origin in Falkenstein.
export const runtime = "edge";

// Cache the response for 24 hours. The image only changes when we redeploy.
export const revalidate = 86400;

// Tell social crawlers what to expect.
export const alt = `${APP_NAME} — encrypted file transfer`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "80px",
        background: "linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Padlock glyph echoing the favicon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "32px",
          marginBottom: "48px",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="6" fill="#c9a86a" />
          <path
            d="M11 14 V11 a5 5 0 0 1 10 0 v3"
            stroke="#0a0a0a"
            strokeWidth="2.4"
            fill="none"
            strokeLinecap="round"
          />
          <rect x="8.5" y="13.5" width="15" height="11" rx="1.6" fill="#0a0a0a" />
          <circle cx="16" cy="18.5" r="1.6" fill="#c9a86a" />
          <rect x="15.25" y="18.5" width="1.5" height="3.2" fill="#c9a86a" />
        </svg>
        <div
          style={{
            fontSize: "84px",
            fontWeight: 700,
            color: "#fafafa",
            letterSpacing: "-0.02em",
          }}
        >
          {APP_NAME}
        </div>
      </div>

      <div
        style={{
          fontSize: "44px",
          fontWeight: 500,
          color: "#fafafa",
          maxWidth: "1000px",
          lineHeight: 1.2,
          letterSpacing: "-0.01em",
        }}
      >
        {APP_TAGLINE}
      </div>

      <div
        style={{
          display: "flex",
          gap: "40px",
          marginTop: "64px",
          fontSize: "24px",
          color: "#c9a86a",
          fontFamily: "JetBrains Mono, ui-monospace, monospace",
        }}
      >
        <div>XChaCha20-Poly1305</div>
        <div>·</div>
        <div>EU hosted</div>
        <div>·</div>
        <div>Open source</div>
      </div>
    </div>,
    { ...size }
  );
}
