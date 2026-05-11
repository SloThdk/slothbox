-- 0006_sender_revoke_token.sql
--
-- Sender-revoke tokens. Closes the second half of the v0.1 WARNING block
-- #1: previously "anyone holding a share URL can destroy the share OR
-- download the ciphertext". The password protection from migration 0005
-- closed the "download" half for password-protected shares; this
-- migration closes the "destroy" half for ALL new shares by binding the
-- destroy authority to a 32-byte random token only the sender's browser
-- holds.
--
-- TRUST MODEL — the token is NEVER stored or transmitted to the server
-- ============================================================================
-- The server stores ONE thing per share for revoke purposes:
--   * revoke_token_hash — 32 bytes, SHA-256 of the sender-generated token
--
-- The flow:
--   1. Sender's browser generates 32 bytes of uniform random (libsodium
--      `randombytes_buf`).
--   2. Sender's browser computes `SHA-256(token)` and sends the hash as
--      part of the create-share request.
--   3. Server stores the hash on the share row.
--   4. Sender's browser writes `{shortId, token}` to localStorage under
--      the origin key — the only place the raw token lives.
--   5. To revoke, sender's browser sends `Authorization: Bearer <token>`.
--      The server hashes the incoming token (SHA-256) and compares
--      against the stored value via `timingSafeEqual`.
--
-- Consequences:
--   * URL leak is no longer enough to destroy a share. Even with the
--     full share URL, a third party cannot invoke /destroy without the
--     companion token that lives only in the sender's localStorage.
--   * The server's hash is functionally a one-way commitment — a
--     compromised DB dump cannot be reversed into a valid token (256
--     bits of entropy, unsalted SHA-256, brute-force infeasible).
--   * Legacy shares created before this migration have NULL
--     `revoke_token_hash`. The gateway returns 410 GONE on /destroy
--     attempts against legacy shares — they can still expire on TTL or
--     be burned by the recipient, just not revoked by a sender who has
--     no token to present.
--
-- Why SHA-256 (not BLAKE2b like the rest of crypto-core):
--   The application boundary for this token is HTTP, not the AEAD
--   pipeline. SHA-256 is in Node's stdlib + WebCrypto on both sides,
--   needs no libsodium import on the gateway path, and `timingSafeEqual`
--   is the canonical constant-time compare for SHA-256 digests. BLAKE2b
--   would mean adding libsodium-net to the gateway just to verify a
--   token — wrong shape for a primitive only used here. Hash collision
--   resistance for a 32-byte uniform random preimage is identical
--   between the two functions for this use case.
--
-- Why NULL is the default (not a forced backfill):
--   In-flight v0.1 shares already exist with no token. We could mint a
--   token on first /destroy attempt + email it, but there is no email
--   on file (anonymous shares). The pragmatic compromise: legacy shares
--   are read-only after this migration — they expire normally, they get
--   burned normally, they just can't be early-revoked. New shares get
--   a token at create time and ARE revocable. The legacy class shrinks
--   to zero as TTLs (max 7 days) elapse.

BEGIN;

ALTER TABLE shares
    ADD COLUMN IF NOT EXISTS revoke_token_hash BYTEA;

-- Length check. The hash is a fixed 32-byte SHA-256 digest, never longer
-- or shorter. Catching mismatches at the boundary stops the gateway from
-- accepting a malformed payload that would otherwise sit on the row
-- forever and fail constant-time compare in a confusing way later.
ALTER TABLE shares
    ADD CONSTRAINT shares_revoke_token_hash_len_chk CHECK (
        revoke_token_hash IS NULL OR octet_length(revoke_token_hash) = 32
    );

-- Partial index on the hash so the destroy path's
--   SELECT revoke_token_hash FROM shares WHERE short_id = $1
-- stays a single-row index lookup (the existing short_id unique index
-- handles the WHERE; this one is for any future query that filters or
-- joins on revoke-token presence — e.g. an admin endpoint that lists
-- "shares with no revoke-token" to track legacy backlog drain).
CREATE INDEX IF NOT EXISTS shares_revoke_token_present_idx
    ON shares (created_at)
    WHERE revoke_token_hash IS NOT NULL;

COMMIT;
