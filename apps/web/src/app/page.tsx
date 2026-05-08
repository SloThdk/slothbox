// Landing page.
//
// Marked "use client" so the section components can call useLanguage()
// for the bilingual marketing copy. We deliberately keep the GUARANTEES
// and STEPS arrays as STATIC tables of translation keys (not pre-resolved
// strings) so the table itself never re-renders when the locale flips —
// only the text inside each row does.
//
// Design language: visionOS-inspired dark glass. Layout is intentionally
// asymmetric (left-aligned hero, right-floated widget) and uses negative
// space generously. Typography is Inter at multiple weights — no serif,
// no italic mid-sentence, no gradient text. Accent (#5b9eff sky-blue)
// is used SPARINGLY: one CTA, one focal element. Iconography is custom
// inline SVG at 1.2pt stroke weight, not Lucide stock.

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UploadDrop } from "@/components/UploadDrop";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20">
        {/* Left column — copy block */}
        <div className="flex flex-col gap-8 pt-2">
          {/* Status pill — minimal mono caps, glass background */}
          <span className="glass inline-flex w-fit items-center gap-2.5 rounded-full px-3.5 py-1.5">
            <span className="animate-pulse-soft inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-fg-2)] uppercase">
              {t("hero.statusPill")}
            </span>
          </span>

          {/* Hero headline. Three lines, single sans typeface, weight gradient
              from light (display) to medium. NO gradient text. The visual
              weight comes from line break composition + tracking, not from
              colour effects. */}
          <h1 className="text-[2.75rem] leading-[1.02] font-light text-[var(--color-fg)] sm:text-[3.5rem] md:text-[4rem]">
            {t("hero.headline.l1")}
            <br />
            <span className="font-medium">{t("hero.headline.l2")}</span>
            <br />
            <span className="text-[var(--color-muted)]">{t("hero.headline.l3")}</span>
          </h1>

          <p className="max-w-[42ch] text-[1.05rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
            {t("hero.copy.before")}{" "}
            <code className="rounded-md border border-[var(--color-glass-stroke)] bg-[var(--color-glass-fill)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-accent)]">
              #
            </code>{" "}
            {t("hero.copy.after")}
          </p>

          {/* CTAs — primary uses accent fill, secondary is plain underline.
              The contrast is intentional: only ONE accent-coloured button on
              the page. Everything else is text + glass.
              2026-05-08: secondary "Source" CTA removed alongside the
              header GitHub button — slothbox's official site no longer
              surfaces its source repo. */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/security"
              className="group inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 text-sm font-medium text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent-strong)]"
            >
              {t("hero.cta.primary")}
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
                strokeWidth={2}
              />
            </Link>
            <Link
              href="/about"
              className="text-sm font-medium text-[var(--color-fg-2)] underline-offset-[5px] transition-colors hover:text-[var(--color-fg)] hover:underline"
            >
              {t("hero.cta.secondary")}
            </Link>
          </div>
        </div>

        {/* Right column — upload widget, glass-elevated, floats slightly above
            the rest of the page. */}
        <div className="flex w-full justify-center lg:justify-end">
          <UploadDrop />
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Guarantees — four restraint-driven trust claims.
// ---------------------------------------------------------------------------

// Static list of translation-key pairs (title + body). Keeping the list
// itself static means a locale flip only re-renders the leaf text nodes;
// the surrounding grid + glass cards keep their identity in the React
// tree, so no animation hiccups when toggling between EN ⇄ DA.
const GUARANTEE_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "guarantees.item1.title", bodyKey: "guarantees.item1.body" },
  { titleKey: "guarantees.item2.title", bodyKey: "guarantees.item2.body" },
  { titleKey: "guarantees.item3.title", bodyKey: "guarantees.item3.body" },
  { titleKey: "guarantees.item4.title", bodyKey: "guarantees.item4.body" },
];

function Guarantees() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">{t("guarantees.eyebrow")}</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          {t("guarantees.heading")}
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GUARANTEE_KEYS.map((item, i) => (
          <article
            key={item.titleKey}
            className="glass flex flex-col gap-3 p-7 transition-colors hover:border-[var(--color-glass-stroke-strong)]"
          >
            <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[1.1rem] font-medium text-[var(--color-fg)]">{t(item.titleKey)}</h3>
            <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
              {t(item.bodyKey)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works — three steps, sparse layout.
// ---------------------------------------------------------------------------

const STEP_KEYS: ReadonlyArray<{
  n: string;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { n: "01", titleKey: "how.step1.title", bodyKey: "how.step1.body" },
  { n: "02", titleKey: "how.step2.title", bodyKey: "how.step2.body" },
  { n: "03", titleKey: "how.step3.title", bodyKey: "how.step3.body" },
];

function HowItWorks() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">{t("how.eyebrow")}</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          {t("how.heading")}
        </h2>
      </div>

      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-[var(--color-glass-stroke)] md:grid-cols-3">
        {STEP_KEYS.map((step) => (
          <li key={step.n} className="flex flex-col gap-4 bg-[var(--color-bg)] p-8">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[1.6rem] font-light text-[var(--color-accent)]">
                {step.n}
              </span>
              <span className="font-mono text-[0.65rem] tracking-[0.18em] text-[var(--color-muted-2)] uppercase">
                {t("how.step.label")}
              </span>
            </div>
            <h3 className="text-[1.1rem] font-medium text-[var(--color-fg)]">{t(step.titleKey)}</h3>
            <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
              {t(step.bodyKey)}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA — closing
// ---------------------------------------------------------------------------

function FooterCta() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-12 pb-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />
      <div className="glass-elevated flex flex-col items-start gap-6 p-10 sm:flex-row sm:items-center sm:justify-between sm:p-12">
        <div className="max-w-xl">
          <p className="eyebrow">{t("ctaBlock.eyebrow")}</p>
          <h3 className="mt-4 text-[1.5rem] leading-[1.2] font-light text-[var(--color-fg)] sm:text-[1.75rem]">
            {t("ctaBlock.heading")}
          </h3>
          <p className="mt-4 max-w-lg text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
            {t("ctaBlock.body")}
          </p>
        </div>
        <Link
          href="/security"
          className="group inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-glass-stroke-strong)] bg-[var(--color-glass-fill)] px-5 text-sm font-medium text-[var(--color-fg)] backdrop-blur-md transition-colors hover:border-[var(--color-accent-tint)] hover:text-[var(--color-accent)]"
        >
          {t("ctaBlock.cta")}
          <ArrowRight
            className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
            aria-hidden
            strokeWidth={2}
          />
        </Link>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HomePage() {
  return (
    <>
      <Hero />
      <Guarantees />
      <HowItWorks />
      <FooterCta />
    </>
  );
}
