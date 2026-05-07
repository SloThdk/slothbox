// /about — server-component shell that exports static SEO metadata,
// then renders the bilingual <AboutContent /> client component.
//
// Why the split: Next.js 15 disallows `export const metadata` from a
// "use client" file. Since /about's body needs useLanguage() to swap
// EN ⇄ DA, we keep this file as a server component (so metadata works)
// and move the JSX into a sibling client component.

import type { Metadata } from "next";
import { AboutContent } from "./about-content";

export const metadata: Metadata = {
  title: "About",
  description:
    "What SlothBox is, who built it, why a Danish solo developer is shipping an open-source end-to-end encrypted file transfer service.",
};

export default function AboutPage() {
  return <AboutContent />;
}
