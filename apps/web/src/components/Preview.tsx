// In-browser preview for safe filetypes (v0.2.1, Tier-B feature #5).
//
// After the recipient decrypts the share, we offer a preview BEFORE
// forcing a download for filetypes the browser can render safely:
//
//   - images          (any MIME starting `image/`)        — <img> + object URL
//   - PDFs            (`application/pdf`)                 — sandboxed <iframe>
//                                                            using the browser's native PDF viewer
//   - plain text      (`text/plain`, `text/csv`, …)       — <pre>, capped at 1 MiB to avoid layout thrash
//   - markdown        (`text/markdown` or `.md` filename) — `marked` → sanitised HTML in a sandboxed <iframe>
//
// Everything else falls through to the existing "Save to downloads"
// path unchanged. The user can always skip the preview and save the
// raw file.
//
// SECURITY POSTURE:
//   The preview is rendered inside this same browser tab from a
//   plaintext Blob the recipient just decrypted. Two attack surfaces
//   we contain:
//
//   1. Active content in user-supplied bytes. A PDF or markdown
//      document could carry JavaScript / forms / external requests.
//      We render PDFs in an `<iframe sandbox>` with NO `allow-scripts`,
//      and markdown via `marked` with the script-stripping default
//      (markedjs/marked v15 disables raw HTML by default + escapes
//      anything that looks executable). The iframe runs from a
//      `blob:` URL so it inherits no parent-origin cookies / DOM.
//
//   2. Long-running URL.createObjectURL leaks. We revoke the URL on
//      unmount via `useEffect` cleanup so the Blob can be GC'd as
//      soon as the recipient saves or closes the tab.

"use client";

import * as React from "react";
import { marked } from "marked";

/**
 * Maximum plaintext-preview size for non-binary previews. 1 MiB is the
 * cap on text + markdown rendering — beyond this we drop to the
 * "preview unavailable for this file" branch and let the recipient
 * save the bytes raw. Browsers slow to a crawl rendering a 10 MB
 * `<pre>`; the cap protects the UX.
 */
const TEXT_PREVIEW_MAX_BYTES = 1024 * 1024;

/**
 * Hard cap for the markdown HTML render path. Same reasoning as the
 * text cap — a giant markdown file isn't a "preview" by any useful
 * meaning, and the marked → HTML step is O(N) on input.
 */
const MARKDOWN_PREVIEW_MAX_BYTES = 1024 * 1024;

export interface PreviewProps {
  blob: Blob;
  fileName: string;
  mimeType: string;
}

/**
 * Decide whether the (mime, filename) pair has a renderable preview.
 * Called by the receiver UI BEFORE deciding whether to show the
 * preview pane vs jumping straight to the OS download.
 */
export function isPreviewable(mimeType: string, fileName: string): boolean {
  const mime = mimeType.toLowerCase();
  if (mime.startsWith("image/")) return true;
  if (mime === "application/pdf") return true;
  if (mime.startsWith("text/")) return true;
  if (mime === "application/json") return true;
  if (mime === "application/xml") return true;
  // Filename-based fallbacks for files the OS uploaded with a
  // generic application/octet-stream MIME (common from Windows file
  // pickers). Conservative — only filetypes whose extension is a
  // reliable signal.
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return true;
  if (lower.endsWith(".txt") || lower.endsWith(".log")) return true;
  if (lower.endsWith(".csv") || lower.endsWith(".tsv")) return true;
  return false;
}

/**
 * Render an in-browser preview pane for a decrypted Blob. The pane
 * stays mounted until the parent component unmounts it; the parent
 * Decrypt component swaps between this and the "Save to downloads"
 * action.
 *
 * Returns null if the blob isn't previewable — the parent uses
 * `isPreviewable` to gate this, so a null return here is a defensive
 * fallback rather than the normal path.
 */
export function Preview({ blob, fileName, mimeType }: PreviewProps): React.ReactElement | null {
  const kind = classifyPreview(mimeType, fileName);
  if (!kind) return null;

  switch (kind) {
    case "image":
      return <ImagePreview blob={blob} fileName={fileName} />;
    case "pdf":
      return <PdfPreview blob={blob} fileName={fileName} />;
    case "text":
      return <TextPreview blob={blob} fileName={fileName} />;
    case "markdown":
      return <MarkdownPreview blob={blob} fileName={fileName} />;
  }
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type PreviewKind = "image" | "pdf" | "text" | "markdown";

function classifyPreview(mimeType: string, fileName: string): PreviewKind | null {
  const mime = mimeType.toLowerCase();
  const name = fileName.toLowerCase();
  // Markdown takes priority over plain text — a `text/markdown` MIME
  // OR a `.md` filename gets the rendered preview, not the raw pre.
  if (mime === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown")) {
    return "markdown";
  }
  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf") return "pdf";
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/xml" ||
    name.endsWith(".txt") ||
    name.endsWith(".log") ||
    name.endsWith(".csv") ||
    name.endsWith(".tsv")
  ) {
    return "text";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Image
// ---------------------------------------------------------------------------

function ImagePreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = useObjectUrl(blob);
  return (
    <div className="flex items-center justify-center overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <img src={url} alt={fileName} className="max-h-[480px] w-auto rounded-lg object-contain" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PDF — sandboxed iframe
// ---------------------------------------------------------------------------

function PdfPreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const url = useObjectUrl(blob);
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <iframe
        src={url}
        title={`Preview of ${fileName}`}
        // `sandbox` with no flags means "no scripts, no forms, no
        // popups, no top-nav, no same-origin DOM access". The browser
        // still renders the PDF natively because PDF rendering is in
        // the browser process, not in the iframe's script context.
        sandbox=""
        className="h-[600px] w-full"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

function TextPreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const [content, setContent] = React.useState<
    { kind: "loading" } | { kind: "ready"; text: string } | { kind: "too-large"; bytes: number }
  >({
    kind: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;
    if (blob.size > TEXT_PREVIEW_MAX_BYTES) {
      setContent({ kind: "too-large", bytes: blob.size });
      return;
    }
    void (async () => {
      try {
        const text = await blob.text();
        if (!cancelled) setContent({ kind: "ready", text });
      } catch {
        if (!cancelled) setContent({ kind: "too-large", bytes: blob.size });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (content.kind === "loading") {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-border)]" />
      </div>
    );
  }
  if (content.kind === "too-large") {
    return (
      <PreviewUnavailable
        reason={`text preview disabled for files over ${formatKib(TEXT_PREVIEW_MAX_BYTES)} (${fileName} is ${formatKib(content.bytes)})`}
      />
    );
  }
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <pre className="max-h-[480px] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap text-[var(--color-fg)]">
        {content.text}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Markdown — marked → sandboxed iframe
// ---------------------------------------------------------------------------

function MarkdownPreview({ blob, fileName }: { blob: Blob; fileName: string }) {
  const [content, setContent] = React.useState<
    { kind: "loading" } | { kind: "ready"; html: string } | { kind: "too-large"; bytes: number }
  >({
    kind: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;
    if (blob.size > MARKDOWN_PREVIEW_MAX_BYTES) {
      setContent({ kind: "too-large", bytes: blob.size });
      return;
    }
    void (async () => {
      try {
        const raw = await blob.text();
        // marked v15 escapes raw HTML by default. We additionally pass
        // `gfm: true` for GitHub-flavoured tables / strikethrough /
        // task lists, and `breaks: true` so line breaks render as
        // <br> (common expectation in chat-derived markdown).
        const html = await marked(raw, { gfm: true, breaks: true });
        if (!cancelled) {
          setContent({ kind: "ready", html: wrapMarkdownHtml(html) });
        }
      } catch {
        if (!cancelled) setContent({ kind: "too-large", bytes: blob.size });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [blob]);

  if (content.kind === "loading") {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
        <div className="h-3 w-32 animate-pulse rounded bg-[var(--color-border)]" />
      </div>
    );
  }
  if (content.kind === "too-large") {
    return (
      <PreviewUnavailable
        reason={`markdown preview disabled for files over ${formatKib(MARKDOWN_PREVIEW_MAX_BYTES)} (${fileName} is ${formatKib(content.bytes)})`}
      />
    );
  }
  // Render the marked output inside a fully sandboxed iframe. We use
  // `srcDoc` (not `src`) so the document is self-contained — no extra
  // resource loads, no Same-Origin requests, no script execution
  // because the sandbox attribute is empty.
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]">
      <iframe
        srcDoc={content.html}
        title={`Preview of ${fileName}`}
        sandbox=""
        className="h-[480px] w-full"
      />
    </div>
  );
}

/**
 * Wrap the marked-produced HTML in a minimal document with inherited
 * SlothBox typography. No external stylesheets — everything inlined
 * so the sandboxed iframe can render without network access.
 */
function wrapMarkdownHtml(body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="referrer" content="no-referrer">
  <style>
    :root { color-scheme: light dark; }
    html { font-family: ui-sans-serif, system-ui, sans-serif; line-height: 1.55; padding: 1rem; }
    body { margin: 0; color: #1a1f24; max-width: 70ch; }
    @media (prefers-color-scheme: dark) {
      body { color: #e8eef2; background: #0f1518; }
    }
    pre, code { font-family: ui-monospace, SFMono-Regular, monospace; font-size: 0.9em; }
    pre { background: rgba(127, 127, 127, 0.12); padding: 0.75em; border-radius: 6px; overflow: auto; }
    code { background: rgba(127, 127, 127, 0.15); padding: 0.1em 0.3em; border-radius: 3px; }
    a { color: #2da6ff; }
    table { border-collapse: collapse; }
    th, td { border: 1px solid rgba(127, 127, 127, 0.4); padding: 0.3em 0.6em; }
    img { max-width: 100%; height: auto; }
    blockquote { border-left: 3px solid rgba(127, 127, 127, 0.4); margin: 0; padding: 0 1em; color: inherit; opacity: 0.85; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

function PreviewUnavailable({ reason }: { reason: string }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 text-center">
      <p className="text-sm text-[var(--color-muted)]">{reason}</p>
    </div>
  );
}

/**
 * Create a `blob:` URL for the lifetime of the mount, then revoke it
 * on unmount. The recipient's tab can hold dozens of these without
 * the GC reclaiming the Blob — explicit revoke is the only reliable
 * release path.
 */
function useObjectUrl(blob: Blob): string {
  const [url, setUrl] = React.useState<string>("");
  React.useEffect(() => {
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
    };
  }, [blob]);
  return url;
}

function formatKib(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}
