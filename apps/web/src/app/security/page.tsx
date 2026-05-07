// Security page — summarises the threat model + crypto details with deep
// links to the canonical docs in `docs/`. Kept as a summary, not the full
// document, so the canonical source stays in one place.

import type { Metadata } from "next";
import { ArrowUpRight, Code2, FileCheck2, KeyRound, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { GITHUB_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How SlothBox enforces end-to-end encryption: primitives, threat model, and the audit roadmap.",
};

const SECTIONS = [
  {
    icon: KeyRound,
    title: "Cryptography",
    body: "XChaCha20-Poly1305 IETF for symmetric AEAD. BLAKE2b-256 for key fingerprints. Argon2id for password-protected shares (v0.5+). All primitives are direct calls into libsodium — no custom logic, no hand-rolled MAC, no key stretching outside vetted defaults.",
    links: [{ href: `${GITHUB_URL}/blob/master/docs/CRYPTO.md`, label: "CRYPTO.md" }],
  },
  {
    icon: ShieldCheck,
    title: "Threat model",
    body: "We protect content confidentiality from the SlothBox operator and from network observers. We do not protect against an endpoint compromise (sender or recipient). We document explicit non-goals so you can decide whether the model fits your use case.",
    links: [{ href: `${GITHUB_URL}/blob/master/docs/THREAT_MODEL.md`, label: "THREAT_MODEL.md" }],
  },
  {
    icon: Code2,
    title: "Verifiable architecture",
    body: "Every container, every config, every cryptographic call lives in one repo under MIT. `docker compose up -d` brings the entire production stack online on your machine. v1.0 ships an offline `slothbox-verify` CLI you can audit independently.",
    links: [
      { href: GITHUB_URL, label: "Source on GitHub" },
      { href: `${GITHUB_URL}/blob/master/docs/ARCHITECTURE.md`, label: "ARCHITECTURE.md" },
    ],
  },
  {
    icon: FileCheck2,
    title: "Audit roadmap",
    body: "v0.1.0-alpha — internal review only. v1.0 — independent cryptographer review + third-party application pen test, with reports published under /audits/. We will not soften this milestone to ship faster.",
    links: [
      { href: `${GITHUB_URL}/blob/master/SECURITY.md`, label: "SECURITY.md" },
      { href: `${GITHUB_URL}/blob/master/MILESTONES.md`, label: "MILESTONES.md" },
    ],
  },
] as const;

export default function SecurityPage() {
  return (
    <article className="mx-auto w-full max-w-[var(--container-lg)] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10 max-w-2xl">
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Security
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          We don&apos;t ask you to trust us.
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--color-muted)]">
          Below is a summary of how SlothBox enforces its trust guarantees. The canonical documents
          — threat model, full crypto details, runbook — live in the repository so they version with
          the code.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SECTIONS.map((section) => (
          <Card key={section.title} className="surface-hover">
            <CardContent className="flex flex-col gap-3 p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
                <section.icon className="h-5 w-5" aria-hidden />
              </span>
              <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
                {section.title}
              </h2>
              <p className="text-sm leading-relaxed text-[var(--color-muted)]">{section.body}</p>
              <div className="mt-2 flex flex-wrap gap-3 pt-1">
                {section.links.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
                  >
                    {link.label}
                    <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="mt-12 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 sm:p-8">
        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          Reporting a vulnerability
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
          Email <code className="font-mono text-[var(--color-fg)]">security@philipsloth.com</code>.
          PGP key fingerprint and disclosure window are documented in{" "}
          <a
            href={`${GITHUB_URL}/blob/master/SECURITY.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            SECURITY.md
          </a>
          . v0.1 has no bug bounty; v1.0 will, scope-limited.
        </p>
      </section>
    </article>
  );
}
