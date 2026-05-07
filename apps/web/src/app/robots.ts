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
        allow: ["/", "/about", "/security"],
        disallow: ["/s/", "/api/"],
      },
    ],
    sitemap: `${PUBLIC_URL}/sitemap.xml`,
    host: PUBLIC_URL,
  };
}
