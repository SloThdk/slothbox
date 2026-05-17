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
        // visionOS-style deep slate with a subtle diagonal lift toward
        // the navy variant. Matches --color-bg / --color-bg-elev in
        // globals.css so a visitor jumping from a social-preview crawl
        // to the live site sees the same palette.
        background: "linear-gradient(135deg, #0a0d14 0%, #0d1220 100%)",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Box-with-keyhole glyph echoing the favicon + Header Wordmark.
          Single brand mark across all three surfaces. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "32px",
          marginBottom: "48px",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="6" fill="#0a0d14" />
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="5.5"
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
          {/* Box outline + keyhole — same coords as Header Wordmark. */}
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
          <circle cx="16" cy="14.5" r="2" fill="#5b9eff" />
          <rect x="15" y="14.5" width="2" height="5" fill="#5b9eff" />
        </svg>
        <div
          style={{
            fontSize: "84px",
            fontWeight: 600,
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
          fontWeight: 400,
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
          color: "#5b9eff",
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
