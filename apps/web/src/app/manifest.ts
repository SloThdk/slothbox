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
    background_color: "#0a0d14",
    theme_color: "#0a0d14",
    orientation: "any",
    // The site's `/icon` (32x32 PNG) and `/apple-icon` (180x180 PNG)
    // routes already feed the document head <link rel="icon"> and
    // <link rel="apple-touch-icon">. Pointing the manifest at those
    // same paths means a single source of truth for branding — no
    // separate PWA icon set to keep in sync. v0.2.7 swapped the
    // small favicon from a static /icon.svg to a dynamic /icon PNG so
    // the URL path itself rotates and Chromium's path-keyed favicon
    // cache picks up the v0.2.3 brand refresh on next navigation.
    icons: [
      {
        src: "/icon",
        sizes: "32x32",
        type: "image/png",
        purpose: "any",
      },
      {
        // Apple-icon doubles as the home-screen icon on Android
        // launchers that read the manifest's icon array. 180x180 is
        // large enough for most launcher crops; a dedicated 512x512
        // maskable PNG can land in a later release if installers
        // start asking for it.
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
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
