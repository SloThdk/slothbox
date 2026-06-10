// Sticky top navigation — a FULL-WIDTH translucent dark-navy bar that spans
// the entire top edge (no longer a floating centred pill), taller and more
// present so the brand mark lands immediately. Hairline bottom border with a
// quiet blue under-line. Bigger wordmark on the left, two nav links +
// language toggle on the right.
//
// 2026-05-08: GitHub button removed from the chrome — the project's
// developer/source surface lives on philipsloth.com (Philip's
// portfolio), not on the SlothBox product page itself. SlothBox's
// official site reads as a polished product, not an open-source repo
// landing.
//
// Marked "use client" because the language toggle and the t() calls for
// nav labels both need the LanguageContext, which is client-only. The
// header itself doesn't render any data that benefits from SSR — it's
// pure chrome — so the cost of going client-side is zero.

"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * SlothBox wordmark. Inline SVG so we don't ship an extra HTTP request on
 * first paint. Visual: an isometric cube ("the box") rendered in brand BLUE
 * — top face lit, side faces stepping into shadow — with a near-white
 * KEYHOLE on the front: the box is locked. It mirrors the cube used as the
 * app icon, so the in-product chrome and the browser-tab / home-screen icon
 * read as ONE brand. No animal — the locked cube IS the mark.
 *
 * The face fills are LITERAL hex (not theme tokens) on purpose: this glyph
 * is reproduced byte-for-byte in three edge-rendered ImageResponse routes
 * (`app/icon.tsx`, `app/apple-icon.tsx`, `app/opengraph-image.tsx`) that
 * can't read CSS custom properties. Keeping all four on the same literals
 * is the only way the mark reads identical across every surface — when the
 * cube palette changes here, change it in those three too.
 *
 * `className` drives the rendered size (so it can be responsive via Tailwind,
 * e.g. `h-6 w-6 sm:h-8 sm:w-8`); `size` is the fixed-pixel fallback.
 */
export function CubeMark({ size = 28, className }: { size?: number; className?: string }) {
  // When a className sizes the SVG, omit width/height so CSS wins; otherwise
  // fall back to the fixed pixel size.
  const dims = className ? {} : { width: size, height: size };
  return (
    <svg viewBox="0 0 32 32" className={className} {...dims} aria-hidden>
      {/* Isometric cube: three visible faces, lit from above. Canonical BLUE
          cube palette — top lit, left mid, right in shadow. */}
      {/* Top face (rhombus) — lit, brightest. */}
      <path d="M16 3.5 L27 10 L16 16.5 L5 10 Z" fill="#5b9dff" />
      {/* Left face — mid blue. */}
      <path d="M5 10 L16 16.5 L16 29 L5 22.5 Z" fill="#3b82f6" />
      {/* Right face — darkest, in shadow. */}
      <path d="M27 10 L16 16.5 L16 29 L27 22.5 Z" fill="#1e4fc4" />
      {/* Edge highlight along the lit top so the cube reads crisp. */}
      <path
        d="M16 3.5 L27 10 L16 16.5 L5 10 Z"
        fill="none"
        stroke="#8ab8ff"
        strokeWidth={0.75}
        strokeLinejoin="round"
      />
      {/* Keyhole on the front faces — the box is locked. Near-white so it
          stays legible against the blue down to favicon scale: a round bow
          over a tapered blade, centred on the front seam. */}
      <circle cx="16" cy="20" r="2.4" fill="#eaf2ff" />
      <path d="M15.05 20.4 L16.95 20.4 L17.5 25.2 L14.5 25.2 Z" fill="#eaf2ff" />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5 sm:gap-3.5">
      <span
        className="glass inline-flex h-11 w-11 items-center justify-center rounded-xl sm:h-14 sm:w-14 sm:rounded-2xl"
        aria-hidden
      >
        {/* Cube is the brand hero — 28px on mobile, 40px at sm+. Bigger and
            more present so the mark reads custom, while the tile stays sane
            on a 320 px viewport. */}
        <CubeMark className="h-7 w-7 sm:h-10 sm:w-10" />
      </span>
      <span className="text-[1.25rem] leading-none font-bold tracking-tight text-[var(--color-fg)] sm:text-[1.65rem]">
        SlothBox
      </span>
    </span>
  );
}

export function Header() {
  const { t } = useLanguage();

  return (
    <header className="site-header-bar sticky top-0 z-50 w-full">
      {/* px-2.5 below 360px: the Danish nav ("Sikkerhed") + brand + flag
          toggle overflowed a 320px viewport by ~7px with the 16px page
          padding. ≥360px keeps the original px-4 so nothing else shifts. */}
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-2xl)] items-center justify-between px-2.5 min-[360px]:px-4 sm:h-20 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label={t("nav.homeAria")}
        >
          <Wordmark />
        </Link>

        {/* Nav cluster. Padding + text scale up at `sm` for a more present
            bar; below `sm` they stay tight so the three controls (About /
            Security / language toggle) still fit a 320 px viewport without
            wrapping. */}
        <nav className="flex items-center gap-0.5 sm:gap-3">
          <Link
            href="/about"
            className="rounded-full px-1.5 py-2 text-[0.8rem] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-glass-fill)] hover:text-[var(--color-fg)] min-[360px]:px-2 sm:px-4 sm:text-[0.95rem]"
          >
            {t("nav.about")}
          </Link>
          <Link
            href="/security"
            className="rounded-full px-1.5 py-2 text-[0.8rem] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-glass-fill)] hover:text-[var(--color-fg)] min-[360px]:px-2 sm:px-4 sm:text-[0.95rem]"
          >
            {t("nav.security")}
          </Link>
          {/* Language toggle. Sits at the end of the nav cluster as a
              site-chrome control rather than a primary action. */}
          <div className="ml-0 sm:ml-1">
            <LanguageToggle compact />
          </div>
        </nav>
      </div>
    </header>
  );
}
