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
  type DownloadErrorCode,
  downloadFile,
  notifyDownloadComplete,
  type DownloadProgressEvent,
  triggerBlobDownload,
} from "@/lib/download";
import type { ShareDescriptor } from "@/lib/api";
import { isPreviewable, Preview } from "@/components/Preview";
import { formatBytes } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageContext";

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
  | { kind: "error"; messageKey: DecryptErrorMessageKey };

/**
 * The decrypt-error translation keys the receiver UI can render. Each maps to a
 * specific DownloadErrorCode so the actionable message in `download.ts` (e.g.
 * "already delivered — ask the sender to re-upload", "failed its integrity
 * check") actually reaches the user instead of a single generic line.
 */
type DecryptErrorMessageKey =
  | "decrypt.error.downloadFailed"
  | "decrypt.error.shareNotFound"
  | "decrypt.error.keyInvalid"
  | "decrypt.error.transport"
  | "decrypt.error.metadata"
  | "decrypt.error.integrity"
  | "decrypt.error.alreadyUsed";

/** Map a DownloadErrorCode to the receiver-facing message key. */
function downloadErrorMessageKey(code: DownloadErrorCode): DecryptErrorMessageKey {
  switch (code) {
    case "share_not_found":
      return "decrypt.error.shareNotFound";
    case "key_invalid":
      return "decrypt.error.keyInvalid";
    case "transport":
      return "decrypt.error.transport";
    case "metadata":
      return "decrypt.error.metadata";
    case "decrypt":
      return "decrypt.error.integrity";
    case "already_used":
      return "decrypt.error.alreadyUsed";
    default:
      // password_required / wrong_password / cancelled are handled before this
      // is reached; unknown falls back to the generic message.
      return "decrypt.error.downloadFailed";
  }
}

export function Decrypt({ shortId, descriptor, decryptionKey }: DecryptProps) {
  const { t, lang } = useLanguage();
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
   * the form with a generic error state. We hold a translation KEY so
   * a mid-decrypt locale toggle re-renders the error in the new language
   * instead of stranding the user with an English string.
   */
  const [passwordErrorKey, setPasswordErrorKey] = React.useState<
    "decrypt.password.errorRequired" | "decrypt.password.errorWrong" | null
  >(null);

  const passwordRequired = descriptor.password.enabled;

  const startDownload = React.useCallback(async () => {
    setPasswordErrorKey(null);
    if (passwordRequired && password.length === 0) {
      setPasswordErrorKey("decrypt.password.errorRequired");
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
        toast.success(t("decrypt.toast.previewReady"));
      } else {
        triggerBlobDownload(result.blob, result.fileName);
        setState({
          kind: "done",
          blob: result.blob,
          fileName: result.fileName,
          mimeType: result.mimeType,
          savedToDisk: true,
        });
        toast.success(t("decrypt.toast.savedAuto"));
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
      const code: DownloadErrorCode = err instanceof DownloadError ? err.code : "unknown";
      const rawMessage = err instanceof Error ? err.message : "download failed";
      if (code === "cancelled" || rawMessage === "download cancelled") {
        setState({ kind: "ready" });
        return;
      }
      if (code === "wrong_password" || code === "password_required") {
        setPasswordErrorKey(
          code === "wrong_password"
            ? "decrypt.password.errorWrong"
            : "decrypt.password.errorRequired"
        );
        setState({ kind: "ready" });
        return;
      }
      // All remaining codes render a distinct, actionable message keyed off the
      // DownloadErrorCode (truncation/tamper, already-used, not-found, etc.).
      setState({ kind: "error", messageKey: downloadErrorMessageKey(code) });
      toast.error(t("decrypt.toast.downloadFailed"));
    }
  }, [shortId, decryptionKey, passwordRequired, password, t]);

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

  // Build the "expires in 24h" / "selv-destruerer..." chip text. Done
  // outside JSX so the conditional doesn't tangle the meta-row.
  const expiryLabel = descriptor.burnAfterRead
    ? t("decrypt.file.burnAfterRead")
    : t("decrypt.file.expires", { when: formatExpiresIn(descriptor.expiresAt, t, lang) });

  return (
    <div className="flex flex-col gap-6">
      {/* File card — pre-decryption shows only payload size + expiry. */}
      <div className="flex items-center gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 sm:p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]">
          <FileLock2 className="h-6 w-6" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium text-[var(--color-fg)]">
            {state.kind === "done" ? state.fileName : t("decrypt.file.encryptedPayload")}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {formatBytes(fileSizeBytes)} · {expiryLabel}
            {passwordRequired ? ` · ${t("decrypt.file.passwordProtected")}` : null}
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
                {t("decrypt.password.label")}
              </Label>
              <Input
                id="decrypt-password"
                type="password"
                // `off`, not `current-password` — this is a per-share
                // out-of-band password, not the recipient's site
                // password. Browsers must NOT offer to save it (it's
                // single-use) and MUST NOT autofill another site's
                // saved password into the field. The two
                // password-manager opt-out attributes below cover
                // 1Password and LastPass; spec-compliant managers
                // already obey `autoComplete=off`.
                autoComplete="off"
                data-1p-ignore="true"
                data-lpignore="true"
                spellCheck={false}
                autoFocus
                placeholder={t("decrypt.password.placeholder")}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordErrorKey) setPasswordErrorKey(null);
                }}
                aria-invalid={passwordErrorKey !== null}
                aria-describedby="decrypt-password-help"
              />
              <p
                id="decrypt-password-help"
                className="text-[0.7rem] leading-snug font-light text-[var(--color-muted)]"
              >
                {t("decrypt.password.help")}
              </p>
              {passwordErrorKey ? (
                <p className="text-xs font-medium text-[var(--color-danger)]">
                  {t(passwordErrorKey)}
                </p>
              ) : null}
              <Button type="submit" size="lg" className="mt-1 w-full">
                <Download className="h-4 w-4" aria-hidden />
                {t("decrypt.button.passwordSubmit")}
              </Button>
            </form>
          ) : (
            <>
              <Button onClick={startDownload} size="lg" className="w-full">
                <Download className="h-4 w-4" aria-hidden />
                {t("decrypt.button.download")}
              </Button>
              <p className="text-center text-xs text-[var(--color-muted)]">
                {t("decrypt.hint.localOnly")}
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
              {t("decrypt.status.deriving")}
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
                ? t("decrypt.status.percent", { pct: Math.floor(state.progress.fraction * 100) })
                : t("decrypt.status.fetchingFirst")}
            </span>
            <span className="text-[var(--color-muted)]">
              {state.progress
                ? t("decrypt.status.chunks", {
                    done: state.progress.chunksDownloaded,
                    total: state.progress.chunksTotal,
                  })
                : t("decrypt.status.verifyingKey")}
            </span>
          </div>
          <Button variant="ghost" onClick={cancel} className="self-end">
            {t("common.cancel")}
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
                ? descriptor.burnAfterRead
                  ? t("decrypt.done.savedBurned")
                  : t("decrypt.done.savedClose")
                : descriptor.burnAfterRead
                  ? t("decrypt.done.previewBurned")
                  : t("decrypt.done.previewKeep")}
            </p>
            <div>
              <Button variant={state.savedToDisk ? "secondary" : "primary"} onClick={downloadAgain}>
                <Download className="h-4 w-4" aria-hidden />
                {state.savedToDisk
                  ? t("decrypt.button.saveAgain")
                  : t("decrypt.button.saveToDownloads")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-danger)_50%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-danger)_10%,var(--color-card))] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <AlertTriangle className="h-4 w-4 text-[var(--color-danger)]" aria-hidden />
            {t(state.messageKey)}
          </p>
          <div>
            <Button variant="secondary" onClick={() => setState({ kind: "ready" })}>
              {t("common.tryAgain")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Localized "in 24h" / "om 24t" formatter for the share-expiry chip on
 * the file card. Buckets at hour vs day granularity to match the v0.1
 * UX — we don't want minute-precision because it would race the clock
 * during a slow page load.
 */
function formatExpiresIn(
  iso: string,
  t: (
    key: import("@/lib/i18n/translations").TranslationKey,
    args?: Record<string, string | number>
  ) => string,
  _lang: "en" | "da"
): string {
  try {
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return t("decrypt.file.expiresSoon");
    const hours = Math.round(ms / (1000 * 60 * 60));
    if (hours < 24) return t("decrypt.file.expiresInHours", { n: hours });
    const days = Math.round(hours / 24);
    return t("decrypt.file.expiresInDays", { n: days });
  } catch {
    return t("decrypt.file.expiresSoon");
  }
}
