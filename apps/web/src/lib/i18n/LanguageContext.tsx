/**
 * LanguageContext — the single client-side source of truth for the user's
 * locale preference on slothbox.philipsloth.com.
 *
 * Mirror of the philipsloth-portfolio + slothcv LanguageContexts so the
 * three sites share a transferable mental model. Differences kept to the
 * minimum: localStorage key is namespaced (`slothbox.lang`) so a future
 * shared-domain deployment doesn't collide with the portfolio's preference.
 *
 * Usage:
 *
 *   const { lang, setLang, toggle, t } = useLanguage();
 *   <p>{t("hero.copy.before")}</p>
 *
 * SSR notes:
 *   - The provider always emits English on the server, then swaps to the
 *     persisted / detected locale during the first client effect. This
 *     keeps server and client HTML identical at hydration time so React
 *     does not throw a hydration mismatch warning. The flicker is the
 *     intentional cost of avoiding the alternative (cookie-based locale
 *     forwarded to the server, which would force every page to be
 *     uncacheable AND require server-side translation tables in scope).
 */

"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { TRANSLATIONS, type Lang, type TranslationKey } from "./translations";

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  /**
   * Translate a key into the active locale.
   *
   * - Falls back to English then to the literal key string so a broken
   *   entry never renders as the React-default "undefined" / blank.
   * - Supports `{name}` interpolation when an `args` object is passed —
   *   minimal templating, no plural rules, no ICU.
   */
  t: (key: TranslationKey, args?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// Namespaced storage key. Keep the namespace prefix even on a single-app
// deployment — it makes the provenance of a stray localStorage entry
// obvious in DevTools.
const STORAGE_KEY = "slothbox.lang";

/** Resolve the boot-time locale: persisted > navigator.language > "en". */
function detectInitialLang(): Lang {
  // SSR: we never run on the server in this branch, but guard anyway so
  // the function can be called from any context (e.g. tests).
  if (typeof window === "undefined") return "en";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "da") return stored;
  } catch {
    // localStorage may be unavailable: private mode, sandboxed iframe,
    // server-side render, certain mobile browsers under "block all
    // cookies" mode. Silent fallback is correct here.
  }
  if (typeof navigator !== "undefined") {
    const nav = navigator.language?.toLowerCase() ?? "";
    if (nav.startsWith("da")) return "da";
  }
  return "en";
}

/** Replace `{name}` placeholders with values from `args`. Unknown
 *  placeholders pass through verbatim so a missing variable surfaces
 *  visibly during development rather than producing a silent empty
 *  string in production. */
function interpolate(template: string, args: Record<string, string | number> | undefined): string {
  if (!args) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) =>
    name in args ? String(args[name]) : `{${name}}`
  );
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("en");
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from storage / navigator on first client render. Doing this
  // in an effect (rather than the initial useState) keeps SSR markup
  // stable — the server always emits English, then the client swaps
  // post-hydration. React-19 flushes the swap synchronously so the
  // English flash is invisible to the eye in 99% of cases.
  useEffect(() => {
    setLangState(detectInitialLang());
    setHydrated(true);
  }, []);

  // Persist to localStorage AND reflect on `<html lang="...">` so
  // assistive tech / browser translate-prompts pick the right language.
  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // Ignore storage failures: same reasons as detectInitialLang.
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang, hydrated]);

  const setLang = useCallback((next: Lang) => setLangState(next), []);
  const toggle = useCallback(() => setLangState((l) => (l === "en" ? "da" : "en")), []);

  const t = useCallback(
    (key: TranslationKey, args?: Record<string, string | number>) => {
      const entry = TRANSLATIONS[key];
      // Defensive: if the key were ever called with a bad cast, render
      // the key literal so the bug is loud, not silent.
      if (!entry) return String(key);
      const raw = entry[lang] ?? entry.en ?? String(key);
      return interpolate(raw, args);
    },
    [lang]
  );

  const value = useMemo(() => ({ lang, setLang, toggle, t }), [lang, setLang, toggle, t]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/**
 * Hook into the language context. Falls back to a passive English-only
 * shim when called outside a provider so SSR-rendered components or unit
 * tests don't have to wrap themselves to compile.
 */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    return {
      lang: "en",
      setLang: () => {},
      toggle: () => {},
      t: (key, args) => interpolate(TRANSLATIONS[key]?.en ?? String(key), args),
    };
  }
  return ctx;
}
