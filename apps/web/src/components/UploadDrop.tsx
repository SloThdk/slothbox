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

// Custom inline SVG — sealed envelope with a wax-seal padlock medallion.
// The "letter sealed by a credential only the sender + recipient share" is
// a much sharper metaphor for end-to-end encryption than a generic
// upload-arrow. Drawn in champagne gold + graphite to match the brand.
function SealedEnvelope() {
  return (
    <svg
      width={56}
      height={56}
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      aria-hidden
      className="text-[var(--color-accent)]"
    >
      {/* Envelope body — slightly tilted to feel handed-over, not just dropped. */}
      <rect x={6} y={14} width={52} height={36} rx={2} stroke="currentColor" strokeWidth={1.6} />
      {/* Flap fold — the diagonal that makes it read as an envelope. */}
      <path d="M6 16 L32 36 L58 16" stroke="currentColor" strokeWidth={1.6} fill="none" />
      {/* Wax-seal medallion — overlaps the flap, signals "sealed". */}
      <circle cx={32} cy={36} r={8.5} fill="var(--color-accent)" stroke="none" />
      {/* Padlock cutout inside the seal — same glyph as the favicon. */}
      <path
        d="M29 35 v-2 a3 3 0 0 1 6 0 v2"
        stroke="var(--color-bg)"
        strokeWidth={1.4}
        fill="none"
        strokeLinecap="round"
      />
      <rect x={28.2} y={34.6} width={7.6} height={5.6} rx={0.8} fill="var(--color-bg)" />
      <circle cx={32} cy={37.4} r={0.7} fill="var(--color-accent)" />
    </svg>
  );
}
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

// Expiry options offered to the sender. Server side has its own clamp via
// SHARE_MAX_EXPIRY_HOURS — we keep this list shorter than the server max.
const EXPIRY_OPTIONS: Array<{ label: string; hours: number }> = [
  { label: "1 hour", hours: 1 },
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 24 * 7 },
  { label: "30 days", hours: 24 * 30 },
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
  const [state, setState] = React.useState<UploadState>({ kind: "idle" });
  const [expiryHours, setExpiryHours] = React.useState<number>(24 * 7);
  const [burnAfterRead, setBurnAfterRead] = React.useState<boolean>(false);
  const [isDragOver, setIsDragOver] = React.useState<boolean>(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // ---- File acceptance --------------------------------------------------

  const startUpload = React.useCallback(
    async (file: File) => {
      if (file.size <= 0) {
        toast.error("file is empty");
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error(`file is too large (max ${formatBytes(MAX_FILE_SIZE_BYTES)})`);
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
        toast.success("Encrypted and uploaded.");
      } catch (err) {
        const message = err instanceof Error ? err.message : "upload failed";
        // The user clicking "cancel" routes through here too — render that as
        // a neutral idle state, not an error.
        if (message === "upload cancelled") {
          setState({ kind: "idle" });
          return;
        }
        setState({ kind: "error", message });
        toast.error(message);
      }
    },
    [expiryHours, burnAfterRead]
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
      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 sm:p-8">
          <ShareLink
            url={state.result.shareUrl}
            expiresAt={state.result.expiresAt}
            fileName={state.file.name}
            fileSize={state.file.size}
            onSendAnother={reset}
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-2xl overflow-hidden">
      <CardContent className="p-0">
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
            "relative flex min-h-[260px] cursor-pointer flex-col items-center justify-center gap-4 border-b border-[var(--color-border)] p-8 text-center transition-colors",
            isDragOver
              ? "border-[var(--color-accent-tint)] bg-[var(--color-accent-soft)]"
              : "bg-[var(--color-card)]",
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
              <SealedEnvelope />
              <div className="space-y-1.5">
                <p className="font-display text-lg font-medium text-[var(--color-fg)]">
                  Drop a file, or click to choose
                </p>
                <p className="text-xs tracking-wide text-[var(--color-muted)]">
                  Up to {formatBytes(MAX_FILE_SIZE_BYTES)} · sealed in your browser before upload
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
        <div
          className={cn(
            "grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 sm:p-6",
            state.kind === "uploading" && "pointer-events-none opacity-60"
          )}
        >
          <div className="space-y-2">
            <Label htmlFor="expiry">Expires after</Label>
            <Select
              value={String(expiryHours)}
              onValueChange={(value) => setExpiryHours(Number.parseInt(value, 10))}
              disabled={state.kind === "uploading"}
            >
              <SelectTrigger id="expiry">
                <SelectValue placeholder="Select expiry" />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((opt) => (
                  <SelectItem key={opt.hours} value={String(opt.hours)}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end justify-between gap-4">
            <div className="space-y-1">
              <Label htmlFor="burn">Burn after read</Label>
              <p className="text-xs text-[var(--color-muted)]">Self-destruct on first download.</p>
            </div>
            <Switch
              id="burn"
              checked={burnAfterRead}
              onCheckedChange={setBurnAfterRead}
              disabled={state.kind === "uploading"}
            />
          </div>
        </div>

        {/* ------------------ Trust footnote ------------------ */}
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_70%,var(--color-bg))] px-6 py-3 text-xs text-[var(--color-muted)]">
          <Lock className="h-3.5 w-3.5 text-[var(--color-accent)]" aria-hidden />
          <span>Encryption happens in your browser. The key never leaves this tab.</span>
        </div>
      </CardContent>
    </Card>
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
  const fraction = progress?.fraction ?? 0;
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-left">
          <p className="truncate text-sm font-medium text-[var(--color-fg)]">{file.name}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {progress
              ? `Chunk ${progress.chunksUploaded}/${progress.chunksTotal} · ${formatBytes(progress.bytesUploaded)} / ${formatBytes(progress.bytesTotal)}`
              : `${formatBytes(file.size)} · preparing…`}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          aria-label="Cancel upload"
          className="text-[var(--color-muted)] hover:text-[var(--color-danger)]"
        >
          <X className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <Progress value={fraction} indeterminate={!progress} />
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-[var(--color-accent)]">
          <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />
          {fraction > 0 ? `${Math.floor(fraction * 100)}% encrypted + uploaded` : "encrypting…"}
        </span>
        <span className="text-[var(--color-muted)]">XChaCha20-Poly1305 · 5 MiB chunks</span>
      </div>
    </div>
  );
}
