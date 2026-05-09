// /how — server-component shell that exports static SEO metadata,
// then renders the bilingual <HowContent /> client component.
//
// See /about/page.tsx for the rationale behind the server-wraps-client
// split: Next.js 15 disallows `export const metadata` from a "use client"
// file, but the page body needs useLanguage() for EN/DA toggling.

import type { Metadata } from "next";
import { HowContent } from "./how-content";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Every layer of the SlothBox pipeline — browser-side encryption, EU-only data path, hash-chained audit log, server-driven burn-after-read. Read this once and you'll know whether to trust the architecture.",
};

export default function HowPage() {
  return <HowContent />;
}
