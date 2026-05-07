// Landing page.
//
// Server component (no `use client`). Only the upload widget reaches across
// the client boundary; everything else is statically rendered.
//
// Design language: visionOS-inspired dark glass. Layout is intentionally
// asymmetric (left-aligned hero, right-floated widget) and uses negative
// space generously. Typography is Inter at multiple weights — no serif,
// no italic mid-sentence, no gradient text. Accent (#5b9eff sky-blue) is
// used SPARINGLY: one CTA, one focal element. Iconography is custom inline
// SVG at 1.2pt stroke weight, not Lucide stock.

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { UploadDrop } from "@/components/UploadDrop";
import { GITHUB_URL } from "@/lib/config";

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-20 pb-24 sm:px-6 sm:pt-28 sm:pb-32">
      <div className="grid grid-cols-1 items-start gap-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)] lg:gap-20">
        {/* Left column — copy block */}
        <div className="flex flex-col gap-8 pt-2">
          {/* Status pill — minimal mono caps, glass background */}
          <span className="glass inline-flex w-fit items-center gap-2.5 rounded-full px-3.5 py-1.5">
            <span className="animate-pulse-soft inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
            <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-fg-2)] uppercase">
              v0.1.0-alpha · public source
            </span>
          </span>

          {/* Hero headline. Three lines, single sans typeface, weight gradient
              from light (display) to medium. NO gradient text. The visual
              weight comes from line break composition + tracking, not from
              colour effects. */}
          <h1 className="text-[2.75rem] leading-[1.02] font-light text-[var(--color-fg)] sm:text-[3.5rem] md:text-[4rem]">
            Send any file.
            <br />
            <span className="font-medium">We can&apos;t read it.</span>
            <br />
            <span className="text-[var(--color-muted)]">Verify the math.</span>
          </h1>

          <p className="max-w-[42ch] text-[1.05rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
            SlothBox seals your file in your browser before it leaves your machine. The unlock key
            lives in the part of the URL after{" "}
            <code className="rounded-md border border-[var(--color-glass-stroke)] bg-[var(--color-glass-fill)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-accent)]">
              #
            </code>{" "}
            — which browsers never send to any server. Audited libsodium primitives only. No
            telemetry. No accounts.
          </p>

          {/* CTAs — primary uses accent fill, secondary is plain underline.
              The contrast is intentional: only ONE accent-coloured button on
              the page. Everything else is text + glass. */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <Link
              href="/security"
              className="group inline-flex h-11 cursor-pointer items-center gap-2 rounded-full bg-[var(--color-accent)] px-5 text-sm font-medium text-[var(--color-bg)] transition-colors hover:bg-[var(--color-accent-strong)]"
            >
              How the trust model works
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                aria-hidden
                strokeWidth={2}
              />
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-[var(--color-fg-2)] underline-offset-[5px] transition-colors hover:text-[var(--color-fg)] hover:underline"
            >
              Read the source ↗
            </a>
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

const GUARANTEES = [
  {
    title: "We can't decrypt your files",
    body: "XChaCha20-Poly1305 in your browser, before any byte leaves your device. The key lives in the URL fragment — browsers never send it to any server.",
  },
  {
    title: "EU only. No US transit.",
    body: "EU-jurisdiction servers, German data centre. No CloudFront. No Vercel edge. Schrems II is not a concern because no part of the data path crosses US jurisdiction.",
  },
  {
    title: "Open source, every line.",
    body: "This repository is the entire production stack. `docker compose up -d` brings the whole thing online on your own machine. Every claim is auditable.",
  },
  {
    title: "Verifiable, not just promised.",
    body: "v0.5 ships RFC 3161 timestamped delivery receipts. v1.0 adds verifiable burn-after-read via a public hash chain and an offline `slothbox-verify` CLI.",
  },
] as const;

function Guarantees() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">Trust comes from architecture</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          Four guarantees, each enforced at the code or infrastructure layer.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GUARANTEES.map((item, i) => (
          <article
            key={item.title}
            className="glass flex flex-col gap-3 p-7 transition-colors hover:border-[var(--color-glass-stroke-strong)]"
          >
            <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)]">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="text-[1.1rem] font-medium text-[var(--color-fg)]">{item.title}</h3>
            <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
              {item.body}
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

const STEPS = [
  {
    n: "01",
    title: "Drop a file",
    body: "Pick or drag a file. Up to 4 GiB per share in this alpha. Nothing has left your machine yet.",
  },
  {
    n: "02",
    title: "Encrypted locally",
    body: "Your browser generates a 256-bit key, slices the file into 5 MiB chunks, and seals each chunk with XChaCha20-Poly1305.",
  },
  {
    n: "03",
    title: "Share the link",
    body: "Send the share link over any channel you trust. The decryption key rides in the URL fragment — your recipient's browser unlocks the file on their side.",
  },
] as const;

function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />

      <div className="mb-14 max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h2 className="mt-4 text-[2rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2.5rem]">
          Three steps. No secrets shared with us.
        </h2>
      </div>

      <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl bg-[var(--color-glass-stroke)] md:grid-cols-3">
        {STEPS.map((step) => (
          <li key={step.n} className="flex flex-col gap-4 bg-[var(--color-bg)] p-8">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[1.6rem] font-light text-[var(--color-accent)]">
                {step.n}
              </span>
              <span className="font-mono text-[0.65rem] tracking-[0.18em] text-[var(--color-muted-2)] uppercase">
                step
              </span>
            </div>
            <h3 className="text-[1.1rem] font-medium text-[var(--color-fg)]">{step.title}</h3>
            <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
              {step.body}
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
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-12 pb-24 sm:px-6">
      <div className="divider mb-20" aria-hidden />
      <div className="glass-elevated flex flex-col items-start gap-6 p-10 sm:flex-row sm:items-center sm:justify-between sm:p-12">
        <div className="max-w-xl">
          <p className="eyebrow">Built for regulated work</p>
          <h3 className="mt-4 text-[1.5rem] leading-[1.2] font-light text-[var(--color-fg)] sm:text-[1.75rem]">
            Lawyers. Accountants. Journalists. Doctors.
          </h3>
          <p className="mt-4 max-w-lg text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
            Anyone bound by tavshedspligt, GDPR, Bogføringsloven, or audit-trail requirements. v0.5
            ships court-admissible RFC 3161 delivery receipts.
          </p>
        </div>
        <Link
          href="/security"
          className="group inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-[var(--color-glass-stroke-strong)] bg-[var(--color-glass-fill)] px-5 text-sm font-medium text-[var(--color-fg)] backdrop-blur-md transition-colors hover:border-[var(--color-accent-tint)] hover:text-[var(--color-accent)]"
        >
          Read the security docs
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
