// 404 page — keep it dry; the visitor probably wants to retry the URL.
//
// Client component so the LanguageProvider's t() is in scope. Next.js
// renders this for unmatched routes and for `notFound()` calls — same
// surface in both cases.

"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export default function NotFound() {
  const { t } = useLanguage();
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-[var(--color-muted)] uppercase">404</p>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
        {t("notFound.title")}
      </h1>
      <p className="text-base text-[var(--color-muted)]">
        {t("notFound.bodyBefore")} <code className="font-mono">#</code>
        {t("notFound.bodyAfter")}
      </p>
      <Button asChild>
        <Link href="/">{t("common.backHome")}</Link>
      </Button>
    </section>
  );
}
