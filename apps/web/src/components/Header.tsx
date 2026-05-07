// Sticky top navigation — kept minimal on purpose. Wordmark, two text links,
// the GitHub badge. Theme switcher lands in v0.5+ once accounts settle.
//
// The wordmark glyph mirrors the favicon (app/icon.svg): a graphite rounded
// square with a champagne-gold padlock, shackle open at the top-right. The
// inline SVG is identical to the favicon so the brand mark scales from a
// 16-pixel browser tab to a hero-sized illustration without redrawing.

import Link from "next/link";
import { Github } from "lucide-react";
import { GITHUB_URL } from "@/lib/config";

/**
 * SlothBox padlock-glyph wordmark. SVG inline to avoid an extra HTTP
 * request on first paint. Matches app/icon.svg byte-for-byte (modulo
 * sizing) so the brand identity is consistent end-to-end.
 */
function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-accent-tint)] bg-[var(--color-bg)]"
        aria-hidden
      >
        <svg viewBox="0 0 32 32" width={22} height={22}>
          {/* Padlock shackle — open at the top-right, hinting that the
              recipient (not the platform) holds the key to unlock. */}
          <path
            d="M11 14 V11 a5 5 0 0 1 10 0 v3"
            stroke="var(--color-accent)"
            strokeWidth={2.4}
            fill="none"
            strokeLinecap="round"
          />
          {/* Padlock body — solid champagne against the graphite frame. */}
          <rect x={8.5} y={13.5} width={15} height={11} rx={1.6} fill="var(--color-accent)" />
          {/* Keyhole — cut from the body in the bg colour. */}
          <circle cx={16} cy={18.5} r={1.6} fill="var(--color-bg)" />
          <rect x={15.25} y={18.5} width={1.5} height={3.2} fill="var(--color-bg)" />
        </svg>
      </span>
      <span className="font-display text-[1.35rem] leading-none font-semibold tracking-tight">
        SlothBox
      </span>
    </span>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)]/60 bg-[var(--color-bg)]/85 backdrop-blur-md supports-[backdrop-filter]:bg-[var(--color-bg)]/65">
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-xl)] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-85"
          aria-label="SlothBox — home"
        >
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/about"
            className="rounded-md px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            About
          </Link>
          <Link
            href="/security"
            className="rounded-md px-3 py-2 text-sm text-[var(--color-muted)] transition-colors hover:text-[var(--color-fg)]"
          >
            Security
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent-tint)] hover:bg-[var(--color-card)]"
          >
            <Github className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
