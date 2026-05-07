// SecurityContent — bilingual JSX body of /security. Lives in a separate
// client file so /security/page.tsx can stay a server component and
// continue exporting `metadata` (Next.js 15 disallows metadata exports
// from "use client" files).

"use client";

import { ArrowUpRight, Code2, FileCheck2, KeyRound, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GITHUB_URL } from "@/lib/config";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// Section data is keyed (titleKey/bodyKey) rather than pre-resolved so
// switching locale only re-renders the leaf strings, not the card grid.
// Links carry their own labelKey so the link wording localises too.
interface SectionLink {
  href: string;
  labelKey: TranslationKey;
}

interface Section {
  icon: LucideIcon;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  links: ReadonlyArray<SectionLink>;
}

const SECTIONS: ReadonlyArray<Section> = [
  {
    icon: KeyRound,
    titleKey: "security.crypto.title",
    bodyKey: "security.crypto.body",
    links: [
      {
        href: `${GITHUB_URL}/blob/master/docs/CRYPTO.md`,
        labelKey: "footer.link.crypto",
      },
    ],
  },
  {
    icon: ShieldCheck,
    titleKey: "security.threat.title",
    bodyKey: "security.threat.body",
    links: [
      {
        href: `${GITHUB_URL}/blob/master/docs/THREAT_MODEL.md`,
        labelKey: "footer.link.threatModel",
      },
    ],
  },
  {
    icon: Code2,
    titleKey: "security.architecture.title",
    bodyKey: "security.architecture.body",
    links: [
      { href: GITHUB_URL, labelKey: "security.architecture.linkSource" },
      {
        href: `${GITHUB_URL}/blob/master/docs/ARCHITECTURE.md`,
        // Reuse footer "threat model" key family — no need for a
        // dedicated "ARCHITECTURE.md" entry, the file name itself is
        // language-neutral and the surrounding label key carries the
        // shared "doc reference" tone.
        labelKey: "footer.link.threatModel",
      },
    ],
  },
  {
    icon: FileCheck2,
    titleKey: "security.audit.title",
    bodyKey: "security.audit.body",
    links: [
      {
        href: `${GITHUB_URL}/blob/master/SECURITY.md`,
        labelKey: "footer.link.securityPolicy",
      },
    ],
  },
];

// Direct link labels we don't want to share with the section keys.
// Using the file names themselves keeps them language-neutral, which
// is correct for canonical doc references.
const RAW_DOC_LABELS: Record<string, string> = {
  [`${GITHUB_URL}/blob/master/docs/CRYPTO.md`]: "CRYPTO.md",
  [`${GITHUB_URL}/blob/master/docs/THREAT_MODEL.md`]: "THREAT_MODEL.md",
  [`${GITHUB_URL}/blob/master/docs/ARCHITECTURE.md`]: "ARCHITECTURE.md",
  [`${GITHUB_URL}/blob/master/SECURITY.md`]: "SECURITY.md",
  [`${GITHUB_URL}/blob/master/MILESTONES.md`]: "MILESTONES.md",
};

export function SecurityContent() {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-[var(--container-lg)] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          {t("security.eyebrow")}
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          {t("security.heading")}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
          {t("security.lede")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.titleKey} className="surface-hover">
            <CardContent className="flex flex-col gap-3 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
                <section.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                {t(section.titleKey)}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                {t(section.bodyKey)}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 pt-1">
                {section.links.map((link) => {
                  // Doc-name links (CRYPTO.md, THREAT_MODEL.md, …) keep
                  // their literal filename; everything else routes
                  // through t() so the locale toggle applies.
                  const literal = RAW_DOC_LABELS[link.href];
                  return (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
                    >
                      {literal ?? t(link.labelKey)}
                      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                    </a>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("security.disclose.heading")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
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
          {t("security.disclose.body.rest")}{" "}
          <a
            href={`${GITHUB_URL}/blob/master/SECURITY.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            SECURITY.md
          </a>
          {t("security.disclose.body.tail")}
        </p>
      </section>
    </article>
  );
}
