// Footer — product nav, EU residency, version. Kept tight; the
// landing page is the loud part.
//
// 2026-05-08: GitHub-hosted doc links (Open Source column + threat-
// model + crypto) were removed from the chrome. The slothbox product
// site no longer surfaces its source repo — that lives on
// philipsloth.com (Philip's portfolio). Internal pages (/security,
// /abuse) remain because they're hosted on the product domain.
//
// Marked "use client" because every visible string runs through the
// LanguageContext. The static link URLs themselves are server-friendly,
// but separating them into a sibling server component just to save a
// few KB of client JS would break the per-link translation pattern —
// not worth the complexity for chrome that lives below the fold.

"use client";

import Link from "next/link";
import { APP_NAME, APP_VERSION } from "@/lib/config";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

export function Footer() {
  const { t } = useLanguage();

  return (
    <footer className="mt-24 border-t border-[var(--color-border)]/60 bg-[var(--color-bg)]">
      <div className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col gap-6 px-4 py-10 sm:px-6 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold text-[var(--color-fg)]">{APP_NAME}</p>
          <p className="mt-1 max-w-md text-sm text-[var(--color-muted)]">{t("footer.tagline")}</p>
        </div>

        <div className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm">
          <FooterColumn
            titleKey="footer.col.product"
            links={[
              { href: "/", labelKey: "footer.link.send" },
              { href: "/about", labelKey: "footer.link.about" },
              { href: "/security", labelKey: "footer.link.security" },
              { href: "/transparency", labelKey: "footer.link.transparency" },
            ]}
          />
          <FooterColumn
            titleKey="footer.col.legal"
            links={[
              // EU DSA Article 16 notice mechanism. Internal route —
              // visitors should not have to leave the site to file a
              // report.
              { href: "/abuse", labelKey: "footer.link.abuse" },
            ]}
          />
        </div>
      </div>

      <div className="border-t border-[var(--color-border)]/60">
        <div className="mx-auto flex w-full max-w-[var(--container-xl)] flex-col items-start justify-between gap-2 px-4 py-4 text-xs text-[var(--color-muted)] sm:flex-row sm:items-center sm:px-6">
          <span>
            v{APP_VERSION} · {t("footer.builtBy")}{" "}
            <a
              href="https://philipsloth.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline decoration-[var(--color-border)] underline-offset-2 hover:decoration-[var(--color-accent)]"
            >
              Philip Sloth
            </a>{" "}
            · {t("footer.madeIn")}
          </span>
          <span>{t("footer.residency")}</span>
        </div>
      </div>
    </footer>
  );
}

interface FooterLink {
  href: string;
  labelKey: TranslationKey;
  external?: boolean;
}

function FooterColumn({ titleKey, links }: { titleKey: TranslationKey; links: FooterLink[] }) {
  const { t } = useLanguage();
  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-[var(--color-muted)] uppercase">
        {t(titleKey)}
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
                {t(link.labelKey)}
              </a>
            </li>
          ) : (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-[var(--color-fg)] transition-colors hover:text-[var(--color-accent)]"
              >
                {t(link.labelKey)}
              </Link>
            </li>
          )
        )}
      </ul>
    </div>
  );
}
