// Top-level error boundary for the App Router. Next.js renders this whenever a
// page or layout throws during rendering. Keep the surface minimal — the
// message is GENERIC by design (full stack lives in server logs), and the
// recovery action is a `reset` button rather than a redirect.

"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // We don't ship analytics in v0.1; this hook is the slot future
    // observability lands in.
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error("[slothbox/web] uncaught", error);
    }
  }, [error]);

  return (
    <section className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 px-4 py-24 text-center sm:px-6">
      <p className="font-mono text-xs tracking-[0.3em] text-[var(--color-danger)] uppercase">
        unexpected error
      </p>
      <h1 className="font-display text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl">
        Something went wrong.
      </h1>
      <p className="text-base text-[var(--color-muted)]">
        A hiccup we didn&apos;t plan for. Try again, or refresh the page. If it keeps happening,
        mention error code{" "}
        <code className="font-mono text-[var(--color-fg)]">{error.digest ?? "unknown"}</code> when
        reporting.
      </p>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button
          variant="ghost"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
        >
          Back to home
        </Button>
      </div>
    </section>
  );
}
