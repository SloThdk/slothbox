// /transparency — server-component shell that exports static SEO
// metadata then renders the <TransparencyContent /> client view.
// Matches the /security and /about pattern (a server-rendered shell
// for SEO + a client component for the bilingual + interactive bits).

import type { Metadata } from "next";
import { TransparencyContent } from "./transparency-content";

export const metadata: Metadata = {
  title: "Transparency",
  description:
    "Where SlothBox runs, who the operator is, which sub-processors handle your bytes, and how to verify it.",
};

export default function TransparencyPage() {
  return <TransparencyContent />;
}
