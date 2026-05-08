// AboutContent — the bilingual JSX body of /about. Lives in a separate
// client file because the page-level `export const metadata` requires
// /about/page.tsx to stay a server component, and a server component
// can't call useLanguage() (a client hook).
//
// Pattern repeats on /security; both follow the same server-wraps-client
// split so SEO metadata stays static while the rendered content swaps
// with the locale toggle.

"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function AboutContent() {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-[var(--container-md)] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          {t("about.eyebrow")}
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          {t("about.heading")}
        </h1>
      </header>

      <section className="prose-slothbox space-y-6 text-base leading-relaxed text-[var(--color-fg)]">
        <p>
          {t("about.intro")} {t("about.intro.under")}
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.why.heading")}
        </h2>
        <p>{t("about.why.body")}</p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.who.heading")}
        </h2>
        <p>
          {t("about.who.body.lead")}{" "}
          <a
            href="https://philipsloth.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            Philip Sloth
          </a>
          {t("about.who.body.rest")}{" "}
          <a
            href="https://slothcv.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            SlothCV
          </a>
          {t("about.who.body.tail")}
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.useCases.heading")}
        </h2>
        <p>{t("about.useCases.body")}</p>
        <p>{t("about.useCases.body.notRight")}</p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.tradeoffs.heading")}
        </h2>
        <p>{t("about.tradeoffs.body")}</p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.status.heading")}
        </h2>
        <p>
          {t("about.status.body")}
          {t("about.status.body.tail")}
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          {t("about.name.heading")}
        </h2>
        <p>{t("about.name.body")}</p>

        <p className="pt-2 text-sm text-[var(--color-muted)]">
          {t("about.host.body.lead")}{" "}
          <Link
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            /security
          </Link>{" "}
          {t("about.host.body.tail")}
        </p>
      </section>
    </article>
  );
}
