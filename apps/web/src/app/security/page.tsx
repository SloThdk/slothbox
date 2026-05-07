// /security — server-component shell that exports static SEO metadata,
// then renders the bilingual <SecurityContent /> client component.
// See /about/page.tsx for the rationale behind the split.

import type { Metadata } from "next";
import { SecurityContent } from "./security-content";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How SlothBox enforces end-to-end encryption: primitives, threat model, and the audit roadmap.",
};

export default function SecurityPage() {
  return <SecurityContent />;
}
