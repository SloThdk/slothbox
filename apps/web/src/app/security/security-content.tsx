// SecurityContent — bilingual JSX body of /security. Lives in a separate
// client file so /security/page.tsx can stay a server component and
// continue exporting `metadata` (Next.js 15 disallows metadata exports
// from "use client" files).
//
// 2026-05-08: each card's deep "read CRYPTO.md / THREAT_MODEL.md /
// ARCHITECTURE.md / SECURITY.md on GitHub" link was removed alongside
// the chrome-level GitHub button. The page now reads as a polished
// product trust statement rather than an open-source repo landing —
// the source repository surface lives on philipsloth.com (Philip's
// portfolio) instead. If we ever want click-through proofs back, the
// follow-up is to internalise those docs to /security/{crypto,threat,
// architecture,policy} routes rather than re-link to GitHub.

"use client";

import { Code2, FileCheck2, KeyRound, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// Section data is keyed (titleKey/bodyKey) rather than pre-resolved so
// switching locale only re-renders the leaf strings, not the card grid.
interface Section {
  icon: LucideIcon;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}

const SECTIONS: ReadonlyArray<Section> = [
  {
    icon: KeyRound,
    titleKey: "security.crypto.title",
    bodyKey: "security.crypto.body",
  },
  {
    icon: ShieldCheck,
    titleKey: "security.threat.title",
    bodyKey: "security.threat.body",
  },
  {
    icon: Code2,
    titleKey: "security.architecture.title",
    bodyKey: "security.architecture.body",
  },
  {
    icon: FileCheck2,
    titleKey: "security.audit.title",
    bodyKey: "security.audit.body",
  },
];

export function SecurityContent() {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-16 sm:px-6 sm:py-20">
      <header className="mb-12 max-w-3xl sm:mb-16">
        <p className="text-xs font-semibold tracking-[0.18em] text-[var(--color-accent)] uppercase sm:text-sm">
          {t("security.eyebrow")}
        </p>
        <h1 className="font-display mt-3 text-5xl font-bold tracking-tight text-[var(--color-fg)] sm:text-6xl">
          {t("security.heading")}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--color-fg-2)] sm:text-xl">
          {t("security.lede")}
        </p>
      </header>

      {/* Larger, more present cards — the security story is the product's
          whole pitch, so these read as substantial feature blocks (roomy
          padding, bigger icon tiles + headings, higher-contrast body) rather
          than compact list items. */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.titleKey} className="surface-hover">
            <CardContent className="flex flex-col gap-4 p-8 sm:gap-5 sm:p-10">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
                <section.icon className="h-7 w-7" aria-hidden strokeWidth={1.75} />
              </span>
              <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)] sm:text-[1.75rem]">
                {t(section.titleKey)}
              </h2>
              <p className="text-base leading-relaxed text-[var(--color-fg-2)] sm:text-[1.05rem]">
                {t(section.bodyKey)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-14 rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-8 sm:p-10">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)] sm:text-3xl">
          {t("security.disclose.heading")}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-[var(--color-fg-2)]">
          {t("security.disclose.body.lead")}{" "}
          {/* Two-route disclosure: direct email OR the philipsloth.com
              contact form. Both reach the same inbox; presenting both
              lowers the friction for a reporter who'd rather not use
              email. The literal email is mailto-linked so a click sends
              straight to the maintainer's compose window. */}
          <a
            href="mailto:philipsloth1@gmail.com?subject=SlothBox%20security%20report"
            className="font-mono text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            philipsloth1@gmail.com
          </a>{" "}
          {t("security.disclose.body.or")}{" "}
          <a
            href="https://philipsloth.com/contact"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            philipsloth.com/contact
          </a>
          {t("security.disclose.body.tail")}
        </p>
      </section>
    </article>
  );
}
