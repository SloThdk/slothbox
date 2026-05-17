// HowContent — the bilingual JSX body of /how.
//
// Lives in a client file so useLanguage() works. Pattern matches /about
// and /security: the parent page.tsx exports metadata (server) and
// renders this content (client).
//
// Layout register: matches the homepage's visionOS dark-glass aesthetic
// — eyebrow + display heading + glass cards, single accent colour, mono
// captions for numbering. The ASCII diagram in section 2 is the only
// place where monospace gets the spotlight; everything else is sans.

"use client";

import Link from "next/link";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import type { TranslationKey } from "@/lib/i18n/translations";

// ---------------------------------------------------------------------
// Section 3 — "Verifiable, not promised" — four glass cards
// ---------------------------------------------------------------------

const VERIFIABLE_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "how.verifiable.item1.title", bodyKey: "how.verifiable.item1.body" },
  { titleKey: "how.verifiable.item2.title", bodyKey: "how.verifiable.item2.body" },
  { titleKey: "how.verifiable.item3.title", bodyKey: "how.verifiable.item3.body" },
  { titleKey: "how.verifiable.item4.title", bodyKey: "how.verifiable.item4.body" },
];

// ---------------------------------------------------------------------
// Section 4 — "What we never see" — three glass cards
// ---------------------------------------------------------------------

const NEVER_SEE_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "how.neverSee.item1.title", bodyKey: "how.neverSee.item1.body" },
  { titleKey: "how.neverSee.item2.title", bodyKey: "how.neverSee.item2.body" },
  { titleKey: "how.neverSee.item3.title", bodyKey: "how.neverSee.item3.body" },
];

// ---------------------------------------------------------------------
// Section 5 — "What we DO see" — two glass cards (honesty)
// ---------------------------------------------------------------------

const DO_SEE_KEYS: ReadonlyArray<{
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
}> = [
  { titleKey: "how.doSee.item1.title", bodyKey: "how.doSee.item1.body" },
  { titleKey: "how.doSee.item2.title", bodyKey: "how.doSee.item2.body" },
];

export function HowContent() {
  const { t } = useLanguage();

  return (
    <article className="mx-auto w-full max-w-[var(--container-xl)] px-4 pt-12 pb-24 sm:px-6 sm:pt-16">
      {/* ─── Header ──────────────────────────────────────────────── */}
      <header className="mb-14 max-w-3xl">
        <p className="eyebrow">{t("how.page.eyebrow")}</p>
        <h1 className="mt-4 text-[2.25rem] leading-[1.1] font-light text-[var(--color-fg)] sm:text-[3rem] md:text-[3.5rem]">
          {t("how.page.heading")}
        </h1>
        <p className="mt-6 max-w-[58ch] text-[1.05rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("how.page.lede")}
        </p>
      </header>

      {/* ─── Section 1: the pipeline diagram ─────────────────────── */}
      <section className="mb-20">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow">{t("how.diagram.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.diagram.heading")}
          </h2>
        </div>

        {/* Monospace ASCII pipeline diagram. Rendered inside a glass
            card so it sits on the same surface register as the rest of
            the page. overflow-x-auto so it scrolls horizontally on
            narrow viewports rather than overflowing the document body
            (which would re-introduce the 320 px header bug). */}
        <div className="glass overflow-x-auto p-5 sm:p-7">
          <pre className="font-mono text-[0.7rem] leading-[1.45] text-[var(--color-fg-2)] sm:text-[0.78rem]">
            {String.raw`  YOUR BROWSER                          SLOTHBOX SERVERS               RECIPIENT BROWSER
  ──────────────                         ─────────────────                ──────────────────

  1. drop file
        │
        ▼
  2. browser generates 256-bit key  ◄──── never leaves this device ────
        │
        ▼
  3. split file into 5 MiB chunks
        │
        ▼
  4. seal each chunk with
     XChaCha20-Poly1305 (libsodium)
        │
        ▼
  5. POST /api/shares  ─────────────►  Caddy ─► Hono gateway
                                            │
                                            ▼
                                       Postgres 16: insert metadata,
                                       allocate shortId
                                            │
        ◄─── shortId + uploadUrls ──────────┘
        │
        ▼
  6. PUT each ciphertext chunk  ────►  Caddy ─► .NET ingest (Kestrel)
                                            │
                                            ▼
                                       MinIO: write encrypted blob
                                            │
                                       Postgres: record share_chunks row
                                            │
        ◄─── 201 per chunk ─────────────────┘
        │
        ▼
  7. share the URL — key lives in #fragment
                                                                     │
                                                                     ▼
                                                                8. recipient
                                                                   opens URL
                                                                     │
                                                                     ▼
                                                                9. fragment
                                                                   stays
                                                                   client-
                                                                   side,
                                                                   key extracted
                                                                     │
                                            ◄── GET /api/shares ─────┘
                                       Hono: serve metadata
                                       (encryptedMeta + nonceMeta)
                                            │
                                            ▼
                                       ──── ciphertext meta ────────►
                                                                     │
                                                                10. decrypt meta,
                                                                    get filename
                                                                     │
                                            ◄── GET /chunk/:id/:N ───┘
                                       .NET ingest: stream from MinIO
                                            │
                                            ▼
                                       mark_chunk_served() in Postgres
                                       (if burn=ON AND last chunk:
                                        flip state=destroyed,
                                        append audit_chain entry,
                                        all in one transaction)
                                            │
                                       ──── ciphertext chunk ───────►
                                                                     │
                                                                11. decrypt chunk
                                                                    (XChaCha20
                                                                     Poly1305 tag
                                                                     verifies
                                                                     integrity)
                                                                     │
                                                                12. assemble file,
                                                                    trigger
                                                                    download
                                            ◄── Reaper sweep (≤60s) ─
                                       deletes MinIO blob,
                                       deletes share_chunks rows,
                                       writes second audit_chain entry`}
          </pre>
        </div>

        <p className="mt-6 max-w-[58ch] text-[0.95rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("how.diagram.caption")}
        </p>
      </section>

      <div className="divider mb-20" aria-hidden />

      {/* ─── Section 2: Verifiable, not promised ─────────────────── */}
      <section className="mb-20">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">{t("how.verifiable.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.verifiable.heading")}
          </h2>
          <p className="mt-6 max-w-[58ch] text-[0.95rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
            {t("how.verifiable.lede")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {VERIFIABLE_KEYS.map((item, i) => (
            <article
              key={item.titleKey}
              className="glass flex flex-col gap-3 p-7 transition-colors hover:border-[var(--color-glass-stroke-strong)]"
            >
              <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[1.05rem] font-medium text-[var(--color-fg)]">
                {t(item.titleKey)}
              </h3>
              <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
                {t(item.bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="divider mb-20" aria-hidden />

      {/* ─── Section 3: What we never see ─────────────────────────── */}
      <section className="mb-20">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">{t("how.neverSee.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.neverSee.heading")}
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {NEVER_SEE_KEYS.map((item, i) => (
            <article
              key={item.titleKey}
              className="glass flex flex-col gap-3 p-7 transition-colors hover:border-[var(--color-glass-stroke-strong)]"
            >
              <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-accent)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[1.05rem] font-medium text-[var(--color-fg)]">
                {t(item.titleKey)}
              </h3>
              <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
                {t(item.bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="divider mb-20" aria-hidden />

      {/* ─── Section 4: What we DO see (honesty counterweight) ──── */}
      <section className="mb-20">
        <div className="mb-12 max-w-2xl">
          <p className="eyebrow">{t("how.doSee.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.doSee.heading")}
          </h2>
          <p className="mt-6 max-w-[58ch] text-[0.95rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
            {t("how.doSee.lede")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {DO_SEE_KEYS.map((item, i) => (
            <article key={item.titleKey} className="glass flex flex-col gap-3 p-7">
              <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-muted-2)]">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-[1.05rem] font-medium text-[var(--color-fg)]">
                {t(item.titleKey)}
              </h3>
              <p className="text-[0.95rem] leading-[1.6] font-light text-[var(--color-fg-2)]">
                {t(item.bodyKey)}
              </p>
            </article>
          ))}
        </div>
      </section>

      <div className="divider mb-20" aria-hidden />

      {/* ─── Section 5: Verify it yourself ───────────────────────── */}
      <section className="mb-20">
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow">{t("how.verifyYourself.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.verifyYourself.heading")}
          </h2>
          <p className="mt-6 max-w-[58ch] text-[0.95rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
            {t("how.verifyYourself.lede")}
          </p>
        </div>

        {/* Code block in a glass card. overflow-x-auto so long lines
            scroll horizontally on narrow viewports. */}
        <div className="glass overflow-x-auto p-5 sm:p-7">
          <pre className="font-mono text-[0.78rem] leading-[1.6] text-[var(--color-fg-2)]">
            {String.raw`# 1. The server cannot read your file — the encryption key is
#    generated in the browser via libsodium's randombytes_buf:
grep -rn "generateKey\|randombytes_buf" packages/crypto-core/src/

# 2. The key never reaches the server — it lives in
#    window.location.hash and travels in the URL fragment, which
#    browsers never send to servers:
grep -rn "window.location.hash\|#key=" apps/web/src/

# 3. The server only stores ciphertext — every blob written to MinIO
#    is the AEAD output, never plaintext:
grep -rn "PutObjectAsync" services/ingest/Services/

# 4. Per-chunk AAD binds (shareId, chunkIndex) so chunks can't be
#    silently reordered or moved between shares:
grep -rn "buildChunkAad" packages/crypto-core/src/

# 5. The audit chain is hash-linked entry-to-entry — tampering
#    breaks the chain and verify_audit_chain returns the seq of
#    the broken row:
grep -rn "append_audit_entry\|verify_audit_chain" db/migrations/`}
          </pre>
        </div>

        <p className="mt-6 max-w-[58ch] text-[0.95rem] leading-[1.65] font-light text-[var(--color-fg-2)]">
          {t("how.verifyYourself.runIt.before")}{" "}
          <code className="rounded-md border border-[var(--color-glass-stroke)] bg-[var(--color-glass-fill)] px-1.5 py-0.5 font-mono text-[0.85em] text-[var(--color-accent)]">
            docker compose up -d
          </code>{" "}
          {t("how.verifyYourself.runIt.after")}
        </p>
      </section>

      <div className="divider mb-20" aria-hidden />

      {/* ─── Section 6: Roadmap honesty ──────────────────────────── */}
      <section>
        <div className="mb-8 max-w-2xl">
          <p className="eyebrow">{t("how.roadmap.eyebrow")}</p>
          <h2 className="mt-4 text-[1.75rem] leading-[1.15] font-light text-[var(--color-fg)] sm:text-[2rem]">
            {t("how.roadmap.heading")}
          </h2>
        </div>

        <div className="glass overflow-hidden">
          <div className="divide-y divide-[var(--color-glass-stroke)]">
            {[
              {
                tag: "v0.2.0",
                labelKey: "how.roadmap.v02.label",
                bodyKey: "how.roadmap.v02.body",
              },
              { tag: "v0.5.0", labelKey: "how.roadmap.v05.label", bodyKey: "how.roadmap.v05.body" },
              { tag: "v1.0.0", labelKey: "how.roadmap.v10.label", bodyKey: "how.roadmap.v10.body" },
            ].map((row) => (
              <div
                key={row.tag}
                className="grid grid-cols-1 gap-3 px-6 py-5 sm:grid-cols-[minmax(0,140px)_1fr] sm:gap-6 sm:py-5"
              >
                <div className="flex items-start sm:self-center">
                  <span className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--color-accent)] uppercase">
                    {row.tag}
                  </span>
                </div>
                <div>
                  <h3 className="text-[1rem] font-medium text-[var(--color-fg)]">
                    {t(row.labelKey as TranslationKey)}
                  </h3>
                  <p className="mt-1 text-[0.9rem] leading-[1.55] font-light text-[var(--color-fg-2)]">
                    {t(row.bodyKey as TranslationKey)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-[0.95rem] font-light text-[var(--color-fg-2)]">
          {t("how.roadmap.tail.before")}{" "}
          <Link
            href="/security"
            className="text-[var(--color-accent)] underline-offset-4 hover:underline"
          >
            /security
          </Link>
          {t("how.roadmap.tail.after")}
        </p>
      </section>
    </article>
  );
}
