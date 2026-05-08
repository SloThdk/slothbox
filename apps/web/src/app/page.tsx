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
// WhyNotAlternatives — six-row comparison table that names the competitors
// by name and cites the specific deal-breaker for each. This section exists
// because the existing Guarantees + HowItWorks tells the visitor HOW
// SlothBox works but never answers their first real question: "why this
// and not WeTransfer, which works fine?" Establishing the gap before the
// trust claims means a visitor who'd otherwise bounce on Guarantees stays
// engaged because they now have a felt problem the rest of the page
// addresses.
//
// Layout: bordered glass card, 2-col grid (Service | What it gives up).
// On mobile the rows collapse to stacked title/body pairs so the table
// stays readable on a 360 px viewport. The accent colour is reserved for
// the eyebrow only — the rows themselves stay neutral so no row reads as
// "the highlighted one".
// ---------------------------------------------------------------------------

const WHY_NOT_ROWS: ReadonlyArray<{
  productKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { productKey: "whyNot.row1.product", bodyKey: "whyNot.row1.body" },
  { productKey: "whyNot.row2.product", bodyKey: "whyNot.row2.body" },
  { productKey: "whyNot.row3.product", bodyKey: "whyNot.row3.body" },
  { productKey: "whyNot.row4.product", bodyKey: "whyNot.row4.body" },
  { productKey: "whyNot.row5.product", bodyKey: "whyNot.row5.body" },
  { productKey: "whyNot.row6.product", bodyKey: "whyNot.row6.body" },
];

function WhyNotAlternatives() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">{t("whyNot.eyebrow")}</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          {t("whyNot.heading")}
        </h2>
        <p className="mt-6 max-w-[58ch] text-[1.0rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("whyNot.lede")}
        </p>
      </div>

      {/* Table-as-grid: keeps single-column-on-mobile cleanly and avoids the
          horizontal-scroll trap that real <table> elements fall into at
          narrow viewports. Header row is hidden on mobile (visually
          redundant with the per-row product label) and reappears on sm+. */}
      <div className="glass overflow-hidden">
        <div className="hidden sm:grid sm:grid-cols-[minmax(0,200px)_1fr] sm:border-b sm:border-[var(--color-glass-stroke)]">
          <div className="px-6 py-3 font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)] uppercase">
            {t("whyNot.col.product")}
          </div>
          <div className="border-l border-[var(--color-glass-stroke)] px-6 py-3 font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)] uppercase">
            {t("whyNot.col.gap")}
          </div>
        </div>
        <ul className="divide-y divide-[var(--color-glass-stroke)]">
          {WHY_NOT_ROWS.map((row) => (
            <li
              key={row.productKey}
              className="grid grid-cols-1 gap-1 px-6 py-5 sm:grid-cols-[minmax(0,200px)_1fr] sm:gap-0 sm:py-4"
            >
              <div className="text-[1rem] font-medium text-[var(--color-fg)] sm:self-center">
                {t(row.productKey)}
              </div>
              <div className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)] sm:self-center sm:border-l sm:border-[var(--color-glass-stroke)] sm:pl-6">
                {t(row.bodyKey)}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// UseCases — four concrete scenarios where someone would actually reach
// for SlothBox today. Pairs with WhyNotAlternatives to convert "I see why
// the other tools fall short" into "and here's specifically when I'd pick
// this instead". Reusing the 2-col card grid from Guarantees keeps the
// page's visual rhythm consistent.
// ---------------------------------------------------------------------------

const USE_CASE_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "useCases.item1.title", bodyKey: "useCases.item1.body" },
  { titleKey: "useCases.item2.title", bodyKey: "useCases.item2.body" },
  { titleKey: "useCases.item3.title", bodyKey: "useCases.item3.body" },
  { titleKey: "useCases.item4.title", bodyKey: "useCases.item4.body" },
];

function UseCases() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">{t("useCases.eyebrow")}</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          {t("useCases.heading")}
        </h2>
        <p className="mt-6 max-w-[58ch] text-[1.0rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("useCases.lede")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {USE_CASE_KEYS.map((item, i) => (
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
// Tradeoffs — the honest "what you give up" list. This section is the
// counterweight to every marketing claim above; without it the page reads
// like every other "secure file sharing" landing. Placement at the end is
// deliberate: visitors who made it here are evaluating seriously, and the
// honest disclosure does more for trust than another trust badge would.
//
// Visual register: monospace numbering + glass card grid, but tighter
// than UseCases — these are short paragraphs, not feature pitches. The
// tradeoffs include the v0.1-alpha disclosure (currently surfaced only
// in the AlphaBanner + /security), bringing the "wait for v1.0 for
// sensitive use" framing onto the homepage where it belongs.
// ---------------------------------------------------------------------------

const TRADEOFF_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "tradeoffs.item1.title", bodyKey: "tradeoffs.item1.body" },
  { titleKey: "tradeoffs.item2.title", bodyKey: "tradeoffs.item2.body" },
  { titleKey: "tradeoffs.item3.title", bodyKey: "tradeoffs.item3.body" },
  { titleKey: "tradeoffs.item4.title", bodyKey: "tradeoffs.item4.body" },
];

function Tradeoffs() {
  const { t } = useLanguage();

  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">{t("tradeoffs.eyebrow")}</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          {t("tradeoffs.heading")}
        </h2>
        <p className="mt-6 max-w-[58ch] text-[1.0rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("tradeoffs.lede")}
        </p>
      </div>

      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-[var(--color-glass-stroke)] md:grid-cols-2">
        {TRADEOFF_KEYS.map((item, i) => (
          <li key={item.titleKey} className="flex flex-col gap-4 bg-[var(--color-bg)] p-8">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[1.6rem] font-light text-[var(--color-muted-2)]">
                {String(i + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="text-[1.05rem] font-medium text-[var(--color-fg)]">
              {t(item.titleKey)}
            </h3>
            <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
              {t(item.bodyKey)}
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
      {/* WhyNotAlternatives + UseCases establish the felt-problem before
          the trust claims. Order matters: a visitor who lands cold needs
          to see "why this not WeTransfer" before "trust the architecture",
          otherwise the trust claims read as decorative. */}
      <WhyNotAlternatives />
      <UseCases />
      <Guarantees />
      <HowItWorks />
      {/* Tradeoffs is the honesty counterweight — placed after the
          mechanism explanation so a visitor who's followed the whole
          flow sees the v0.1-alpha caveats and recipient-needs-the-fragment
          gotcha before the closing CTA. Without this section the page
          reads as marketing; with it, it reads as engineering. */}
      <Tradeoffs />
      <FooterCta />
    </>
  );
}
