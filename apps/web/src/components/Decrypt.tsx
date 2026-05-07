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
import { AlertTriangle, Check, Download, FileLock2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  downloadFile,
  notifyDownloadComplete,
  type DownloadProgressEvent,
  triggerBlobDownload,
} from "@/lib/download";
import type { ShareDescriptor } from "@/lib/api";
import { formatBytes } from "@/lib/utils";

export interface DecryptProps {
  shortId: string;
  descriptor: ShareDescriptor;
  /** Decryption key extracted from `window.location.hash`. */
  decryptionKey: Uint8Array;
}

type DecryptState =
  | { kind: "ready" }
  | { kind: "busy"; progress: DownloadProgressEvent | null; controller: AbortController }
  | { kind: "done"; blob: Blob; fileName: string }
  | { kind: "error"; message: string };

export function Decrypt({ shortId, descriptor, decryptionKey }: DecryptProps) {
  const [state, setState] = React.useState<DecryptState>({ kind: "ready" });

  const startDownload = React.useCallback(async () => {
    const controller = new AbortController();
    setState({ kind: "busy", progress: null, controller });

    try {
      const result = await downloadFile(shortId, decryptionKey, {
        signal: controller.signal,
        onProgress: (progress) => {
          setState((prev) => (prev.kind === "busy" ? { ...prev, progress } : prev));
        },
      });

      // Trigger the browser save-as immediately. We can also keep the blob in
      // memory so a "Save again" button works without re-fetching.
      triggerBlobDownload(result.blob, result.fileName);
      setState({ kind: "done", blob: result.blob, fileName: result.fileName });
      toast.success("Decrypted. Saved to your downloads folder.");

      // Notify the gateway the download completed. For burn-after-read shares,
      // this is what triggers immediate destruction (gateway flips state and
      // signals the reaper). Errors are swallowed inside notifyDownloadComplete
      // — the reaper will pick up orphans on its sweep.
      void notifyDownloadComplete(shortId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "download failed";
      if (message === "download cancelled") {
        setState({ kind: "ready" });
        return;
      }
      setState({ kind: "error", message });
      toast.error(message);
    }
  }, [shortId, decryptionKey]);

  const cancel = React.useCallback(() => {
    if (state.kind === "busy") state.controller.abort();
  }, [state]);

  const downloadAgain = React.useCallback(() => {
    if (state.kind === "done") {
      triggerBlobDownload(state.blob, state.fileName);
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
          </p>
        </div>
      </div>

      {/* State-specific body */}
      {state.kind === "ready" ? (
        <div className="flex flex-col gap-3">
          <Button onClick={startDownload} size="lg" className="w-full">
            <Download className="h-4 w-4" aria-hidden />
            Download + decrypt
          </Button>
          <p className="text-center text-xs text-[var(--color-muted)]">
            Decryption runs in your browser. Nothing leaves this tab.
          </p>
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
        <div className="flex flex-col gap-3 rounded-lg border border-[color-mix(in_srgb,var(--color-accent)_50%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_10%,var(--color-card))] p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--color-fg)]">
            <Check className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
            Decrypted and saved.
            {descriptor.burnAfterRead ? " Share has been destroyed." : " You can close this tab."}
          </p>
          <div>
            <Button variant="secondary" onClick={downloadAgain}>
              <Download className="h-4 w-4" aria-hidden />
              Save again
            </Button>
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
