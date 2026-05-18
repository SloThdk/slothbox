// Favicon — 192x192 PNG generated at request time by Next 15's
// ImageResponse runtime. Serves at /icon (no extension).
//
// Design intent:
//   The glyph renders on a transparent canvas so the browser tab
//   strip, bookmark bar, and history surfaces show through. The
//   v0.2.7 release wrapped this glyph in a #0a0d14 rounded tile
//   (the visionOS glass-panel signature the rest of the brand uses)
//   but at favicon scale the tile reads as a "container around the
//   icon" rather than the icon itself — especially against light
//   browser chrome where the dark square pops out as a literal
//   black box behind the brand mark. Dropping the tile lets the
//   box-with-keyhole stand alone the way the in-product Header
//   Wordmark does inside its `.glass` container.
//
//   apple-icon.tsx and opengraph-image.tsx keep their dark tile.
//   iOS clips home-screen icons to a squircle and fills any
//   transparent pixels with white, so apple-icon MUST have a solid
//   background. OG cards are full design surfaces that need the
//   brand background as part of the composition.
//
// Why path stays /icon (not /icon.svg):
//   Chromium's favicon SQLite DB keys on host + path. The v0.2.7
//   path-flip from /icon.svg to /icon was the cache-invalidation
//   mechanism — keeping the path stable now means subsequent design
//   tweaks (this one included) ride the same `?<hash>` query string
//   Next.js auto-appends, which Chromium DOES honour for entries
//   it's already seen on a given path.
//
// Why 192x192:
//   The v0.2.7 release rendered at 32x32 to match the historical
//   favicon viewport. Modern browsers downsample from a larger
//   source for retina + 2x DPI tabs, and the manifest icon array
//   wants ≥ 192 for PWA installers. Generating once at 192 covers
//   browser tabs, bookmarks, history surfaces, and the PWA
//   home-screen surface from a single source.
//
// Same box-with-keyhole glyph as apple-icon.tsx, opengraph-image.tsx,
// and Header.tsx Wordmark. Single source of truth — coords are
// identical (x=6 y=6 w=20 h=20 in a 0 0 32 32 viewBox) so the brand
// mark reads consistent across all four surfaces.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 192, height: 192 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="192" height="192" viewBox="0 0 32 32">
        {/* Box outline — same coords as Header Wordmark + apple-icon + OG. */}
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
        {/* Keyhole — circle + descending notch. */}
        <circle cx="16" cy="14.5" r="2" fill="#5b9eff" />
        <rect x="15" y="14.5" width="2" height="5" fill="#5b9eff" />
      </svg>
    </div>,
    { ...size }
  );
}
