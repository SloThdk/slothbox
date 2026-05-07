// Footer — license, GitHub, EU residency, version. Kept tight; the landing
// page is the loud part.

import Link from "next/link";
import { APP_NAME, APP_VERSION, GITHUB_URL } from "@/lib/config";

export function Footer() {
  return (
    <footer className="mt-24 border-t border-[var(--color-border)]/60 bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-fg)]">{APP_NAME}</p>
          <p className="mt-1 max-w-md text-sm text-[var(--color-muted)]">
            End-to-end encrypted file transfer. Open source under the MIT licence. Hosted in the EU
            (Hetzner DE / FI).
          </p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm md:grid-cols-3">
          <FooterColumn
            title="Product"
            links={[
              { href: "/", label: "Send a file" },
              { href: "/about", label: "About" },
              { href: "/security", label: "Security" },
            ]}
          />
          <FooterColumn
            title="Open source"
            links={[
              { href: GITHUB_URL, label: "GitHub", external: true },
              {
                href: `${GITHUB_URL}/blob/master/LICENSE`,
                label: "MIT licence",
                external: true,
              },
              {
                href: `${GITHUB_URL}/blob/master/SECURITY.md`,
                label: "Security policy",
                external: true,
              },
            ]}
          />
          <FooterColumn
            title="Legal"
            links={[
              {
                href: `${GITHUB_URL}/blob/master/docs/THREAT_MODEL.md`,
                label: "Threat model",
                external: true,
              },
              {
                href: `${GITHUB_URL}/blob/master/docs/CRYPTO.md`,
                label: "Crypto details",
                external: true,
              },
            ]}
          />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]/60">
        <div className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-[var(--color-muted)] sm:flex-row sm:items-center sm:px-6">
          <span>
            v{APP_VERSION} · Built by{" "}
            <a
              href="https://philipsloth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--color-border)] underline-offset-2 hover:decoration-[var(--color-accent)]"
            >
              Philip Sloth
            </a>{" "}
            · Made in Denmark.
          </span>
          <span>EU residency: data lives in Hetzner DE / FI. No US transit.</span>
        </div>
      </div>
    </footer>
  );
}

interface FooterLink {
  href: string;
  label: string;
  external?: boolean;
}

function FooterColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase">
        {title}
      </p>
      <ul className="mt-3 space-y-2">
        {links.map((link) =>
          link.external ? (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)]"
              >
                {link.label}
              </a>
            </li>
          ) : (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)]"
              >
                {link.label}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
