// Render the generated share URL with copy-to-clipboard, expiry summary, and
// a "send another file" reset button.
//
// The URL contains the decryption key in the fragment. We RENDER it for the
// sender (they need to share it!) but never log it, never autocopy without
// user intent, and never include it in OG metadata or analytics.
//
// All user-visible strings flow through useLanguage()'s t() so the card
// switches between English and Danish when the visitor toggles the language
// picker. Strings live in apps/web/src/lib/i18n/translations.ts under the
// "share.*" key namespace.

"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy, FileText, ListChecks, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { destroyShare, ApiError } from "@/lib/api";
import { addShare, removeShare } from "@/lib/myShares";
import { formatBytes } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export interface ShareLinkProps {
  url: string;
  shortId: string;
  expiresAt: string;
  fileName: string;
  fileSize: number;
  /**
   * Base64url 32-byte revoke token from the upload result. Persisted
   * to `localStorage` on first paint so the sender can revoke the
   * share later from the /my-shares dashboard or via the inline
   * "Revoke now" button on this card. The token is NEVER logged or
   * sent anywhere except as a bearer credential on the destroy
   * endpoint.
   */
  revokeToken: string;
  /** Mirrored into the localStorage entry for the dashboard summary. */
  burnAfterRead: boolean;
  /** Mirrored into the localStorage entry for the dashboard summary. */
  passwordProtected: boolean;
  onSendAnother?: () => void;
}

export function ShareLink({
  url,
  shortId,
  expiresAt,
  fileName,
  fileSize,
  revokeToken,
  burnAfterRead,
  passwordProtected,
  onSendAnother,
}: ShareLinkProps) {
  const { t } = useLanguage();
  const [copied, setCopied] = React.useState(false);
  /**
   * Track local-revoke state separately from the share's actual server
   * state. Three values:
   *   - "active"   — the share is alive on the server, we hold the
   *                  token, the "Revoke now" button is offered.
   *   - "revoking" — destroyShare is in flight; button disabled.
   *   - "revoked"  — destroy succeeded; the card collapses to a
   *                  destroyed-state pill and the localStorage entry
   *                  is removed.
   */
  const [revokeState, setRevokeState] = React.useState<"active" | "revoking" | "revoked">("active");

  // Persist the share to localStorage on first paint. The effect runs
  // exactly once per mount (the dependency array is empty *after* the
  // first paint stabilises the props); a re-render with the same props
  // won't double-write because addShare is idempotent on shortId.
  // We intentionally read shortId / expiresAt / etc. from props rather
  // than parsing the URL — the upload helper already minted them, and
  // parsing the URL fragment server-side is a privacy regression.
  React.useEffect(() => {
    addShare({
      shortId,
      revokeToken,
      fileName,
      fileSize,
      createdAt: new Date().toISOString(),
      expiresAt,
      burnAfterRead,
      passwordProtected,
    });
    // Intentionally empty deps — we want the write exactly once per
    // mount; subsequent prop changes (none expected during the same
    // session) would overwrite via addShare's idempotent upsert anyway.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(t("share.copyToast.success"));
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("share.copyToast.error"));
    }
  }, [url, t]);

  const onRevoke = React.useCallback(async () => {
    if (revokeState !== "active") return;
    if (!window.confirm(t("share.revoke.confirm"))) {
      return;
    }
    setRevokeState("revoking");
    try {
      await destroyShare(shortId, revokeToken);
      removeShare(shortId);
      setRevokeState("revoked");
      toast.success(t("share.revoke.successToast"));
    } catch (err) {
      // 410 → legacy share (shouldn't happen for v0.2-minted shares,
      // but log clearly). 403 / 401 → token problem (likely a corrupted
      // localStorage entry). The user-visible toast is generic; the
      // detail goes to console for debugging.
      const message =
        err instanceof ApiError
          ? `${t("share.revoke.httpErrorPrefix")} (HTTP ${err.status}): ${err.message}`
          : t("share.revoke.errorToast");
      toast.error(message);
      setRevokeState("active");
      // eslint-disable-next-line no-console
      console.warn("destroyShare error", err);
    }
  }, [revokeState, shortId, revokeToken, t]);

  // Returns a short human-readable expiry like "7d" or "5h", or null when
  // the timestamp is unparseable / already past. The fallback localised
  // string is interpolated in the JSX below so the value matches the
  // current language picker.
  const expiresHuman = React.useMemo(() => {
    try {
      const ms = new Date(expiresAt).getTime() - Date.now();
      if (!Number.isFinite(ms) || ms <= 0) return null;
      const hours = Math.round(ms / (1000 * 60 * 60));
      if (hours < 24) return `${hours}h`;
      const days = Math.round(hours / 24);
      return `${days}d`;
    } catch {
      return null;
    }
  }, [expiresAt]);

  const expiresLabel = expiresHuman ?? t("share.expires.fallback");
  const readyBody = t("share.ready.body").replace("{time}", expiresLabel);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-accent)_15%,transparent)] text-[var(--color-accent)]">
          <Check className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 className="font-display text-xl font-semibold text-[var(--color-fg)]">
            {t("share.ready.title")}
          </h3>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{readyBody}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-card)_85%,var(--color-bg))] px-3 py-3">
        <FileText className="h-4 w-4 shrink-0 text-[var(--color-muted)]" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--color-fg)]">{fileName}</p>
          <p className="text-xs text-[var(--color-muted)]">
            {formatBytes(fileSize)} · {t("share.file.encryptedWith")} XChaCha20-Poly1305
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="share-url">{t("share.url.label")}</Label>
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
            aria-label={t("share.url.copyAria")}
          >
            {copied ? (
              <>
                <Check className="h-4 w-4" aria-hidden /> {t("share.url.copied")}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" aria-hidden /> {t("share.url.copy")}
              </>
            )}
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-[var(--color-muted)]">
          {t("share.url.keyExplainer")}
        </p>
      </div>

      {/* ── Sender controls: revoke + dashboard link ────────────────
          Sits between the share-URL card and the "send another" action
          so the sender's focus path is "copy URL → maybe revoke later".
          The Revoke button is disabled once `revokeState === "revoked"`
          (the localStorage entry is gone too); the link to /my-shares
          stays so the sender can also manage other shares from here. */}
      <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)]/60 bg-[var(--color-card)]/60 p-4 text-xs">
        <p className="text-[var(--color-muted)]">{t("share.revoke.intro")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={revokeState === "revoked" ? "ghost" : "secondary"}
            size="sm"
            onClick={onRevoke}
            disabled={revokeState !== "active"}
            aria-label={t("share.revoke.ariaLabel")}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {revokeState === "revoking"
              ? t("share.revoke.revoking")
              : revokeState === "revoked"
                ? t("share.revoke.revoked")
                : t("share.revoke.button")}
          </Button>
          <Link
            href="/my-shares"
            className="inline-flex items-center gap-1.5 px-2 py-1 text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            <ListChecks className="h-3.5 w-3.5" aria-hidden />
            {t("share.allShares")}
          </Link>
        </div>
      </div>

      {onSendAnother ? (
        <div className="flex items-center justify-end gap-3">
          <Button variant="ghost" onClick={onSendAnother}>
            <Send className="h-4 w-4" aria-hidden />
            {t("share.sendAnother")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
