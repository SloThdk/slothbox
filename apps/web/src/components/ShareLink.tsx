// Render the generated share URL with copy-to-clipboard, expiry summary, and
// a "send another file" reset button.
//
// The URL contains the decryption key in the fragment. We RENDER it for the
// sender (they need to share it!) but never log it, never autocopy without
// user intent, and never include it in OG metadata or analytics.

"use client";

import * as React from "react";
import { Check, Copy, FileText, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBytes } from "@/lib/utils";

export interface ShareLinkProps {
  url: string;
  expiresAt: string;
  fileName: string;
  fileSize: number;
  onSendAnother?: () => void;
}

export function ShareLink({ url, expiresAt, fileName, fileSize, onSendAnother }: ShareLinkProps) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Link copied. Send only over a channel you trust.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not access clipboard — copy manually.");
    }
  }, [url]);

  const expiresHuman = React.useMemo(() => {
    try {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) return "shortly";
      const hours = Math.round(ms / (1000 * 60 * 60));
      if (hours < 24) return `${hours}h`;
      const days = Math.round(hours / 24);
      return `${days}d`;
    } catch {
      return "soon";
    }
  }, [expiresAt]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold text-[var(--color-fg)]">
            Encrypted. Ready to send.
          </h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Anyone with the full link below can download and decrypt this file once. Expires in{" "}
            {expiresHuman}.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_85%,var(--color-bg))] px-3 py-3">
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-fg)]">{fileName}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {formatBytes(fileSize)} · encrypted with XChaCha20-Poly1305
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="share-url">Share link</Label>
        <div className="flex gap-2">
          <Input
            id="share-url"
            value={url}
            readOnly
            spellCheck={false}
            onFocus={(e) => e.currentTarget.select()}
            className="font-mono text-xs"
          />
          <Button
            type="button"
            onClick={onCopy}
            variant={copied ? "secondary" : "primary"}
            size="md"
            aria-label="Copy link to clipboard"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden /> Copy
              </>
            )}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
          The portion after <code className="font-mono">#key=</code> is the decryption key. It stays
          inside this URL — your browser never sends it to any server. If you lose it, the file is
          unrecoverable.
        </p>
      </div>

      {onSendAnother ? (
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onSendAnother}>
            <Send className="h-4 w-4" aria-hidden />
            Send another file
          </Button>
        </div>
      ) : null}
    </div>
  );
}
