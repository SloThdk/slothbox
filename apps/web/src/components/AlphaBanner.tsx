// AlphaBanner — unmissable v0.1-alpha disclosure that pins to the top of every
// route until the visitor explicitly acknowledges it.
//
// Why this exists (security policy, not marketing):
// -------------------------------------------------
// The v0.1 access model treats the share's `shortId` as the access secret —
// anyone who sees the share URL can destroy the share or trigger its
// burn-after-read. That is a documented design choice (per-share owner tokens
// land in v0.5), but documenting a foot-gun does not unload it. A public
// landing-page reader who skips SECURITY.md and uploads anything legally
// sensitive is exactly the user we owe an explicit warning before they click
// the upload zone.
//
// Display contract:
//   - Pinned to the top of `<body>` (above the Header) so a casual visitor
//     can't miss it on first paint.
//   - Stays visible until the visitor clicks the dismiss button. Persisted
//     in localStorage so it doesn't re-appear on every page load forever —
//     the disclosure obligation is satisfied by one acknowledged read.
//   - Localised through the same LanguageContext as the rest of the chrome.
//   - Never re-shown automatically. If the project enters a worse-warning
//     state (a fresh CVE, a real incident), bump `STORAGE_KEY_VERSION` to
//     force the banner back on for everyone.

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldAlert, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { GITHUB_URL } from "@/lib/config";

// Bump the version when the warning copy changes substantively — this resets
// the localStorage flag for every existing visitor so they re-acknowledge the
// new wording.
const STORAGE_KEY = "slothbox.alphaBanner.dismissed.v1";

export function AlphaBanner() {
  const { t } = useLanguage();
  // Initial state: hidden during SSR + first hydration tick. The acknowledged
  // bit is read from localStorage in an effect so server and client agree on
  // the first paint (no hydration mismatch warning).
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    try {
      const dismissed = window.localStorage.getItem(STORAGE_KEY) === "true";
      setHidden(dismissed);
    } catch {
      // localStorage unavailable (private mode, sandbox iframe). Fail-loud:
      // show the banner. Worst case the user sees it on every page; better
      // than silently hiding a security disclosure.
      setHidden(false);
    }
  }, []);

  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "true");
    } catch {
      // Storage write failure is acceptable; the banner just re-appears on
      // the next reload, which is the correct fail-mode for a security
      // disclosure under storage pressure.
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative z-50 border-b border-amber-500/30 bg-amber-500/[0.08] backdrop-blur-md"
    >
      <div className="mx-auto flex w-full max-w-[var(--container-xl)] items-start gap-3 px-4 py-3 sm:px-6 sm:py-3.5">
        {/* Severity icon — amber not red, because v0.1 is operational and
            audited at the primitive level; the warning is about the access
            model, not a known break. */}
        <ShieldAlert
          className="mt-0.5 h-5 w-5 shrink-0 text-amber-400"
          aria-hidden
          strokeWidth={1.8}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[0.85rem] font-medium text-[var(--color-fg)]">
            {t("alphaBanner.title")}
          </p>
          <p className="mt-1 text-[0.8rem] leading-relaxed font-light text-[var(--color-fg-2)]">
            {t("alphaBanner.body")}{" "}
            <a
              href={`${GITHUB_URL}/blob/master/SECURITY.md`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-300 underline-offset-4 hover:underline"
            >
              {t("alphaBanner.readMore")}
            </a>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t("alphaBanner.dismiss")}
          className="ml-1 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 text-[0.75rem] font-medium text-amber-200 transition-colors hover:bg-amber-400/20"
        >
          {t("alphaBanner.dismiss")}
          <X className="h-3 w-3" aria-hidden strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
