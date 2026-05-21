// Sitemap generator. Lists every public marketing page so search engines
// can discover them. Receiver pages (/s/[id]) are deliberately excluded —
// their content is encrypted and ephemeral, indexing makes no sense.

import type { MetadataRoute } from "next";
import { PUBLIC_URL } from "@/lib/config";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: PUBLIC_URL,
      lastModified,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${PUBLIC_URL}/about`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${PUBLIC_URL}/security`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${PUBLIC_URL}/how`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.85,
    },
    {
      url: `${PUBLIC_URL}/transparency`,
      lastModified,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${PUBLIC_URL}/abuse`,
      lastModified,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
