// About page. Static content — server component.

import type { Metadata } from "next";
import Link from "next/link";
import { GITHUB_URL } from "@/lib/config";

export const metadata: Metadata = {
  title: "About",
  description:
    "What SlothBox is, who built it, why a Danish solo developer is shipping an open-source end-to-end encrypted file transfer service.",
};

export default function AboutPage() {
  return (
    <article className="mx-auto w-full max-w-[var(--container-md)] px-4 py-12 sm:px-6 sm:py-16">
      <header className="mb-10">
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          About
        </p>
        <h1 className="font-display mt-2 text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
          What SlothBox is, and why it exists.
        </h1>
      </header>

      <section className="prose-slothbox space-y-6 text-base leading-relaxed text-[var(--color-fg)]">
        <p>
          SlothBox is an open-source, EU-hosted, end-to-end encrypted file transfer service. Drop a
          file, get a link, send the link, your recipient downloads. The bit that&apos;s different:
          the server cannot decrypt anything you upload, and you don&apos;t have to take our word
          for it — the entire stack is on{" "}
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            GitHub
          </a>{" "}
          under MIT.
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          Why this, and why now
        </h2>
        <p>
          WeTransfer scans your file and keeps a copy. Dropbox Transfer reads your content and runs
          through US infrastructure (Schrems II problem for EU users). ProtonDrive is end-to-end
          encrypted but paid, account-only, and has no quick-share for unauthenticated recipients.
          There is no good European, open-source, end-to-end encrypted file transfer with
          court-admissible delivery receipts. SlothBox aims at that gap, with a focus on the
          regulated professions where both confidentiality and provable delivery are statutory
          requirements.
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">Who built it</h2>
        <p>
          Hi — I&apos;m{" "}
          <a
            href="https://philipsloth.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            Philip Sloth
          </a>
          , a sole-proprietor developer based in Denmark. I build software where the security
          guarantees come from the architecture rather than a marketing page. SlothBox is one of two
          open-source reference builds I run alongside client work — the other is{" "}
          <a
            href="https://slothcv.pages.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            SlothCV
          </a>
          , a free CV builder with similar trust-as-architecture discipline.
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">Status</h2>
        <p>
          v0.1.0-alpha is a portfolio reference build. The cryptographic primitives (libsodium, age)
          are battle-tested, but the SlothBox integration has not yet been independently audited.
          Don&apos;t use this for high-stakes secrets until v1.0 + external cryptographer review.
          The full roadmap, exit criteria per release, and known gaps are in{" "}
          <a
            href={`${GITHUB_URL}/blob/master/MILESTONES.md`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            MILESTONES.md
          </a>
          .
        </p>

        <h2 className="font-display text-2xl font-semibold text-[var(--color-fg)]">
          Why &ldquo;sloth&rdquo;
        </h2>
        <p>
          Slow on purpose. Encryption that&apos;s rushed is encryption that breaks. Every primitive
          in this stack is audited, every default is conservative, and every shortcut is documented
          as such. The brand is a reminder: trust earns itself slowly.
        </p>

        <p className="pt-2 text-sm text-[var(--color-muted)]">
          Built on a single ARM Linux VM in an EU jurisdiction, with eight other people&apos;s
          open-source projects holding it up. See{" "}
          <Link
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            /security
          </Link>{" "}
          for the threat model.
        </p>
      </section>
    </article>
  );
}
