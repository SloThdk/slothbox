// Landing page.
//
// Server component (no `use client`) — only the upload widget reaches across
// the client boundary. The hero copy is opinionated by design; we want the
// trust pitch to be the first thing every visitor reads.

import Link from "next/link";
import { Code2, EarthLock, FileCheck2, KeyRound, Server, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UploadDrop } from "@/components/UploadDrop";
import { GITHUB_URL } from "@/lib/config";

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col items-center gap-10 px-4 pt-14 pb-20 sm:px-6 sm:pt-24 lg:flex-row lg:gap-16">
      <div className="flex max-w-2xl flex-1 flex-col gap-7 lg:max-w-none lg:basis-1/2">
        {/* Status pill — moved to a serif-rendered "edition" line. Reads like
            the masthead of a periodical, not a SaaS toast. */}
        <span className="inline-flex w-fit items-center gap-2.5 border-y border-[var(--color-border-strong)] py-1.5 font-mono text-[0.65rem] tracking-[0.3em] text-[var(--color-muted)] uppercase">
          <span className="animate-pulse-soft inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
          v0.1.0-alpha · public source · EU-hosted
        </span>

        {/* Hero headline. Serif Playfair Display, looser leading, italicised
            mid-sentence for editorial cadence. The gold underline sits behind
            the key claim ("we can't read it"). */}
        <h1 className="font-display text-[2.5rem] leading-[1.05] font-medium tracking-tight text-[var(--color-fg)] sm:text-[3.25rem] md:text-[3.75rem]">
          Send any file.
          <br />
          <span className="hero-mark">We can&apos;t read it.</span>
          <br />
          <span className="font-display text-[var(--color-muted)] italic">
            Verify the math yourself.
          </span>
        </h1>

        <p className="max-w-xl text-[0.95rem] leading-relaxed text-[var(--color-muted)] sm:text-[1.05rem]">
          SlothBox seals your file in your browser before it leaves your machine. The unlock key
          lives in the part of the URL after{" "}
          <code className="rounded border border-[var(--color-border)] bg-[var(--color-card)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-accent)]">
            #
          </code>{" "}
          — which browsers <em className="text-[var(--color-fg)] not-italic">never</em> send to any
          server. Audited libsodium primitives only. No telemetry. No accounts required.
        </p>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pt-1 text-sm">
          <Link
            href="/security"
            className="group inline-flex items-center gap-1.5 font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            How the trust model works
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </Link>
          <span className="hidden text-[var(--color-border-strong)] sm:inline">·</span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-1.5 font-medium text-[var(--color-fg)] underline-offset-4 hover:underline"
          >
            Read the source on GitHub
            <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
              →
            </span>
          </a>
        </div>
      </div>

      <div className="flex w-full flex-1 justify-center lg:basis-1/2 lg:justify-end">
        <UploadDrop />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Guarantees grid — 4 cards that map 1:1 to the README's trust pillars.
// ---------------------------------------------------------------------------

const GUARANTEES = [
  {
    icon: KeyRound,
    title: "The server can't decrypt your files",
    body: "Your file is locked in your browser using libsodium's XChaCha20-Poly1305 before any byte leaves the machine. The decryption key lives in the URL fragment — browsers never send fragments in HTTP requests.",
  },
  {
    icon: EarthLock,
    title: "EU-hosted, no US transit",
    body: "Containers run on Hetzner Germany and Finland. Data does not transit US-jurisdiction infrastructure where Schrems II compliance is contested. Important if you are subject to GDPR, Bogføringsloven or any tavshedspligt regime.",
  },
  {
    icon: Code2,
    title: "Open source, every line",
    body: "This repository is the entire production stack. `docker compose up -d` brings the whole thing online on your own machine. No closed components, no black boxes, no marketing-only claims.",
  },
  {
    icon: ShieldCheck,
    title: "Verifiable, not just promised",
    body: "v0.5 ships RFC 3161 timestamped delivery receipts. v1.0 adds verifiable burn-after-read via a public hash chain and an offline `slothbox-verify` CLI. Every claim above is checkable without contacting our service.",
  },
] as const;

function Guarantees() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-20 sm:px-6">
      <div className="mb-12 max-w-2xl">
        <p className="eyebrow">Four guarantees</p>
        <h2 className="font-display mt-3 text-3xl leading-[1.15] font-medium text-[var(--color-fg)] sm:text-[2.4rem]">
          Trust comes from <em className="text-[var(--color-accent)]">architecture</em> — not
          marketing copy.
        </h2>
        <p className="mt-4 text-[var(--color-muted)]">
          Every claim below is enforced at the code or infrastructure layer. You can read the source
          yourself.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2">
        {GUARANTEES.map((item) => (
          <div
            key={item.title}
            className="surface-hover flex flex-col gap-3 bg-[var(--color-card)] p-7"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--color-accent-tint)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <item.icon className="h-4.5 w-4.5" aria-hidden strokeWidth={1.6} />
            </span>
            <h3 className="font-display text-[1.15rem] font-medium text-[var(--color-fg)]">
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// How it works — 3 steps, code-feel.
// ---------------------------------------------------------------------------

const STEPS = [
  {
    n: "01",
    icon: FileCheck2,
    title: "Drop a file",
    body: "Pick or drag a file. Up to 4 GiB per share in this alpha. Nothing has left your machine yet.",
  },
  {
    n: "02",
    icon: KeyRound,
    title: "Encrypted locally",
    body: "Your browser generates a 256-bit key, slices the file into 5 MiB chunks, and seals each chunk with XChaCha20-Poly1305. The server only ever sees ciphertext.",
  },
  {
    n: "03",
    icon: Server,
    title: "Share the link",
    body: "Send the share link over any channel you trust. The decryption key rides in the URL fragment — your recipient's browser unlocks the file on their side.",
  },
] as const;

function HowItWorks() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-20 sm:px-6">
      <div className="ornament mb-14">three steps</div>

      <div className="mb-12 max-w-2xl">
        <p className="eyebrow">How it works</p>
        <h2 className="font-display mt-3 text-3xl leading-[1.15] font-medium text-[var(--color-fg)] sm:text-[2.4rem]">
          Three steps. <em className="text-[var(--color-accent)]">Zero</em> secrets shared with us.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {STEPS.map((step) => (
          <div key={step.n} className="surface surface-hover relative flex flex-col gap-4 p-7">
            <div className="flex items-center justify-between border-b border-[var(--color-border)] pb-3">
              <span className="font-display text-3xl text-[var(--color-accent)]">{step.n}</span>
              <step.icon
                className="h-5 w-5 text-[var(--color-muted)]"
                aria-hidden
                strokeWidth={1.6}
              />
            </div>
            <h3 className="font-display text-[1.15rem] font-medium text-[var(--color-fg)]">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--color-muted)]">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// CTA strip
// ---------------------------------------------------------------------------

function FooterCta() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-8 pb-16 sm:px-6">
      <div className="surface flex flex-col items-start gap-5 p-8 sm:flex-row sm:items-center sm:justify-between sm:p-10">
        <div className="max-w-xl">
          <p className="eyebrow">For regulated work</p>
          <h3 className="font-display mt-2 text-[1.6rem] leading-[1.2] font-medium text-[var(--color-fg)]">
            Lawyers, accountants, journalists, doctors.
          </h3>
          <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
            Anyone bound by tavshedspligt, GDPR, Bogføringsloven, or audit-trail requirements.{" "}
            <span className="text-[var(--color-fg)]">v0.5</span> ships court-admissible RFC 3161
            delivery receipts.
          </p>
        </div>
        <Link
          href="/security"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md border border-[var(--color-accent-tint)] bg-[var(--color-accent-soft)] px-5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
        >
          Read the security docs →
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
