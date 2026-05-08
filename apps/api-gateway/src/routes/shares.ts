/**
 * /api/shares/* — share lifecycle.
 *
 * Endpoints:
 *   POST   /api/shares                     — create a share
 *   GET    /api/shares/:shortId            — fetch share metadata
 *   POST   /api/shares/:shortId/destroy    — manual revocation
 *   POST   /api/shares/:shortId/downloaded — bump download counter
 *
 * All endpoints validate input through Zod, every state-changing call
 * is rate-limited, and every state transition lands in the audit
 * chain via the `append_audit_entry` Postgres RPC. The gateway never
 * touches plaintext — `encryptedMeta` and `nonceMeta` are opaque
 * client-supplied bytes.
 *
 * The "auth" model in v0.1 is "knowledge of the shortId equals
 * authorisation" — the shortId is a 12-char nanoid from a 31-symbol
 * URL-safe alphabet (~60 bits of entropy), and the access link is
 * delivered via an out-of-band channel of the user's choosing. v0.5
 * will add owned shares + bearer auth.
 */

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { customAlphabet } from "nanoid";
import { eq, sql } from "drizzle-orm";
import { getDb, shares, type ShareState } from "@slothbox/db";
import { config } from "../lib/config.js";
import { logger } from "../lib/logger.js";
import { getNats } from "../lib/nats.js";
import { rateLimit, type RateLimitRule } from "../middleware/rateLimit.js";
import type { RequestIdVars } from "../middleware/requestId.js";
import { sharesCreatedTotal, sharesDestroyedTotal, sharesFetchedTotal } from "../lib/metrics.js";

/** Hono env shared across routers — every router carries the request id. */
type RouterEnv = { Variables: RequestIdVars };

// ─── Constants ────────────────────────────────────────────────────

/**
 * URL-safe alphabet for short IDs. No vowels-that-confuse, no
 * ambiguous-shape pairs (0/o, 1/i/l). 31 chars × 12 positions ≈ 60
 * bits of entropy, sufficient for the share-link-is-the-secret model.
 */
const SHORT_ID_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const SHORT_ID_LENGTH = 12;
const generateShortId = customAlphabet(SHORT_ID_ALPHABET, SHORT_ID_LENGTH);

/** 32 bytes = 256-bit BLAKE2b hash, base64url-encoded → 43 chars. */
const FILE_HASH_BYTES = 32;
/** 24 bytes = XChaCha20-Poly1305 nonce, base64url-encoded → 32 chars. */
const NONCE_META_BYTES = 24;

// ─── Helpers ──────────────────────────────────────────────────────

/**
 * Decode a base64url string to a Uint8Array. Strict: rejects standard
 * base64 (with `+/=`), only the URL-safe variant is allowed because
 * that's what the crypto-core library emits.
 */
function decodeBase64Url(input: string): Uint8Array {
  // Reject characters that don't belong in base64url. Length checks
  // happen at the Zod layer before this is called.
  if (!/^[A-Za-z0-9_-]+$/.test(input)) {
    throw new HTTPException(400, {
      message: "encoded value is not valid base64url",
    });
  }
  // Pad to a multiple of 4 for Buffer.from; convert to standard base64.
  const padded = input + "=".repeat((4 - (input.length % 4)) % 4);
  const standard = padded.replace(/-/g, "+").replace(/_/g, "/");
  return new Uint8Array(Buffer.from(standard, "base64"));
}

/** Encode a Uint8Array (or Buffer) back to base64url for response bodies. */
function encodeBase64Url(buf: Uint8Array | Buffer): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Append an audit entry via the Postgres RPC. This is one of the only
 * places we issue a raw SQL call — Drizzle doesn't (yet) model
 * `append_audit_entry(text, uuid, jsonb)`. The RPC is wrapped in its
 * own SECURITY DEFINER function and acquires a per-chain advisory
 * lock, so concurrent calls serialise correctly.
 *
 * Failures are logged but do NOT abort the parent request — the share
 * record is the source of truth, and missed audit entries can be
 * back-filled (with a flag) if the chain is ever broken. We never
 * want a shared service problem (e.g. brief Postgres replica blip on
 * the `digest` extension) to take down the create path.
 */
async function appendAudit(
  eventType: "share_created" | "share_downloaded" | "share_destroyed" | "chain_anchor",
  shareId: string | null,
  payload: Record<string, unknown>,
  requestId: string
): Promise<void> {
  try {
    const db = getDb();
    // Pass the JSON string as a parameter — postgres-js binds it into
    // ::jsonb cleanly. NEVER interpolate JSON via sql.raw — that's a
    // SQL-injection landmine the moment a payload value contains
    // attacker-controlled bytes (and several of ours do, e.g.
    // shortId in destroy logs is generated server-side but the
    // pattern shouldn't tolerate the vulnerable shape at all).
    const payloadJson = JSON.stringify(payload);
    await db.execute(
      sql`SELECT append_audit_entry(${eventType}::text, ${shareId}::uuid, ${payloadJson}::jsonb)`
    );
  } catch (err) {
    logger.error(
      {
        requestId,
        eventType,
        shareId,
        err: { message: (err as Error).message },
      },
      "audit append failed — chain may be incomplete"
    );
  }
}

/**
 * Build a presigned-style upload URL for one chunk. v0.1 emits a plain
 * absolute URL keyed by the public shortId — short enough to encode in
 * the URL fragment if we ever need to. The ingest service mounts both
 * PUT and GET on `/chunk/:shortId/:chunkIndex`. v0.5 will add an HMAC
 * `?token=…` parameter signed by the gateway and verified by ingest so
 * the URLs become single-use.
 */
function buildUploadUrl(shortId: string, chunkIndex: number): string {
  const base = config.INGEST_PUBLIC_URL.replace(/\/+$/, "");
  return `${base}/chunk/${shortId}/${chunkIndex}`;
}

// ─── Zod schemas ──────────────────────────────────────────────────

/**
 * Body schema for POST /api/shares.
 *
 * Per-field bounds + a cross-field `.superRefine` cap — the audit on
 * 2026-05-08 surfaced that without the cross-field check, a single
 * share could legitimately declare `chunkCount × chunkSize` up to
 * 1 TB (100,000 × 10 MB). Combined with the 100/day/IP create rate
 * limit, a script could squat ~3 TB/day per IP until expiry. The
 * cross-field cap keeps both the plaintext `fileSize` and the
 * ciphertext storage ceiling at `config.MAX_FILE_SIZE_BYTES` (4 GB
 * by default), matching the client-side cap.
 */
const CreateShareSchema = z
  .object({
    /**
     * Plaintext file size in bytes. Capped at MAX_FILE_SIZE_BYTES
     * (4 GB default) so a malicious client can't declare a
     * pathological size and force pre-allocation costs downstream.
     */
    fileSize: z
      .number()
      .int()
      .positive()
      .max(config.MAX_FILE_SIZE_BYTES, "fileSize exceeds MAX_FILE_SIZE_BYTES"),
    fileHash: z
      .string()
      .min(1)
      .max(64)
      .refine(
        (v) => decodeBase64Url(v).byteLength === FILE_HASH_BYTES,
        `fileHash must decode to exactly ${FILE_HASH_BYTES} bytes`
      ),
    encryptedMeta: z.string().min(1).max(8192),
    nonceMeta: z
      .string()
      .min(1)
      .max(64)
      .refine(
        (v) => decodeBase64Url(v).byteLength === NONCE_META_BYTES,
        `nonceMeta must decode to exactly ${NONCE_META_BYTES} bytes`
      ),
    chunkCount: z.number().int().positive().max(100_000),
    chunkSize: z
      .number()
      .int()
      .positive()
      .max(config.MAX_CHUNK_SIZE_BYTES, "chunkSize exceeds MAX_CHUNK_SIZE_BYTES"),
    expiresAt: z
      .string()
      .datetime({ offset: true })
      .refine((iso) => {
        const at = new Date(iso).getTime();
        return Number.isFinite(at) && at > Date.now();
      }, "expiresAt must be a future ISO-8601 timestamp")
      .refine((iso) => {
        const at = new Date(iso).getTime();
        const ttlMs = config.MAX_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000;
        return at - Date.now() <= ttlMs;
      }, `expiresAt cannot be more than ${config.MAX_SHARE_TTL_DAYS} days from now`),
    burnAfterRead: z.boolean(),
    maxDownloads: z.number().int().positive().max(10_000).nullable(),
  })
  /**
   * Cross-field cap on total ciphertext storage. Closes the
   * cost-amplification vector flagged on 2026-05-08:
   *
   *   chunkCount * chunkSize  must be ≤ MAX_FILE_SIZE_BYTES
   *
   * Worked examples after the fix (4 GB default cap):
   *   - chunkSize 10 MB → max chunkCount ≈ 410   (vs 100,000 before)
   *   - chunkSize 1 MB  → max chunkCount ≈ 4,096
   *   - chunkSize 64 KB → max chunkCount ≈ 65,536 (still under the
   *                                                 100k bound)
   *
   * AEAD overhead per chunk is ~40 bytes (24-byte XChaCha20 nonce +
   * 16-byte Poly1305 tag) — well under 0.1% on a 4 GB share at any
   * sane chunk size, so we don't bother with a separate ciphertext-
   * overhead allowance.
   *
   * Numerical safety: 100_000 * 10_485_760 = 1,048,576,000,000 — this
   * stays comfortably inside Number.MAX_SAFE_INTEGER (2^53 ≈ 9×10^15)
   * so the multiplication can never silently lose precision.
   */
  .superRefine((data, ctx) => {
    const totalCiphertext = data.chunkCount * data.chunkSize;
    if (totalCiphertext > config.MAX_FILE_SIZE_BYTES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunkCount"],
        message:
          `chunkCount * chunkSize (${totalCiphertext}) exceeds ` +
          `MAX_FILE_SIZE_BYTES (${config.MAX_FILE_SIZE_BYTES})`,
      });
    }
    /**
     * Sanity floor on chunk allocation: the declared ciphertext
     * capacity must be at least as large as the plaintext fileSize.
     * Without this, a client could declare a 4 GB plaintext but only
     * allocate 1 MB of chunk storage — the upload will fail anyway,
     * but rejecting at the boundary is cheaper than letting the
     * client burn rate-limit budget on a doomed create.
     */
    if (totalCiphertext < data.fileSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["chunkCount"],
        message:
          `chunkCount * chunkSize (${totalCiphertext}) is smaller ` +
          `than declared fileSize (${data.fileSize})`,
      });
    }
  });

/** Param schema shared by every :shortId route. */
const ShortIdParamSchema = z.object({
  shortId: z
    .string()
    .length(SHORT_ID_LENGTH)
    .regex(
      new RegExp(`^[${SHORT_ID_ALPHABET}]{${SHORT_ID_LENGTH}}$`),
      "shortId contains invalid characters"
    ),
});

// ─── Rate-limit rules ─────────────────────────────────────────────

/** Anonymous create caps. Tuned to be generous for honest users. */
const createRules: readonly RateLimitRule[] = [
  {
    bucket: "create_minute",
    windowMs: 60_000,
    max: config.RATE_LIMIT_CREATE_PER_MINUTE,
  },
  {
    bucket: "create_day",
    windowMs: 24 * 60 * 60 * 1000,
    max: config.RATE_LIMIT_CREATE_PER_DAY,
  },
];

/** Read cap — defends against shortId enumeration scrapers. */
const readRules: readonly RateLimitRule[] = [
  {
    bucket: "read_minute",
    windowMs: 60_000,
    max: config.RATE_LIMIT_READ_PER_MINUTE,
  },
];

// ─── Router ───────────────────────────────────────────────────────

/** Build the /api/shares/* router. */
export function sharesRouter(): Hono<RouterEnv> {
  const r = new Hono<RouterEnv>();

  // ── POST /api/shares ─────────────────────────────────────────
  r.post(
    "/shares",
    rateLimit(createRules),
    zValidator("json", CreateShareSchema, (result) => {
      if (!result.success) {
        const details = result.error.issues
          .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
          .join("; ");
        throw new HTTPException(400, {
          message: `invalid request body: ${details}`,
        });
      }
    }),
    async (c) => {
      const requestId = c.get("requestId");
      const body = c.req.valid("json");

      const shortId = generateShortId();
      const fileHashBytes = decodeBase64Url(body.fileHash);
      const nonceMetaBytes = decodeBase64Url(body.nonceMeta);
      const encryptedMetaBytes = decodeBase64Url(body.encryptedMeta);

      const db = getDb();

      // Insert the row. Drizzle handles the bytea conversion via the
      // custom type defined in @slothbox/db.
      const [row] = await db
        .insert(shares)
        .values({
          shortId,
          ownerId: null,
          expiresAt: new Date(body.expiresAt),
          burnAfterRead: body.burnAfterRead,
          maxDownloads: body.maxDownloads,
          fileHash: fileHashBytes,
          fileSize: BigInt(body.fileSize),
          encryptedMeta: encryptedMetaBytes,
          nonceMeta: nonceMetaBytes,
          chunkCount: body.chunkCount,
          chunkSize: body.chunkSize,
          state: "pending" satisfies ShareState,
        })
        .returning({
          id: shares.id,
          shortId: shares.shortId,
          chunkCount: shares.chunkCount,
        });

      if (!row) {
        // Should be impossible — RETURNING on a successful INSERT
        // always yields a row. Belt-and-braces.
        throw new HTTPException(500, { message: "share insert returned no row" });
      }

      // Audit entry — fire-and-forget on the background path.
      void appendAudit(
        "share_created",
        row.id,
        {
          shortId: row.shortId,
          chunkCount: row.chunkCount,
          burnAfterRead: body.burnAfterRead,
          ttlSeconds: Math.floor((new Date(body.expiresAt).getTime() - Date.now()) / 1000),
        },
        requestId
      );

      sharesCreatedTotal.inc({ burn_after_read: String(body.burnAfterRead) });

      // Build upload URLs the client can stream chunks to.
      // Keyed by shortId (matches the ingest contract) — NOT shareId.
      const uploadUrls: string[] = [];
      for (let i = 0; i < row.chunkCount; i++) {
        uploadUrls.push(buildUploadUrl(row.shortId, i));
      }

      // Log only what helps debugging — no IP, no shortId+IP combo.
      logger.info(
        {
          requestId,
          event: "share_created",
          chunkCount: row.chunkCount,
          burnAfterRead: body.burnAfterRead,
        },
        "share created"
      );

      return c.json(
        {
          shareId: row.id,
          shortId: row.shortId,
          uploadUrls,
        },
        201
      );
    }
  );

  // ── GET /api/shares/:shortId ─────────────────────────────────
  r.get(
    "/shares/:shortId",
    rateLimit(readRules),
    zValidator("param", ShortIdParamSchema, (result) => {
      if (!result.success) {
        throw new HTTPException(404, { message: "share not found" });
      }
    }),
    async (c) => {
      const { shortId } = c.req.valid("param");
      const db = getDb();

      const [row] = await db
        .select({
          id: shares.id,
          shortId: shares.shortId,
          expiresAt: shares.expiresAt,
          burnAfterRead: shares.burnAfterRead,
          fileSize: shares.fileSize,
          encryptedMeta: shares.encryptedMeta,
          nonceMeta: shares.nonceMeta,
          chunkCount: shares.chunkCount,
          chunkSize: shares.chunkSize,
          state: shares.state,
        })
        .from(shares)
        .where(eq(shares.shortId, shortId))
        .limit(1);

      if (!row) {
        sharesFetchedTotal.inc({ outcome: "miss" });
        throw new HTTPException(404, { message: "share not found" });
      }

      // Treat expired/destroyed as not-found to leak nothing about
      // historical existence. Frontend can't distinguish "never
      // existed" from "was burned five minutes ago" — that's
      // intentional.
      if (row.state === "destroyed" || row.state === "expired") {
        sharesFetchedTotal.inc({ outcome: row.state });
        throw new HTTPException(404, { message: "share not found" });
      }
      if (row.expiresAt.getTime() <= Date.now()) {
        sharesFetchedTotal.inc({ outcome: "expired" });
        throw new HTTPException(404, { message: "share not found" });
      }

      sharesFetchedTotal.inc({ outcome: "hit" });

      // NOTE: we deliberately do NOT return fileHash here. The hash is
      // only useful to the download-side after decryption to verify
      // tamper-resistance, and exposing it pre-download lets a
      // malicious actor ratchet through all shortIds and identify
      // known bad/CSAM files by hash without ever downloading. v1.0
      // will gate the hash behind an authenticated downloader.
      return c.json(
        {
          shortId: row.shortId,
          expiresAt: row.expiresAt.toISOString(),
          burnAfterRead: row.burnAfterRead,
          fileSize: row.fileSize.toString(), // bigint → string for JSON safety
          encryptedMeta: encodeBase64Url(row.encryptedMeta),
          nonceMeta: encodeBase64Url(row.nonceMeta),
          chunkCount: row.chunkCount,
          chunkSize: row.chunkSize,
          state: row.state,
        },
        200
      );
    }
  );

  // ── POST /api/shares/:shortId/destroy ────────────────────────
  r.post(
    "/shares/:shortId/destroy",
    rateLimit(readRules), // same low limit — anyone with shortId can destroy in v0.1
    zValidator("param", ShortIdParamSchema, (result) => {
      if (!result.success) {
        throw new HTTPException(404, { message: "share not found" });
      }
    }),
    async (c) => {
      const requestId = c.get("requestId");
      const { shortId } = c.req.valid("param");
      const db = getDb();

      const [updated] = await db
        .update(shares)
        .set({
          state: "destroyed",
          destroyedAt: new Date(),
          destroyedReason: "manual",
        })
        .where(eq(shares.shortId, shortId))
        .returning({ id: shares.id, state: shares.state });

      if (!updated) {
        throw new HTTPException(404, { message: "share not found" });
      }

      const destroyedId = updated.id;
      void appendAudit("share_destroyed", destroyedId, { shortId, reason: "manual" }, requestId);
      sharesDestroyedTotal.inc({ reason: "manual" });

      // Signal the reaper so blobs are purged ASAP. Best-effort.
      void (async () => {
        const nc = await getNats();
        if (!nc) return;
        try {
          nc.publish(
            "slothbox.share.destroyed",
            new TextEncoder().encode(JSON.stringify({ shareId: destroyedId, reason: "manual" }))
          );
        } catch (err) {
          logger.warn(
            { requestId, err: { message: (err as Error).message } },
            "nats publish failed (non-fatal)"
          );
        }
      })();

      logger.info({ requestId, event: "share_destroyed", reason: "manual" }, "share destroyed");

      return c.json({ state: updated.state }, 200);
    }
  );

  // ── POST /api/shares/:shortId/downloaded ─────────────────────
  r.post(
    "/shares/:shortId/downloaded",
    rateLimit(readRules),
    zValidator("param", ShortIdParamSchema, (result) => {
      if (!result.success) {
        throw new HTTPException(404, { message: "share not found" });
      }
    }),
    async (c) => {
      const requestId = c.get("requestId");
      const { shortId } = c.req.valid("param");
      const db = getDb();

      // The increment_download RPC is the source of truth for state
      // transitions on download — burn-after-read fires destroyed,
      // hitting maxDownloads fires expired, both atomically.
      let updated: { id: string; state: ShareState; burnAfterRead: boolean } | null = null;
      try {
        const result = await db.execute(
          sql`SELECT id, state, burn_after_read AS "burnAfterRead" FROM increment_download(${shortId})`
        );
        // postgres-js returns an array-like with rows; defensive read.
        const rows = result as unknown as ReadonlyArray<{
          id: string;
          state: ShareState;
          burnAfterRead: boolean;
        }>;
        const first = rows[0];
        if (first) updated = first;
      } catch (err) {
        // The RPC raises 'share not available' for any non-eligible
        // state — turn that into a 404 without leaking the SQL.
        const message = (err as Error).message ?? "";
        if (message.includes("share not available")) {
          throw new HTTPException(404, { message: "share not found" });
        }
        throw err;
      }

      if (!updated) {
        throw new HTTPException(404, { message: "share not found" });
      }

      const becameDestroyed = updated.state === "destroyed";
      const eventType = becameDestroyed ? "share_destroyed" : "share_downloaded";

      void appendAudit(
        eventType,
        updated.id,
        {
          shortId,
          becameDestroyed,
          reason: becameDestroyed ? "burn" : undefined,
        },
        requestId
      );

      if (becameDestroyed) {
        sharesDestroyedTotal.inc({ reason: "burn" });

        // Capture the share id outside the async IIFE so TS doesn't
        // need a non-null assertion across the closure boundary.
        const destroyedShareId = updated.id;
        // Burn-after-read → notify reaper instantly via NATS.
        void (async () => {
          const nc = await getNats();
          if (!nc) return;
          try {
            nc.publish(
              "slothbox.share.destroyed",
              new TextEncoder().encode(
                JSON.stringify({ shareId: destroyedShareId, reason: "burn" })
              )
            );
          } catch (err) {
            logger.warn(
              { requestId, err: { message: (err as Error).message } },
              "nats publish failed (non-fatal)"
            );
          }
        })();
      }

      logger.info(
        { requestId, event: eventType },
        becameDestroyed ? "share burned after read" : "share downloaded"
      );

      return c.json({ state: updated.state }, 200);
    }
  );

  return r;
}
