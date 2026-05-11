// /my-shares — sender-side dashboard.
//
// Lists every share the current device has created (read from
// `localStorage` under `slothbox.myShares.v1`). For each entry the
// sender can:
//
//   * Revoke it now — fires destroyShare with the locally-held token,
//     drops the entry, and updates the row state to "destroyed".
//   * Remove from device only — drops the localStorage entry without
//     a server call (useful for shares the sender knows are already
//     expired but never got cleaned up on this tab).
//
// The page deliberately:
//   * Does NOT show the share URL (the `#key=` fragment never landed
//     in localStorage on purpose — re-displaying it would mean the
//     sender's recently-opened-tabs cache and any cross-device sync
//     gets a copy. The URL is the sender's responsibility to keep.)
//   * Does NOT call the server to look up state. The list is a local
//     ledger; the source of truth for "is this share still alive" is
//     the server, but the destroy call surfaces 404 cleanly so we
//     don't need an extra round-trip up front.
//   * Auto-prunes expired entries on mount so the list isn't
//     polluted by shares the server already pruned.

"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, FileLock2, Lock, ShieldOff, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError, destroyShare } from "@/lib/api";
import { type MySharesEntry, pruneExpired, removeShare } from "@/lib/myShares";
import { formatBytes } from "@/lib/utils";

type RowState = { kind: "idle" } | { kind: "revoking" } | { kind: "revoked" } | { kind: "removed" };

export default function MySharesPage() {
  const [entries, setEntries] = React.useState<MySharesEntry[]>([]);
  // Per-row state map keyed by shortId. A row's state lifecycle is
  // idle → revoking → revoked (server hit) OR idle → removed (local only).
  // We never resurrect a row, so the map only grows; the entry list itself
  // shrinks as rows finalise.
  const [rowStates, setRowStates] = React.useState<Record<string, RowState>>({});
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Auto-prune expired entries on first paint. Effect runs only in
    // the browser (the file is "use client") so `localStorage` access
    // is safe — but the `mounted` flag below still gates rendering so
    // the SSR-vs-CSR HTML doesn't mismatch on first paint.
    setEntries(pruneExpired());
    setMounted(true);
  }, []);

  const updateRow = React.useCallback((shortId: string, next: RowState) => {
    setRowStates((prev) => ({ ...prev, [shortId]: next }));
  }, []);

  const handleRevoke = React.useCallback(
    async (entry: MySharesEntry) => {
      if (
        !window.confirm(
          `Revoke "${entry.fileName}" now? Anyone holding the link will see a not-found page.`
        )
      ) {
        return;
      }
      updateRow(entry.shortId, { kind: "revoking" });
      try {
        await destroyShare(entry.shortId, entry.revokeToken);
        removeShare(entry.shortId);
        updateRow(entry.shortId, { kind: "revoked" });
        toast.success(`"${entry.fileName}" revoked.`);
      } catch (err) {
        const message =
          err instanceof ApiError
            ? `Revoke failed (HTTP ${err.status}): ${err.message}`
            : "Revoke failed — try again or wait for the share to expire.";
        toast.error(message);
        updateRow(entry.shortId, { kind: "idle" });
        // eslint-disable-next-line no-console
        console.warn("destroyShare error", err);
      }
    },
    [updateRow]
  );

  const handleRemoveLocal = React.useCallback(
    (entry: MySharesEntry) => {
      // Local-only removal — drops the device's record of the share
      // but doesn't touch the server. Useful when the sender knows
      // the share already expired (we auto-prune on mount, but a
      // share that expires WHILE the dashboard is open ends up here).
      removeShare(entry.shortId);
      updateRow(entry.shortId, { kind: "removed" });
    },
    [updateRow]
  );

  // Active rows = entries not yet revoked or removed on THIS render.
  // We don't filter `entries` directly because the user might want to
  // see the "revoked" / "removed" status linger for a second before
  // the row visually disappears. The list re-renders with the updated
  // rowStates and the rows handle their own collapse states inline.
  const visible = mounted ? entries.filter((e) => rowStates[e.shortId]?.kind !== "removed") : [];

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="text-xs font-semibold tracking-wider text-[var(--color-accent)] uppercase">
          Sender dashboard
        </p>
        <h1 className="font-display mt-2 text-3xl font-semibold text-[var(--color-fg)] sm:text-4xl">
          My shares
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Shares created from this browser, this device. The list lives in your browser&apos;s local
          storage — we don&apos;t keep a sender index on the server. Revoke tokens are also stored
          locally.
        </p>
      </header>

      {!mounted ? (
        // Match the SSR fallback so the initial paint doesn't flash an
        // empty-state card for a frame before the localStorage read
        // resolves on the client.
        <Card>
          <CardContent className="p-6 sm:p-8">
            <div className="flex flex-col gap-3">
              <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-border)]" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-border)]" />
              <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--color-border)]" />
            </div>
          </CardContent>
        </Card>
      ) : visible.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center sm:p-10">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
              <ShieldOff className="h-6 w-6" aria-hidden />
            </span>
            <h2 className="font-display text-xl font-semibold text-[var(--color-fg)]">
              No shares on this device.
            </h2>
            <p className="max-w-md text-sm text-[var(--color-muted)]">
              Shares you create from this browser will show up here, with a one-click revoke. If you
              sent a share from a different device, manage it from that device — there&apos;s no
              central account.
            </p>
            <Link
              href="/"
              className="mt-2 text-sm font-medium text-[var(--color-accent)] underline-offset-4 hover:underline"
            >
              Send your first file
            </Link>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((entry) => (
            <ShareRow
              key={entry.shortId}
              entry={entry}
              state={rowStates[entry.shortId] ?? { kind: "idle" }}
              onRevoke={() => handleRevoke(entry)}
              onRemoveLocal={() => handleRemoveLocal(entry)}
            />
          ))}
        </ul>
      )}

      <footer className="rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-card)]/60 p-4 text-xs text-[var(--color-muted)]">
        <p className="leading-relaxed">
          <strong className="text-[var(--color-fg)]">Lost a revoke token?</strong> Without the
          token, a share can only end via its TTL (which you set when sending) or via the
          recipient&apos;s burn-after-read download. We can&apos;t help recover one — the trust
          model forbids it.
        </p>
      </footer>
    </section>
  );
}

// ----------------------------------------------------------------------------
// Per-row UI
// ----------------------------------------------------------------------------

function ShareRow({
  entry,
  state,
  onRevoke,
  onRemoveLocal,
}: {
  entry: MySharesEntry;
  state: RowState;
  onRevoke: () => void;
  onRemoveLocal: () => void;
}) {
  const isRevoking = state.kind === "revoking";
  const isRevoked = state.kind === "revoked";
  const expiresHuman = React.useMemo(() => formatExpiresIn(entry.expiresAt), [entry.expiresAt]);

  return (
    <li className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-[#04221b]">
            <FileLock2 className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-[var(--color-fg)]">{entry.fileName}</p>
            <p className="truncate text-xs text-[var(--color-muted)]">
              {formatBytes(entry.fileSize)} · expires {expiresHuman}
              {entry.burnAfterRead ? " · burn after read" : ""}
              {entry.passwordProtected ? " · password-protected" : ""}
            </p>
            <p className="mt-1 font-mono text-[10px] text-[var(--color-muted)]">
              <Lock className="mr-1 inline h-3 w-3" aria-hidden />
              id: {entry.shortId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isRevoked ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--color-danger)_15%,transparent)] px-2.5 py-1 text-xs font-medium text-[var(--color-danger)]">
              <Trash2 className="h-3 w-3" aria-hidden />
              Revoked
            </span>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={onRevoke} disabled={isRevoking}>
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                {isRevoking ? "Revoking…" : "Revoke"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemoveLocal}
                disabled={isRevoking}
                aria-label="Remove from this device without contacting the server"
                title="Remove from this device"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Inline notice — surfaces once the row hits a terminal state.
          We keep the row visible after a successful revoke (with the
          "Revoked" pill above) so the sender sees the result, then the
          card stays until the user navigates away. Per-row collapse
          would be flash-y; keeping it visible is the better UX. */}
      {isRevoked ? (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <AlertTriangle className="h-3 w-3 text-[var(--color-danger)]" aria-hidden />
          The encrypted blob is queued for purge on the next reaper sweep (~60 s).
        </p>
      ) : null}
    </li>
  );
}

// ----------------------------------------------------------------------------
// Small helpers — kept inline since they're only used by the row.
// ----------------------------------------------------------------------------

function formatExpiresIn(iso: string): string {
  try {
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "soon";
    const hours = Math.round(ms / (1000 * 60 * 60));
    if (hours < 24) return `in ${hours}h`;
    const days = Math.round(hours / 24);
    return `in ${days}d`;
  } catch {
    return "soon";
  }
}
