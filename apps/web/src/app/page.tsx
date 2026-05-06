// Landing page.
//
// Server component (no `use client`) — only the upload widget reaches across
// the client boundary. The hero copy is opinionated by design; we want the
// trust pitch to be the first thing every visitor reads.

import Link from "next/link";
import {
  Code2,
  EarthLock,
  FileCheck2,
  KeyRound,
  Server,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { UploadDrop } from "@/components/UploadDrop";
import { GITHUB_URL } from "@/lib/config";

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

function Hero() {
  return (
    <section className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col items-center gap-10 px-4 pb-16 pt-12 sm:px-6 sm:pt-20 lg:flex-row lg:gap-12">
      <div className="flex max-w-2xl flex-1 flex-col gap-6 lg:max-w-none lg:basis-1/2">
        <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-card)] px-3 py-1 text-xs text-[var(--color-muted)]">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-accent)] animate-pulse-glow" />
          v0.1.0-alpha · public source · EU-hosted
        </span>

        <h1 className="font-display text-4xl font-semibold leading-[1.05] tracking-tight text-[var(--color-fg)] sm:text-5xl md:text-6xl">
          Send any file.{" "}
          <span className="gradient-text">We can&apos;t read it.</span>{" "}
          Verify the math yourself.
        </h1>

        <p className="max-w-xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg">
          SlothBox encrypts your file in your browser before it leaves your
          machine. The unlock key lives in the part of the URL after{" "}
          <code className="rounded bg-[var(--color-card)] px-1 py-0.5 font-mono text-sm text-[var(--color-fg)]">
            #
          </code>
          {" "}— which browsers <em>never</em> send to any server. Audited
          libsodium primitives only. No telemetry. No accounts required.
        </p>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Link
            href="/security"
            className="text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            How the trust model works →
          </Link>
          <span className="hidden text-[var(--color-border)] sm:inline">
            ·
          </span>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[var(--color-fg)] underline-offset-4 hover:underline"
          >
            Read the source on GitHub →
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
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-16 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Four guarantees
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-[var(--color-fg)] sm:text-4xl">
          Trust comes from architecture — not marketing copy.
        </h2>
        <p className="mt-3 text-[var(--color-muted)]">
          Every claim below is enforced at the code or infrastructure layer.
          You can read the source yourself.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {GUARANTEES.map((item) => (
          <Card
            key={item.title}
            className="surface-hover transition-colors"
          >
            <CardContent className="flex flex-col gap-3 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
                <item.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="font-display text-lg font-semibold text-[var(--color-fg)]">
                {item.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                {item.body}
              </p>
            </CardContent>
          </Card>
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
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 py-16 sm:px-6">
      <div className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          How it works
        </p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-[var(--color-fg)] sm:text-4xl">
          Three steps. Zero secrets shared with us.
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {STEPS.map((step) => (
          <Card key={step.n}>
            <CardContent className="flex flex-col gap-3 p-6">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs uppercase tracking-widest text-[var(--color-muted)]">
                  {step.n}
                </span>
                <step.icon
                  className="h-5 w-5 text-[var(--color-accent)]"
                  aria-hidden
                />
              </div>
              <h3 className="font-display text-lg font-semibold text-[var(--color-fg)]">
                {step.title}
              </h3>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">
                {step.body}
              </p>
            </CardContent>
          </Card>
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
    <section className="mx-auto w-full max-w-[var(--container-xl)] px-4 pb-12 pt-6 sm:px-6">
      <div className="surface flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
            Built for regulated work.
          </h3>
          <p className="mt-1 max-w-xl text-sm text-[var(--color-muted)]">
            Lawyers, accountants, journalists, doctors — anyone bound by
            tavshedspligt or audit-trail requirements. v0.5 adds court-admissible
            delivery receipts.
          </p>
        </div>
        <Link
          href="/security"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] px-5 text-sm font-medium text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent)]"
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
