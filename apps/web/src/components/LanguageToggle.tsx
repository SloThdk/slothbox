/**
 * LanguageToggle — compact two-button flag pill.
 *
 * Visual language is intentionally identical to the philipsloth-portfolio
 * + slothcv toggles: a glass-rounded pill with two flag buttons, the
 * active one ringed and full-opacity, the inactive one dimmed with a
 * hover lift. Users moving between Philip's three sites should feel the
 * same affordance.
 *
 * Mobile-first: 36×28 hit targets per flag button — fits the 44 px Apple
 * HIG minimum when you include the parent pill's padding, and shrinks
 * the slothbox header from "tight" to "still tight" rather than crowded.
 */

"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";

interface Props {
  /** Strip the drop-shadow for embedded contexts (mobile menu, etc.). */
  compact?: boolean;
}

export function LanguageToggle({ compact = false }: Props) {
  const { lang, setLang, t } = useLanguage();
  return (
    <div
      role="group"
      aria-label={t("lang.toggleAria")}
      className={`inline-flex items-center gap-0.5 rounded-full border border-[var(--color-glass-stroke)] bg-[var(--color-glass-fill)] p-0.5 backdrop-blur-md ${
        compact ? "" : "shadow-sm"
      }`}
    >
      <FlagButton
        active={lang === "en"}
        onClick={() => setLang("en")}
        title={t("lang.english")}
        src="/icons/flag-gb.svg"
      />
      <FlagButton
        active={lang === "da"}
        onClick={() => setLang("da")}
        title={t("lang.danish")}
        src="/icons/flag-dk.svg"
      />
    </div>
  );
}

function FlagButton({
  active,
  onClick,
  title,
  src,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  src: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={title}
      title={title}
      className={`grid h-7 w-9 cursor-pointer place-items-center rounded-full transition-all duration-150 ${
        active
          ? "bg-[var(--color-fg)]/10 ring-1 ring-[var(--color-fg)]/30"
          : "opacity-50 hover:-translate-y-px hover:opacity-90"
      }`}
    >
      {/* Inline <img> rather than next/image — flags are tiny static SVGs
          shipped from /public, and Next's image optimisation pipeline adds
          cost (a route on the worker) for zero gain at this resolution.
          The eslint-disable below suppresses the workspace-wide rule that
          normally insists on next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" width={20} height={14} className="h-3.5 w-5 rounded-sm object-cover" />
    </button>
  );
}
