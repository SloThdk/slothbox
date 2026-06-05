// Sticky top navigation — translucent glass strip with a hairline bottom
// border, exactly the visionOS / macOS-Tahoe sheet aesthetic. Wordmark on
// the left, two minimal nav links + language toggle on the right.
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
 * first paint. Visual: an isometric cube ("the box") rendered in the brand
 * aurora-teal — top face lit, side faces stepping into shadow. It mirrors
 * the frosted 3D-glass cube used as the app icon, so the in-product chrome
 * and the browser-tab / home-screen icon read as ONE brand. No animal, no
 * decoration — the cube IS the mark.
 *
 * Single brand mark across four surfaces: this Wordmark, the favicon at
 * `app/icon.tsx`, the apple-touch-icon at `app/apple-icon.tsx`, and the OG
 * image at `app/opengraph-image.tsx`. When the glyph changes here, change
 * it in the other three too — the coords are deliberately identical.
 */
export function CubeMark({ size = 22 }: { size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      {/* Isometric cube: three visible faces. Top face carries the bright
          accent fill (lit from above), the left face a soft tint, the
          right face stays dark — real directional light, not a flat icon. */}
      {/* Top face (rhombus) — brightest. */}
      <path d="M16 3.5 L27 10 L16 16.5 L5 10 Z" fill="var(--color-accent)" />
      {/* Left face. */}
      <path d="M5 10 L16 16.5 L16 29 L5 22.5 Z" fill="var(--color-accent-deep)" />
      {/* Right face — darkest, in shadow. */}
      <path d="M27 10 L16 16.5 L16 29 L27 22.5 Z" fill="var(--color-on-accent)" />
      {/* Edge highlight along the top to make the glass read crisp. */}
      <path
        d="M16 3.5 L27 10 L16 16.5 L5 10 Z"
        fill="none"
        stroke="var(--color-accent-strong)"
        strokeWidth={0.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="glass inline-flex h-10 w-10 items-center justify-center rounded-xl"
        aria-hidden
      >
        <CubeMark size={22} />
      </span>
      <span className="text-[1.2rem] leading-none font-semibold tracking-tight text-[var(--color-fg)]">
        SlothBox
      </span>
    </span>
  );
}

export function Header() {
  const { t } = useLanguage();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[var(--color-glass-stroke)] bg-[var(--color-bg)]/70 backdrop-blur-xl">
      <div className="mx-auto flex h-16 w-full max-w-[var(--container-xl)] items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 transition-opacity hover:opacity-90"
          aria-label={t("nav.homeAria")}
        >
          <Wordmark />
        </Link>

        {/* Nav cluster. Tight padding + smaller text below `sm` so the
            three controls (About / Security / language toggle) fit on a
            320 px viewport — measured at 366 px scrollWidth on a 320 px
            viewport before this tightening. The `sm:` breakpoint
            (640 px) restores the comfortable touch-target sizing. */}
        <nav className="flex items-center gap-0.5 sm:gap-2">
          <Link
            href="/about"
            className="rounded-full px-2 py-2 text-[0.8rem] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-glass-fill)] hover:text-[var(--color-fg)] sm:px-3.5 sm:text-[0.85rem]"
          >
            {t("nav.about")}
          </Link>
          <Link
            href="/security"
            className="rounded-full px-2 py-2 text-[0.8rem] font-medium text-[var(--color-muted)] transition-colors hover:bg-[var(--color-glass-fill)] hover:text-[var(--color-fg)] sm:px-3.5 sm:text-[0.85rem]"
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
