// AbuseContent — bilingual JSX body of /abuse. Lives in a separate client
// file because /abuse/page.tsx exports `metadata` (Next.js 15 disallows that
// from "use client" files). Same server-shell + client-content split pattern
// used by /about and /security.

"use client";

import Link from "next/link";
import { AlertTriangle, Mail, ShieldX } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";

// Maintainer contact channels. Two paths offered so a reporter can pick
// whichever they're set up to use:
//   - direct mail to the maintainer's working inbox
//   - the contact form on philipsloth.com, which routes to the same inbox
//     and gives reporters who don't use email an alternative.
//
// If either ever changes, callers updating these constants should also
// update SECURITY.md, README.md, CONTRIBUTING.md, and the GitHub issue
// templates (grep for the literal values before editing).
const MAINTAINER_EMAIL = "philipsloth1@gmail.com";
const CONTACT_FORM_URL = "https://philipsloth.com/contact";

export function AbuseContent() {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-[var(--container-md)] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          {t("abuse.eyebrow")}
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          {t("abuse.heading")}
        </h1>
      </header>

      <section className="prose-slothbox space-y-6 text-base leading-relaxed text-[var(--color-fg)]">
        <p>{t("abuse.lede")}</p>

        <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[var(--color-fg)]">
          <Mail className="h-5 w-5 text-[var(--color-accent)]" aria-hidden />
          {t("abuse.howTo.heading")}
        </h2>
        <p>{t("abuse.howTo.body")}</p>

        {/*
          High-contrast contact callout. Pulled out of the prose so a reader
          skimming the page can land here directly. Two routes offered: a
          direct mailto with a pre-populated subject the operator can route
          automatically, OR the contact form on philipsloth.com for reporters
          who would rather not use email.
        */}
        <div className="rounded-xl border border-[var(--color-accent)]/40 bg-[color-mix(in_srgb,var(--color-accent)_8%,transparent)] p-6 sm:p-8">
          <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
            {t("abuse.contact.heading")}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--color-fg)]">
            {t("abuse.contact.body")}{" "}
            <a
              href={`mailto:${MAINTAINER_EMAIL}?subject=SlothBox%20abuse%20report`}
              className="font-mono font-semibold text-[var(--color-accent)] underline-offset-4 hover:underline"
            >
              {MAINTAINER_EMAIL}
            </a>{" "}
            —{" "}
            {/* Inline "or" so a reporter can choose either path without
                first reading the paragraph following the callout. */}
            <span className="text-[var(--color-fg-2)]">{t("abuse.contact.or")}</span>{" "}
            <a
              href={CONTACT_FORM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[var(--color-accent)] underline-offset-4 hover:underline"
            >
              philipsloth.com/contact
            </a>
            . {t("abuse.contact.body.tail")}
          </p>
        </div>

        {/*
          Critical warning: the fragment after `#` in a share URL is the
          decryption key. Reporters often paste the full URL — that would
          let the operator decrypt content and breaks the E2E guarantee.
          The shortId alone (12 chars after /s/) is enough.
        */}
        <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-amber-300">
          <AlertTriangle className="h-5 w-5" aria-hidden strokeWidth={2} />
          {t("abuse.dontInclude.heading")}
        </h2>
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-5 py-4 text-sm leading-relaxed text-[var(--color-fg)]">
          {t("abuse.dontInclude.body")}
        </p>

        <h2 className="font-display flex items-center gap-2 text-2xl font-semibold text-[var(--color-fg)]">
          <ShieldX className="h-5 w-5 text-[var(--color-accent)]" aria-hidden />
          {t("abuse.legal.heading")}
        </h2>
        <p>
          {t("abuse.legal.body")}{" "}
          <Link
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            /security
          </Link>
        </p>
      </section>
    </article>
  );
}
