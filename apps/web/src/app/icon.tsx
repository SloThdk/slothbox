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
// and Header.tsx Wordmark. Single source of truth — the three cube-face
// paths + the keyhole are identical (0 0 32 32 viewBox) so the brand
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
        {/* Isometric cube — same coords + canonical BLUE palette as Header
            CubeMark + apple-icon + OG. Top lit, left mid, right in shadow,
            with a near-white keyhole on the front: the box is locked. */}
        <path d="M16 3.5 L27 10 L16 16.5 L5 10 Z" fill="#5b9dff" />
        <path d="M5 10 L16 16.5 L16 29 L5 22.5 Z" fill="#3b82f6" />
        <path d="M27 10 L16 16.5 L16 29 L27 22.5 Z" fill="#1e4fc4" />
        {/* Keyhole — round bow over a tapered blade, near-white. */}
        <circle cx="16" cy="20" r="2.4" fill="#eaf2ff" />
        <path d="M15.05 20.4 L16.95 20.4 L17.5 25.2 L14.5 25.2 Z" fill="#eaf2ff" />
      </svg>
    </div>,
    { ...size }
  );
}
