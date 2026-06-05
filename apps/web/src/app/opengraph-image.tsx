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
        // Deep near-black canvas with a teal→violet aurora lift in the
        // corner. Matches --color-bg + the ambient gradients in
        // globals.css so a visitor jumping from a social-preview crawl
        // to the live site sees the same identity.
        background:
          "radial-gradient(1100px 520px at 100% 0%, rgba(46,230,198,0.14), transparent 60%), radial-gradient(900px 500px at 0% 100%, rgba(139,123,255,0.10), transparent 60%), #060910",
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      {/* Isometric-cube glyph echoing the favicon + Header CubeMark.
          Single brand mark across all four surfaces. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "32px",
          marginBottom: "48px",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 32 32">
          <rect width="32" height="32" rx="6" fill="rgba(255,255,255,0.04)" />
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="5.5"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
          />
          {/* Isometric cube — same coords as Header CubeMark + favicon. */}
          <path d="M16 4.5 L26 10 L16 15.5 L6 10 Z" fill="#2ee6c6" />
          <path d="M6 10 L16 15.5 L16 27 L6 21.5 Z" fill="#0fb89c" />
          <path d="M26 10 L16 15.5 L16 27 L26 21.5 Z" fill="#118a78" />
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
          color: "#2ee6c6",
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
