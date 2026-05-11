-- 0007_single_use_chunk_tokens.sql
--
-- Single-use chunk download tokens. Closes the v0.1 WARNING block #2
-- ("two simultaneous readers in parallel: a legitimate recipient and
-- a wiretap on transit who both have the URL can both complete their
-- downloads if their chunk fetches interleave").
--
-- TRUST MODEL — per-chunk one-shot capabilities, derivable from the URL
-- ============================================================================
-- Every chunk row gains a per-chunk SHA-256 token-hash. The raw token
-- is NOT stored on the server; the server only sees the commitment
-- and the bearer-presented token at GET time.
--
-- Token derivation (client-side, deterministic from the URL fragment):
--
--     token_i = SHA-256(
--         "slothbox-chunk-token-v1" || 0x00 ||
--         fragment_key ||
--         length_prefixed_short_id ||
--         chunk_index_be
--     )
--
-- The token is deterministic from (fragment_key, shortId, chunkIndex),
-- so both sender (at upload) and recipient (at download) compute the
-- same value without any coordination — no over-the-wire token
-- delivery, no localStorage scoping issue.
--
-- The "single-use" property piggybacks on migration 0004's existing
-- `served_at` column: the ingest service refuses to serve a chunk
-- whose `served_at` is non-null with HTTP 410, so the second arrival
-- (legitimate-or-wiretap) loses the race regardless of who they are.
-- The defender's file is safe-but-undelivered to BOTH parties — an
-- improvement over v0.1 where both parties succeeded.
--
-- Why the column instead of a tokens table:
--   Each chunk has exactly one token-hash for its lifetime, so a
--   per-chunk column is the cleanest shape — no join, no FK, no
--   separate index. The column is partial-indexed by `served_at IS
--   NULL` already (migration 0004's `share_chunks_unserved_idx`)
--   which covers the "is this chunk still fetchable" lookup; we
--   don't need to index the token hash itself because the lookup is
--   always by (share_id, chunk_index) → row first.
--
-- Backward compatibility:
--   `download_token_hash` is nullable. v0.1 chunks (uploaded before
--   this migration) have NULL — ingest's download endpoint treats
--   NULL as "no token required" and serves anyway, preserving the
--   v0.1 download semantic. New chunks (uploaded after this
--   migration) carry a non-NULL hash and are token-gated.
--
-- Why SHA-256 on the server-side commitment and not BLAKE2b:
--   Same rationale as migration 0006's revoke-token-hash column:
--   the boundary is HTTP, not the AEAD pipeline; Node's stdlib
--   `crypto.createHash('sha256')` and WebCrypto's
--   `subtle.digest('SHA-256', …)` both ship in-box on both sides;
--   collision-resistance for a 32-byte uniform-random preimage is
--   identical between SHA-256 and BLAKE2b for this use case.

BEGIN;

ALTER TABLE share_chunks
    ADD COLUMN IF NOT EXISTS download_token_hash BYTEA;

-- Length check — the hash is always exactly 32 bytes when present.
ALTER TABLE share_chunks
    ADD CONSTRAINT share_chunks_dl_token_hash_len_chk CHECK (
        download_token_hash IS NULL OR octet_length(download_token_hash) = 32
    );

-- Reset trigger from migration 0004 already clears served_at/served_count
-- on blob_key replacement. We extend it here to also clear
-- download_token_hash if the upload was retried with a new token
-- (which can happen when a client redoes a chunk upload after a
-- session restart that lost the original derivation state). The new
-- blob is a different artefact; the old token-hash is stale.

CREATE OR REPLACE FUNCTION clear_chunk_delivery_on_replace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.blob_key IS DISTINCT FROM OLD.blob_key
           OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
        THEN
            NEW.served_at          := NULL;
            NEW.served_count       := 0;
            -- New blob → potentially new token-hash. The UPSERT on
            -- /chunk/:shortId/:chunkIndex provides the new hash via
            -- EXCLUDED.download_token_hash, which this trigger does
            -- NOT clobber (we only zero out fields the new write
            -- doesn't carry).
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- The DROP/CREATE pair from 0004 is reapplied so the trigger lands
-- with the v0.7 function body even if 0004 had already created the
-- original. Migrations are idempotent on this trigger by construction.
DROP TRIGGER IF EXISTS share_chunks_clear_delivery ON share_chunks;
CREATE TRIGGER share_chunks_clear_delivery
    BEFORE UPDATE ON share_chunks
    FOR EACH ROW
    EXECUTE FUNCTION clear_chunk_delivery_on_replace();

COMMIT;
