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
 * first paint. Visual: a 9×9 box rendered in the brand sky-blue accent
 * with a single keyhole cut from its centre. The shape encodes "the box"
 * directly — no animal, no decoration. The keyhole is also a stylised
 * lowercase "s" if you squint, doubling as a monogram.
 *
 * Single brand mark across three surfaces: this Wordmark, the favicon
 * at `app/icon.svg`, and the apple-icon + OG image renderers under
 * `app/`. When the glyph changes here, change it there too — the
 * coords are deliberately identical so the in-product chrome and the
 * browser-tab chrome read as the same brand.
 */
function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className="glass inline-flex h-9 w-9 items-center justify-center rounded-lg"
        aria-hidden
      >
        <svg viewBox="0 0 32 32" width={20} height={20}>
          {/* Box outline — square with rounded corners. */}
          <rect
            x={6}
            y={6}
            width={20}
            height={20}
            rx={3.5}
            stroke="var(--color-accent)"
            strokeWidth={1.6}
            fill="none"
          />
          {/* Keyhole — circle + descending notch, centred. The icon reads
              first as "secured box", second as a small letterform. */}
          <circle cx={16} cy={14.5} r={2} fill="var(--color-accent)" />
          <rect x={15} y={14.5} width={2} height={5} fill="var(--color-accent)" />
        </svg>
      </span>
      <span className="text-[1.15rem] leading-none font-medium tracking-tight text-[var(--color-fg)]">
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
