// robots.txt generator. Next 15 file-convention: this module's default
// export becomes /robots.txt at request time.
//
// We index public marketing routes but disallow crawlers from share
// receiver pages — those URLs encode upload secrets in the fragment, but
// the path itself (`/s/<short-id>`) shouldn't show up in search results
// either way.

import type { MetadataRoute } from "next";
import { PUBLIC_URL } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/about", "/security", "/how", "/transparency"],
        // Crawlers stay away from anything that carries upload state or
        // hits the ingest path. The fragment in `/s/<id>#key=...` is
        // never sent by browsers (RFC 3986 §3.5), so even an indexed
        // path would not leak the decryption key — but search-engine
        // visibility of share URLs is still the wrong default. `/chunk/`
        // is the ingest service surface (PUT/GET/DELETE chunks); no
        // reason for any crawler to walk it.
        disallow: ["/s/", "/api/", "/chunk/", "/my-shares"],
      },
    ],
    sitemap: `${PUBLIC_URL}/sitemap.xml`,
    host: PUBLIC_URL,
  };
}
