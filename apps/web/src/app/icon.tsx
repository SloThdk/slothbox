// Favicon — 32x32 PNG generated at request time by Next 15's ImageResponse
// runtime. Serves at /icon (no extension) instead of the v0.2.6 static
// /icon.svg path.
//
// Why the path flips:
//   Chromium's favicon cache lives in a SQLite database (Favicons) in
//   the user profile, separate from the HTTP cache and the service
//   worker cache. It keys entries on host + path only and ignores
//   content-hash query strings on a stable path. The v0.2.6 SW cache
//   bump evicted the shell cache but couldn't touch the favicon DB —
//   browsers that had cached the v0.2.0 graphite + gold padlock kept
//   serving it locally even after the v0.2.3 blue box-with-keyhole
//   refresh landed on the server.
//
//   By moving the favicon from /icon.svg to /icon, the path itself
//   changes. Chromium has no record of /icon, fetches it fresh, and
//   stores the new blue glyph against the new key. The old /icon.svg
//   key keeps its stale yellow copy but is never consulted again.
//
// Same box-with-keyhole glyph as apple-icon.tsx, opengraph-image.tsx,
// and Header.tsx Wordmark. Single source of truth — when the brand mark
// changes, all four update in lockstep.
//
// Output is PNG rather than SVG because Next 15's ImageResponse only
// emits raster formats. A 32x32 PNG of an 8-shape glyph weighs ~1 KB —
// negligible overhead vs the SVG, with the meaningful upside that the
// URL path is now decoupled from the file extension and we can keep
// path-flipping in future cache-invalidation incidents without changing
// the source format.

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 32, height: 32 };
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
        background: "#0a0d14",
      }}
    >
      <svg width="32" height="32" viewBox="0 0 32 32">
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
