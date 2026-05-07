// Sticky top navigation — kept minimal on purpose. Logo, two text links, the
// GitHub badge. Theme switcher lives in v0.5+ once accounts settle.

import Link from "next/link";
import { Github } from "lucide-react";
import { GITHUB_URL } from "@/lib/config";

/**
 * Inline SlothBox wordmark + leaf glyph. SVG kept inline so we don't ship an
 * extra HTTP request on first paint.
 */
function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <span
        className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] shadow-[0_0_24px_-4px_rgba(16,185,129,0.6)]"
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          width={18}
          height={18}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#04221b]"
        >
          {/* Stylised lock + leaf — matches the "trust + slow + EU" mood. */}
          <rect x={4} y={10} width={16} height={11} rx={2} />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
          <circle cx={12} cy={15} r={1.4} fill="currentColor" />
        </svg>
      </span>
      <span className="font-display text-lg font-semibold tracking-tight">SlothBox</span>
    </span>
  );
}

export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-border)]/60 bg-[var(--color-bg)]/80 backdrop-blur supports-[backdrop-filter]:bg-[var(--color-bg)]/60">
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-xl)] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-80"
          aria-label="SlothBox — home"
        >
          <Wordmark />
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/about"
            className="rounded-md px-3 py-2 text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-card)]"
          >
            About
          </Link>
          <Link
            href="/security"
            className="rounded-md px-3 py-2 text-sm text-[var(--color-fg)] transition-colors hover:bg-[var(--color-card)]"
          >
            Security
          </Link>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-1 inline-flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-fg)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-card)]"
          >
            <Github className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </nav>
      </div>
    </header>
  );
}
