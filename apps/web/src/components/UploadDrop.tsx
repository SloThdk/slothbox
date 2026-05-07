// Drag-drop upload zone — the centrepiece of the landing page.
//
// Three states:
//   1. idle  — drop zone visible, file picker available, share-options collapsed.
//   2. encrypting+uploading — progress bar, current chunk index, cancel button.
//   3. done  — collapses to <ShareLink/>, with a "send another" reset button.
//
// All cryptographic operations live in `lib/upload.ts`. This component is a
// thin shell over that module; React state is for UI, not for crypto.

"use client";

import * as React from "react";
import { Lock, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";

// Custom inline SVG — a vault box with a separated key floating above it.
// This is the LITERAL design metaphor for what SlothBox actually does:
// the lock and the key never travel together. The key sits above the box,
// connected only by a hairline dotted line, suggesting "the key exists in
// a different layer". Drawn in fine sky-blue lineart on glass — visionOS
// precise, not figurative or decorative.
function VaultMark() {
  return (
    <svg
      width={64}
      height={64}
      viewBox="0 0 64 64"
      fill="none"
      stroke="var(--color-accent)"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {/* Floating key, top of frame. Bow + shaft + single tooth. */}
      <circle cx={32} cy={12} r={3.5} />
      <path d="M32 15.5 V 22" />
      <path d="M30 20 H 33" />
      {/* Dotted connection line — key reaches toward the box but never lands. */}
      <line x1={32} y1={24} x2={32} y2={28} strokeDasharray="1 2" opacity={0.5} />
      {/* Box body. */}
      <rect x={14} y={28} width={36} height={28} rx={3} />
      {/* Keyhole cut into the box — circle + descending slot. */}
      <circle cx={32} cy={40} r={2.4} fill="var(--color-accent)" stroke="none" />
      <rect x={31} y={40} width={2} height={6} rx={0.5} fill="var(--color-accent)" stroke="none" />
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ShareLink } from "@/components/ShareLink";
import { MAX_FILE_SIZE_BYTES } from "@/lib/config";
import { uploadFile, type UploadProgressEvent, type UploadResult } from "@/lib/upload";
import { cn, formatBytes } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// Expiry options offered to the sender. Each option carries an hours
// value (the actual API contract) plus a translation key for the
// rendered label, so the dropdown localises with the rest of the UI.
// Server side has its own clamp via SHARE_MAX_EXPIRY_HOURS — we keep
// this list shorter than the server max.
const EXPIRY_OPTIONS: ReadonlyArray<{ labelKey: TranslationKey; hours: number }> = [
  { labelKey: "upload.expiry.1h", hours: 1 },
  { labelKey: "upload.expiry.24h", hours: 24 },
  { labelKey: "upload.expiry.7d", hours: 24 * 7 },
  { labelKey: "upload.expiry.30d", hours: 24 * 30 },
];

type UploadState =
  | { kind: "idle" }
  | {
      kind: "uploading";
      file: File;
      progress: UploadProgressEvent | null;
      controller: AbortController;
    }
  | { kind: "done"; result: UploadResult; file: File }
  | { kind: "error"; message: string };

export function UploadDrop() {
  const { t } = useLanguage();
  const [state, setState] = React.useState<UploadState>({ kind: "idle" });
  const [expiryHours, setExpiryHours] = React.useState<number>(24 * 7);
  const [burnAfterRead, setBurnAfterRead] = React.useState<boolean>(false);
  const [isDragOver, setIsDragOver] = React.useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // ---- File acceptance --------------------------------------------------

  const startUpload = React.useCallback(
    async (file: File) => {
      if (file.size <= 0) {
        toast.error(t("upload.toast.empty"));
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(t("upload.toast.tooLarge", { max: formatBytes(MAX_FILE_SIZE_BYTES) }));
        return;
      }

      const controller = new AbortController();
      setState({ kind: "uploading", file, progress: null, controller });

      try {
        const result = await uploadFile(file, {
          expiryHours,
          burnAfterRead,
          signal: controller.signal,
          onProgress: (progress) => {
            setState((prev) => (prev.kind === "uploading" ? { ...prev, progress } : prev));
          },
        });
        setState({ kind: "done", result, file });
        toast.success(t("upload.toast.success"));
      } catch (err) {
        // Errors thrown by the upload module are surfaced directly so the
        // user sees the actionable cause (e.g. "share token expired",
        // "network error"). These are technical strings keyed off the
        // upload pipeline; we don't translate them per-locale here
        // because they're effectively diagnostic copy that needs to
        // match docs / threads. A future i18n pass can lift them into
        // the translations table once the error surface stabilises.
        const message = err instanceof Error ? err.message : "upload failed";
        // The user clicking "cancel" routes through here too — render
        // that as a neutral idle state, not an error.
        if (message === "upload cancelled") {
          setState({ kind: "idle" });
          return;
        }
        setState({ kind: "error", message });
        toast.error(message);
      }
    },
    [expiryHours, burnAfterRead, t]
  );

  // ---- DOM event handlers ----------------------------------------------

  const onDrop = React.useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        void startUpload(file);
      }
    },
    [startUpload]
  );

  const onPick = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        void startUpload(file);
      }
      // Reset so picking the same file twice still fires `change`.
      e.target.value = "";
    },
    [startUpload]
  );

  const reset = React.useCallback(() => {
    setState({ kind: "idle" });
  }, []);

  const cancel = React.useCallback(() => {
    if (state.kind === "uploading") {
      state.controller.abort();
    }
  }, [state]);

  // ---- Render ----------------------------------------------------------

  if (state.kind === "done") {
    return (
      <div className="glass-elevated w-full max-w-[480px] p-7 sm:p-8">
        <ShareLink
          url={state.result.shareUrl}
          expiresAt={state.result.expiresAt}
          fileName={state.file.name}
          fileSize={state.file.size}
          onSendAnother={reset}
        />
      </div>
    );
  }

  return (
    <div className="glass-elevated w-full max-w-[480px] overflow-hidden">
      <div className="p-0">
        {/* ------------------ Drop zone ------------------ */}
        <div
          role="button"
          tabIndex={0}
          aria-disabled={state.kind === "uploading"}
          onDragOver={(e) => {
            e.preventDefault();
            if (state.kind !== "uploading") setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={state.kind === "uploading" ? undefined : onDrop}
          onClick={() => {
            if (state.kind !== "uploading") fileInputRef.current?.click();
          }}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && state.kind !== "uploading") {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          className={cn(
            "relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center gap-5 border-b border-[var(--color-glass-stroke)] p-10 text-center transition-colors",
            isDragOver && "bg-[var(--color-accent-soft)]",
            state.kind === "uploading" && "cursor-not-allowed"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            onChange={onPick}
            disabled={state.kind === "uploading"}
          />

          {state.kind === "idle" || state.kind === "error" ? (
            <>
              <VaultMark />
              <div className="space-y-2">
                <p className="text-[1.05rem] font-medium text-[var(--color-fg)]">
                  {t("upload.dropPrompt")}
                </p>
                <p className="text-xs font-light text-[var(--color-muted)]">
                  {t("upload.maxNote", { max: formatBytes(MAX_FILE_SIZE_BYTES) })}
                </p>
              </div>
              {state.kind === "error" ? (
                <p className="text-sm text-[var(--color-danger)]">{state.message}</p>
              ) : null}
            </>
          ) : (
            <UploadingPanel file={state.file} progress={state.progress} onCancel={cancel} />
          )}
        </div>

        {/* ------------------ Share options ------------------ */}
        {/*
          Share-options block. Each control gets a label + a small helper
          paragraph that spells out exactly what the option does — picked
          deliberately over a bare label-and-checkbox UI so a sender from a
          regulated profession (lawyer, doctor, accountant) can read the
          consequence of the toggle BEFORE clicking it. Stacks vertically on
          mobile, two-column from `sm` upwards. Pointer events are killed
          during upload so a mid-flight toggle can't trigger a re-upload.
        */}
        <div
          className={cn(
            "grid grid-cols-1 gap-5 p-6 sm:grid-cols-2 sm:p-6",
            state.kind === "uploading" && "pointer-events-none opacity-60"
          )}
        >
          {/* ── Expiry ───────────────────────────────────────────── */}
          <div className="space-y-2">
            <Label htmlFor="expiry">{t("upload.expires")}</Label>
            <Select
              value={String(expiryHours)}
              onValueChange={(value) => setExpiryHours(Number.parseInt(value, 10))}
              disabled={state.kind === "uploading"}
            >
              <SelectTrigger id="expiry">
                <SelectValue placeholder={t("upload.expiry.placeholder")} />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.hours} value={String(opt.hours)}>
                    {t(opt.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/* Plain-language explanation. Caps at ~3 lines on mobile so the
                control's hit-target stays primary. */}
            <p className="text-[0.7rem] leading-snug font-light text-[var(--color-muted)]">
              {t("upload.expires.help")}
            </p>
          </div>

          {/* ── Burn after read ─────────────────────────────────── */}
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-4">
              <Label htmlFor="burn" className="leading-tight">
                {t("upload.burn")}
              </Label>
              <Switch
                id="burn"
                checked={burnAfterRead}
                onCheckedChange={setBurnAfterRead}
                disabled={state.kind === "uploading"}
              />
            </div>
            {/* Same plain-language explanation pattern as the expiry helper.
                Sits below the row instead of beside the switch so longer
                copy doesn't squeeze the toggle's hit area. */}
            <p className="text-[0.7rem] leading-snug font-light text-[var(--color-muted)]">
              {t("upload.burn.help")}
            </p>
          </div>
        </div>

        {/* ------------------ Trust footnote ------------------ */}
        <div className="flex items-center gap-2.5 border-t border-[var(--color-glass-stroke)] px-6 py-3 text-xs font-light text-[var(--color-muted)]">
          <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden strokeWidth={1.6} />
          <span>{t("upload.trust")}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Uploading sub-panel -------------------------------------------------

function UploadingPanel({
  file,
  progress,
  onCancel,
}: {
  file: File;
  progress: UploadProgressEvent | null;
  onCancel: () => void;
}) {
  const { t } = useLanguage();
  const fraction = progress?.fraction ?? 0;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-[var(--color-fg)]">{file.name}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {progress
              ? t("upload.chunkProgress", {
                  done: progress.chunksUploaded,
                  total: progress.chunksTotal,
                  bytesDone: formatBytes(progress.bytesUploaded),
                  bytesTotal: formatBytes(progress.bytesTotal),
                })
              : t("upload.preparing", { size: formatBytes(file.size) })}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          aria-label={t("upload.cancel")}
          className="text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <Progress value={fraction} indeterminate={!progress} />
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          {fraction > 0
            ? t("upload.percentLabel", { percent: Math.floor(fraction * 100) })
            : t("upload.encrypting")}
        </span>
        <span className="text-[var(--color-muted)]">{t("upload.engineLabel")}</span>
      </div>
    </div>
  );
}
