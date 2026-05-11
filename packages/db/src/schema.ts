import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  bigint,
  customType,
  jsonb,
  bigserial,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
  toDriver(value) {
    return Buffer.from(value);
  },
  fromDriver(value) {
    return new Uint8Array(value);
  },
});

export const shareState = [
  "pending",
  "uploading",
  "ready",
  "downloaded",
  "expired",
  "destroyed",
] as const;
export type ShareState = (typeof shareState)[number];

export const destroyedReason = ["burn", "expiry", "manual", "abuse"] as const;
export type DestroyedReason = (typeof destroyedReason)[number];

export const shares = pgTable(
  "shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shortId: text("short_id").notNull().unique(),
    ownerId: uuid("owner_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    burnAfterRead: boolean("burn_after_read").notNull().default(false),
    maxDownloads: integer("max_downloads"),
    downloadCount: integer("download_count").notNull().default(0),
    fileHash: bytea("file_hash").notNull(),
    fileSize: bigint("file_size", { mode: "bigint" }).notNull(),
    encryptedMeta: bytea("encrypted_meta").notNull(),
    nonceMeta: bytea("nonce_meta").notNull(),
    chunkCount: integer("chunk_count").notNull(),
    chunkSize: integer("chunk_size").notNull(),
    state: text("state").$type<ShareState>().notNull().default("pending"),
    destroyedAt: timestamp("destroyed_at", { withTimezone: true }),
    destroyedReason: text("destroyed_reason").$type<DestroyedReason>(),
    senderIpHash: bytea("sender_ip_hash"),
    senderRegion: text("sender_region"),
    /**
     * Per-share password protection (migration 0005).
     *
     * When `passwordProtected` is true:
     *   - `passwordSalt` is the 16-byte Argon2id salt for the share.
     *   - `passwordKdfOpsLimit` is the Argon2id ops parameter (1-10).
     *   - `passwordKdfMemLimitKib` is the Argon2id mem limit in KiB
     *     (8192-1048576, i.e. 8 MiB – 1 GiB).
     *
     * When `passwordProtected` is false, all three are NULL. The DB
     * CHECK constraint `shares_password_fields_consistent` enforces
     * the either/or so the application never sees a half-populated row.
     *
     * The password itself is NEVER stored or sent to the gateway —
     * the sender's browser derives `pwd_key = Argon2id(password, salt,
     * ops, mem)` and combines it with the URL-fragment key to produce
     * the AEAD key. See `packages/crypto-core/src/derivation.ts` →
     * `deriveAeadKey` and `docs/CRYPTO.md` for the full construction.
     */
    passwordProtected: boolean("password_protected").notNull().default(false),
    passwordSalt: bytea("password_salt"),
    passwordKdfOpsLimit: integer("password_kdf_ops_limit"),
    passwordKdfMemLimitKib: integer("password_kdf_mem_limit_kib"),
    /**
     * Sender-revoke token hash (migration 0006).
     *
     * `revokeTokenHash` is the 32-byte SHA-256 of a sender-generated
     * token. The token itself is generated in the sender's browser
     * (libsodium `randombytes_buf(32)`), the hash is sent to the
     * gateway on share creation, and the raw token never reaches the
     * server — it lives only in the sender's `localStorage` under the
     * SlothBox origin.
     *
     * To revoke a share, the sender's browser sends
     * `Authorization: Bearer <base64url(token)>` to the destroy
     * endpoint. The gateway hashes the incoming token (SHA-256) and
     * compares it to the stored value via `timingSafeEqual`.
     *
     * NULL = legacy share predating this migration; cannot be revoked
     * by a token (TTL / burn / abuse-admin only). New shares get a
     * non-NULL hash at create time and ARE revocable.
     */
    revokeTokenHash: bytea("revoke_token_hash"),
  },
  (t) => ({
    shortIdIdx: index("shares_short_id_idx").on(t.shortId),
    ownerIdIdx: index("shares_owner_id_idx").on(t.ownerId),
    expiresAtIdx: index("shares_expires_at_idx").on(t.expiresAt),
    stateIdx: index("shares_state_idx").on(t.state),
    passwordProtectedIdx: index("shares_password_protected_idx").on(t.passwordProtected),
    revokeTokenPresentIdx: index("shares_revoke_token_present_idx").on(t.createdAt),
  })
);

export const shareChunks = pgTable(
  "share_chunks",
  {
    shareId: uuid("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    nonce: bytea("nonce").notNull(),
    blobKey: text("blob_key").notNull(),
    ciphertextSize: integer("ciphertext_size").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }),
    /**
     * First time this chunk's ciphertext was fully streamed back to a
     * downloader. Set by the ingest service via the `mark_chunk_served`
     * SQL helper (migration 0004) once `stream.CopyToAsync` returns
     * successfully. Preserved across legitimate retries (COALESCE on
     * UPDATE) so the timestamp records the moment of first delivery,
     * not the moment of last delivery. NULL until the first successful
     * GET on this chunk.
     */
    servedAt: timestamp("served_at", { withTimezone: true }),
    /**
     * Total number of times this chunk has been served. Increments on
     * every successful delivery — legitimate retry, parallel reader,
     * post-burn-window leftover request, anything. Instrumentation
     * only; the burn decision uses `servedAt IS NULL` count, never
     * this counter.
     */
    servedCount: integer("served_count").notNull().default(0),
    /**
     * Single-use chunk download token commitment (migration 0007).
     *
     * 32-byte SHA-256 of a client-derived token. The raw token is
     * computed deterministically in the browser from the URL fragment
     * key + shortId + chunkIndex; the server only ever sees the
     * commitment + the bearer-presented token at chunk-fetch time.
     *
     * NULL = legacy chunk predating this migration; the ingest endpoint
     * treats it as "no token required" and serves anyway. New chunks
     * carry a non-NULL hash and are token-gated. The "single-use"
     * property piggybacks on `servedAt` from migration 0004 — once
     * `servedAt` is non-null, the chunk endpoint returns 410.
     */
    downloadTokenHash: bytea("download_token_hash"),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.shareId, t.chunkIndex] }),
  })
);

export const auditEventType = [
  "share_created",
  "share_downloaded",
  "share_destroyed",
  "chain_anchor",
  "auth_login",
  "admin_action",
] as const;
export type AuditEventType = (typeof auditEventType)[number];

export const auditChain = pgTable(
  "audit_chain",
  {
    seq: bigserial("seq", { mode: "bigint" }).primaryKey(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    eventType: text("event_type").$type<AuditEventType>().notNull(),
    shareId: uuid("share_id"),
    payload: jsonb("payload").notNull(),
    prevHash: bytea("prev_hash").notNull(),
    entryHash: bytea("entry_hash").notNull(),
  },
  (t) => ({
    shareIdx: index("audit_chain_share_idx").on(t.shareId),
    eventIdx: index("audit_chain_event_idx").on(t.eventType),
    timeIdx: index("audit_chain_time_idx").on(t.occurredAt),
  })
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    counter: integer("counter").notNull().default(1),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.bucket, t.windowStart] }),
    windowIdx: index("rate_limits_window_idx").on(t.windowStart),
  })
);

export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
export type ShareChunk = typeof shareChunks.$inferSelect;
export type AuditEntry = typeof auditChain.$inferSelect;
