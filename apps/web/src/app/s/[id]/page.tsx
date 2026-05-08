// Receiver page. URL pattern: `/s/<shortId>#key=<base64url>`.
//
// MUST be a client component end-to-end — `window.location.hash` is not
// available on the server, and that hash is the entire trust boundary.

"use client";

import * as React from "react";
import Link from "next/link";
import { use as usePromise } from "react";
import { AlertTriangle, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Decrypt } from "@/components/Decrypt";
import { fetchShareMetadata, extractKeyFromHash } from "@/lib/download";
import type { ShareDescriptor } from "@/lib/api";

type Status =
  | { kind: "loading" }
  | { kind: "ready"; descriptor: ShareDescriptor; key: Uint8Array }
  | { kind: "missing-key" }
  | { kind: "error"; message: string };

interface PageProps {
  // Next 15 ships params as a Promise — the React `use()` hook unwraps it.
  params: Promise<{ id: string }>;
}

/**
 * Outer page component — wraps the receiver UI in a Suspense boundary because
 * Next 15 requires one whenever a client component calls `use()` on the
 * params promise. The boundary fallback mirrors the loading state of the
 * inner component so first-paint matches what eventually renders.
 */
export default function ShareReceiverPage({ params }: PageProps) {
  return (
    <React.Suspense fallback={<ReceiverFallback />}>
      <ShareReceiver params={params} />
    </React.Suspense>
  );
}

function ReceiverFallback() {
  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <div className="space-y-2">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-border)]" />
        <div className="h-10 w-3/4 animate-pulse rounded bg-[var(--color-border)]" />
      </div>
      <div className="h-48 w-full animate-pulse rounded-xl bg-[var(--color-border)]" />
    </section>
  );
}

function ShareReceiver({ params }: PageProps) {
  // Unwrap the param Promise (Next 15 contract).
  const { id } = usePromise(params);
  const shortId = decodeURIComponent(id);

  const [status, setStatus] = React.useState<Status>({ kind: "loading" });

  React.useEffect(() => {
    let cancelled = false;

    // Pull the key from the URL fragment. This is the ONLY place in the app
    // that touches `window.location.hash`. The fragment never reaches the
    // server, by browser-spec design.
    const key = extractKeyFromHash(typeof window !== "undefined" ? window.location.hash : "");
    if (!key) {
      setStatus({ kind: "missing-key" });
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const descriptor = await fetchShareMetadata(shortId);
        if (!cancelled) setStatus({ kind: "ready", descriptor, key });
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "share not found";
        setStatus({ kind: "error", message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [shortId]);

  return (
    <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Encrypted share
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-[var(--color-fg)] sm:text-4xl">
          Decrypt + download
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          The decryption happens in this tab. The unlock key was passed to you in the URL fragment
          and never reaches our servers.
        </p>
      </header>

      <Card>
        <CardContent className="p-6 sm:p-8">
          {status.kind === "loading" ? (
            <LoadingState />
          ) : status.kind === "missing-key" ? (
            <MissingKeyState />
          ) : status.kind === "error" ? (
            <ErrorState message={status.message} />
          ) : (
            <Decrypt shortId={shortId} descriptor={status.descriptor} decryptionKey={status.key} />
          )}
        </CardContent>
      </Card>

      <ReceiverFootnote />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Sub-states
// ---------------------------------------------------------------------------

function LoadingState() {
  return (
    <div className="animate-in-fade flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 animate-pulse rounded-lg bg-[var(--color-border)]" />
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-3 w-1/2 animate-pulse rounded bg-[var(--color-border)]" />
          <div className="h-3 w-1/3 animate-pulse rounded bg-[var(--color-border)]" />
        </div>
      </div>
      <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-border)]" />
    </div>
  );
}

function MissingKeyState() {
  return (
    <div className="flex flex-col gap-3 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
        The decryption key is missing.
      </h2>
      <p className="text-sm text-[var(--color-muted)]">
        Your URL doesn&apos;t contain the part after the <code className="font-mono">#</code>. Some
        chat apps strip it. Ask the sender to copy and paste the full link directly.
      </p>
      <Link
        href="/"
        className="mx-auto mt-2 text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-3 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] text-[var(--color-danger)]">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </span>
      <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
        We couldn&apos;t load this share.
      </h2>
      <p className="text-sm text-[var(--color-muted)]">{message}</p>
      <p className="text-xs text-[var(--color-muted)]">
        The most likely cause: the share has expired, was burned after a previous download, or the
        id is wrong.
      </p>
      <Link
        href="/"
        className="mx-auto mt-2 text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
      >
        Back to home
      </Link>
    </div>
  );
}

function ReceiverFootnote() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-card)]/60 p-4 text-xs text-[var(--color-muted)]">
      <Shield className="h-4 w-4 shrink-0 text-[var(--color-accent)]" aria-hidden />
      <p className="leading-relaxed">
        SlothBox runs in the EU. Your browser performs the decryption and the key never leaves this
        tab.
      </p>
    </div>
  );
}
