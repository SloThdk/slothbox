// /abuse — server-component shell exporting static SEO metadata, then
// rendering the bilingual <AbuseContent /> client component.
//
// This route exists for two non-negotiable reasons:
//
//   1. **EU DSA Article 16 compliance.** The Digital Services Act (in force
//      since 17 February 2024 across the EU and transposed in DK) requires
//      every "hosting service" to expose an "easy-to-access" notice
//      mechanism for illegal content. A bare `mailto:` in the footer is
//      arguably enough; a dedicated `/abuse` page with structured guidance
//      is unambiguously enough.
//
//   2. **Operational triage.** When SlothBox is publicly indexable, the
//      operator will eventually receive abuse reports. Sending reporters to
//      a documented page with explicit "include the shortId, do NOT include
//      the URL fragment" guidance prevents well-meaning reporters from
//      forwarding the decryption key to the operator and accidentally
//      breaking the end-to-end encryption guarantee for that share.
//
// The route is /abuse (not /report or /legal/abuse) so it shows up in
// well-known abuse-discovery patterns, including some automated abuse-finder
// crawlers used by NCMEC reporters and DSA notice mechanisms.

import type { Metadata } from "next";
import { AbuseContent } from "./abuse-content";

export const metadata: Metadata = {
  title: "Report abuse",
  description:
    "Notice mechanism under EU Digital Services Act Article 16. Report illegal content or abuse of SlothBox to the operator — destroying a share does not require decrypting it.",
  // Allow indexing — abuse-discovery crawlers should be able to find this.
  robots: {
    index: true,
    follow: true,
  },
};

export default function AbusePage() {
  return <AbuseContent />;
}
