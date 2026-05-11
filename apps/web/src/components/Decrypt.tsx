// Receiver-side UI. Mounts on `/s/[id]` after the page has resolved the share
// id and pulled the metadata.
//
// Two states:
//   1. ready  — file size visible, "Download + decrypt" button.
//   2. busy   — chunk-fetch + AEAD-decrypt progress bar.
//   3. done   — success state with re-download option.
//   4. error  — bad key, expired share, AEAD failure.
//
// All cryptographic operations live in `lib/download.ts`.
//
// PRIVACY NOTE: `fileName` and `mimeType` only become known to the receiver
// after the AEAD-encrypted metadata blob is decrypted (i.e. after the user
// clicks "Download + decrypt"). The pre-download UI shows only the encrypted
// payload size + expiry — by design, so a passive observer can't infer the
// content from URL inspection alone.

"use client";

import * as React from "react";
import { AlertTriangle, Check, Download, Eye, FileLock2, Key, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  DownloadError,
  downloadFile,
  notifyDownloadComplete,
  type DownloadProgressEvent,
  triggerBlobDownload,
} from "@/lib/download";
import type { ShareDescriptor } from "@/lib/api";
import { isPreviewable, Preview } from "@/components/Preview";
import { formatBytes } from "@/lib/utils";

export interface DecryptProps {
  shortId: string;
  descriptor: ShareDescriptor;
  /** Decryption key extracted from `window.location.hash`. */
  decryptionKey: Uint8Array;
}

type DecryptState =
  | { kind: "ready" }
  | { kind: "deriving" }
  | { kind: "busy"; progress: DownloadProgressEvent | null; controller: AbortController }
  | { kind: "done"; blob: Blob; fileName: string; mimeType: string; savedToDisk: boolean }
  | { kind: "error"; message: string };

export function Decrypt({ shortId, descriptor, decryptionKey }: DecryptProps) {
  const [state, setState] = React.useState<DecryptState>({ kind: "ready" });
  /**
   * Password input value (only used when `descriptor.password.enabled`).
   * Stays in React state — never logged, never sent anywhere. The
   * `password_required` early-return below also reads from here, so
   * pressing "Decrypt" with an empty input lands on a clean validation
   * message without round-tripping to crypto-core.
   */
  const [password, setPassword] = React.useState<string>("");
  /**
   * Marks the last attempt as a wrong-password one so the UI can render
   * an inline error under the password input rather than blowing away
   * the form with a generic error state.
   */
  const [passwordError, setPasswordError] = React.useState<string | null>(null);

  const passwordRequired = descriptor.password.enabled;

  const startDownload = React.useCallback(async () => {
    setPasswordError(null);
    if (passwordRequired && password.length === 0) {
      setPasswordError("Enter the password the sender gave you.");
      return;
    }

    // For password-protected shares we briefly land in `deriving` so the
    // UI can show a "hardening password" hint while Argon2id runs (the
    // single biggest CPU cost in the flow — ~250 ms on a 2022 laptop).
    // Non-password shares skip straight to `busy`.
    if (passwordRequired) setState({ kind: "deriving" });

    const controller = new AbortController();
    let derivedHandedOff = false;

    try {
      const result = await downloadFile(shortId, decryptionKey, {
        signal: controller.signal,
        ...(passwordRequired ? { password } : {}),
        onProgress: (progress) => {
          // First progress callback also doubles as the "derivation finished,
          // chunk fetch started" handover. Without this, the UI sits on
          // "deriving" until the first chunk's progress event fires, which
          // for tiny files is the only feedback the user gets.
          if (!derivedHandedOff) {
            derivedHandedOff = true;
            setState({ kind: "busy", progress, controller });
            return;
          }
          setState((prev) => (prev.kind === "busy" ? { ...prev, progress } : prev));
        },
      });

      // Decide between two post-decrypt paths:
      //   - previewable (image / PDF / text / markdown): show the
      //     preview pane FIRST, let the recipient look at the bytes
      //     before deciding to save. Lower-friction for "is this the
      //     right file" verification, especially on burn-after-read
      //     shares where saving is irreversible.
      //   - non-previewable: keep the v0.2 behaviour — auto-save to
      //     the OS download folder + show the "Save again" button.
      const canPreview = isPreviewable(result.mimeType, result.fileName);
      if (canPreview) {
        setState({
          kind: "done",
          blob: result.blob,
          fileName: result.fileName,
          mimeType: result.mimeType,
          savedToDisk: false,
        });
        toast.success("Decrypted. Preview below — save when ready.");
      } else {
        triggerBlobDownload(result.blob, result.fileName);
        setState({
          kind: "done",
          blob: result.blob,
          fileName: result.fileName,
          mimeType: result.mimeType,
          savedToDisk: true,
        });
        toast.success("Decrypted. Saved to your downloads folder.");
      }

      // Notify the gateway the download completed. For burn-after-read shares,
      // this is what triggers immediate destruction (gateway flips state and
      // signals the reaper). Errors are swallowed inside notifyDownloadComplete
      // — the reaper will pick up orphans on its sweep.
      void notifyDownloadComplete(shortId);
    } catch (err) {
      // `wrong_password` and `password_required` route back to the ready
      // state with an inline hint under the password input — keeps the
      // form's value so the user can retype the password without losing
      // context. All other error codes fall through to the generic
      // error state (the existing v0.1 behaviour).
      const code = err instanceof DownloadError ? err.code : "unknown";
      const message = err instanceof Error ? err.message : "download failed";
      if (code === "cancelled" || message === "download cancelled") {
        setState({ kind: "ready" });
        return;
      }
      if (code === "wrong_password" || code === "password_required") {
        setPasswordError(
          code === "wrong_password"
            ? "Incorrect password — try again."
            : "Enter the password the sender gave you."
        );
        setState({ kind: "ready" });
        return;
      }
      setState({ kind: "error", message });
      toast.error(message);
    }
  }, [shortId, decryptionKey, passwordRequired, password]);

  const cancel = React.useCallback(() => {
    if (state.kind === "busy") state.controller.abort();
  }, [state]);

  const downloadAgain = React.useCallback(() => {
    if (state.kind === "done") {
      triggerBlobDownload(state.blob, state.fileName);
      // Once a previewed-only file is explicitly saved, flip the
      // `savedToDisk` flag so the toast + button copy reflects the
      // new state. The Blob stays in memory so a subsequent click
      // still works without re-fetching.
      setState((prev) =>
        prev.kind === "done" && !prev.savedToDisk ? { ...prev, savedToDisk: true } : prev
      );
    }
  }, [state]);

  // fileSize comes back from the gateway as a stringified bigint for JSON
  // safety — convert here for display only.
  const fileSizeBytes = Number(descriptor.fileSize);

  return (
    <div className="flex flex-col gap-6">
      {/* File card — pre-decryption shows only payload size + expiry. */}
      <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--color-accent)] to-[var(--color-accent-2)] text-[#04221b]">
          <FileLock2 className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-[var(--color-fg)]">
            {state.kind === "done" ? state.fileName : "Encrypted payload"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {formatBytes(fileSizeBytes)} ·{" "}
            {descriptor.burnAfterRead
              ? "self-destructs after this download"
              : `expires ${formatExpiresIn(descriptor.expiresAt)}`}
            {passwordRequired ? " · password-protected" : null}
          </p>
        </div>
      </div>

      {/* State-specific body */}
      {state.kind === "ready" ? (
        <div className="flex flex-col gap-3">
          {/* ── Password prompt (only for password-protected shares) ─────── */}
          {passwordRequired ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void startDownload();
              }}
              className="flex flex-col gap-2"
            >
              <Label htmlFor="decrypt-password" className="flex items-center gap-2 leading-tight">
                <Key className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden />
                Password
              </Label>
              <Input
                id="decrypt-password"
                type="password"
                autoComplete="current-password"
                spellCheck={false}
                autoFocus
                placeholder="Password the sender gave you"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                aria-invalid={passwordError !== null}
                aria-describedby="decrypt-password-help"
              />
              <p
                id="decrypt-password-help"
                className="text-[0.7rem] leading-snug font-light text-[var(--color-muted)]"
              >
                The sender sent the password through a separate channel (Signal, SMS, in-person). It
                is checked locally — the server never sees it.
              </p>
              {passwordError ? (
                <p className="text-xs font-medium text-[var(--color-danger)]">{passwordError}</p>
              ) : null}
              <Button type="submit" size="lg" className="mt-1 w-full">
                <Download className="h-4 w-4" aria-hidden />
                Decrypt + download
              </Button>
            </form>
          ) : (
            <>
              <Button onClick={startDownload} size="lg" className="w-full">
                <Download className="h-4 w-4" aria-hidden />
                Download + decrypt
              </Button>
              <p className="text-center text-xs text-[var(--color-muted)]">
                Decryption runs in your browser. Nothing leaves this tab.
              </p>
            </>
          )}
        </div>
      ) : null}

      {state.kind === "deriving" ? (
        <div className="flex flex-col gap-3">
          <Progress indeterminate />
          <div className="flex items-center justify-center text-xs">
            <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
              Hardening password (Argon2id)…
            </span>
          </div>
        </div>
      ) : null}

      {state.kind === "busy" ? (
        <div className="flex flex-col gap-3">
          <Progress value={state.progress?.fraction ?? 0} indeterminate={!state.progress} />
          <div className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
              <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
              {state.progress
                ? `${Math.floor(state.progress.fraction * 100)}% downloaded + decrypted`
                : "fetching first chunk…"}
            </span>
            <span className="text-[var(--color-muted)]">
              {state.progress
                ? `${state.progress.chunksDownloaded}/${state.progress.chunksTotal} chunks`
                : "verifying key…"}
            </span>
          </div>
          <Button variant="ghost" onClick={cancel} className="self-end">
            Cancel
          </Button>
        </div>
      ) : null}

      {state.kind === "done" ? (
        <div className="flex flex-col gap-4">
          {/* Preview pane appears for image / PDF / text / markdown
              filetypes; renders nothing otherwise. The Preview
              component handles its own URL.createObjectURL lifecycle
              (revokes on unmount), so it's safe to leave mounted as
              long as the parent done-state holds the Blob. */}
          {!state.savedToDisk ? (
            <Preview blob={state.blob} fileName={state.fileName} mimeType={state.mimeType} />
          ) : null}

          <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-card))] p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
              {state.savedToDisk ? (
                <Check className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
              ) : (
                <Eye className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
              )}
              {state.savedToDisk
                ? `Decrypted and saved.${descriptor.burnAfterRead ? " Share has been destroyed." : " You can close this tab."}`
                : `Decrypted — preview above. Save when you're ready.${descriptor.burnAfterRead ? " The share is destroyed regardless of whether you save." : ""}`}
            </p>
            <div>
              <Button variant={state.savedToDisk ? "secondary" : "primary"} onClick={downloadAgain}>
                <Download className="h-4 w-4" aria-hidden />
                {state.savedToDisk ? "Save again" : "Save to downloads"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_50%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-card))] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" aria-hidden />
            {state.message}
          </p>
          <div>
            <Button variant="secondary" onClick={() => setState({ kind: "ready" })}>
              Try again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
