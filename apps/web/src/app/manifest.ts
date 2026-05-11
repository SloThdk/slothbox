// Web App Manifest (v0.2.1, Tier-B feature #6).
//
// Next 15's app-router special file: returning a MetadataRoute.Manifest
// from this module emits `/manifest.webmanifest` with the right MIME
// and links it from the document head when the layout's metadata
// references `manifest: "/manifest.webmanifest"` (auto-handled in
// app/layout.tsx).
//
// The manifest gives modern browsers everything they need to:
//   - install the site as a Progressive Web App (Chrome / Edge / Safari
//     iOS 16.4+ / Firefox Android — the "Install" affordance in the
//     URL bar)
//   - launch in standalone mode without browser chrome
//   - render a system-level shortcut icon when launched
//
// What we deliberately don't ship here:
//   - `share_target` — would let the OS share-sheet send files to
//     SlothBox. Wiring requires a service worker that intercepts a
//     POST multipart/form-data and posts the files through to the
//     upload flow. Deferred to a follow-up commit because the
//     correct shape needs a Next.js route + an out-of-band handshake
//     to surface the shared file to the React tree, and getting that
//     wrong is a privacy regression (the OS share-sheet briefly
//     exposes filenames to the URL bar history if the route handler
//     reflects them).

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SlothBox",
    short_name: "SlothBox",
    description:
      "End-to-end encrypted file transfer with tamper-evident delivery receipts. The server cannot decrypt anything.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f12",
    theme_color: "#0a0f12",
    orientation: "any",
    // The site's icon.svg + Next-generated `icon` route already feed
    // the document head <link rel="icon">. Pointing the manifest at
    // those same paths means a single source of truth for branding —
    // no separate PWA icon set to keep in sync.
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        // Maskable variant for OSes that crop to a circle / squircle.
        // Re-using the same SVG works because it's already designed
        // with padding around the lockbox glyph.
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    // Categorise so OS search surfaces show the right context.
    categories: ["productivity", "utilities", "security"],
    // EU-jurisdiction signal in the lang tag — the marketing surface
    // is English but the operator is EU-incorporated, which matters
    // for some app-store catalogues.
    lang: "en",
    dir: "ltr",
  };
}
