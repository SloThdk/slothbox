// 404 page — keep it dry; the visitor probably wants to retry the URL.

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-[var(--color-muted)] uppercase">404</p>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
        That share doesn&apos;t exist.
      </h1>
      <p className="text-base text-[var(--color-muted)]">
        It may have expired, been burned after a previous download, or the URL may be missing the
        part after the <code className="font-mono">#</code>. Most chat clients strip URL fragments —
        ask the sender to copy and paste the link directly.
      </p>
      <Button asChild>
        <Link href="/">Back to home</Link>
      </Button>
    </section>
  );
}
