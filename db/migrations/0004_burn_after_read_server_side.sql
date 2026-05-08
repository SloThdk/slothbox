-- 0004_burn_after_read_server_side.sql
--
-- Move the burn-after-read trigger from the recipient's browser to the
-- ingest service. Before this migration, burn-after-read fired only when
-- the receiver-side JS politely called `POST /api/shares/:shortId/downloaded`
-- after a successful client-side decrypt. A hostile recipient who suppressed
-- that callback (browser console one-liner, curl loop, non-browser client)
-- could keep the share `state = 'ready'` until its TTL — defeating the
-- entire "burn after read" trust claim.
--
-- The fix is server-driven delivery tracking:
--
--   1. share_chunks gets a `served_at` timestamp and a `served_count` counter.
--      `served_at` is set the first time a chunk is fully streamed back to
--      a client; `served_count` increments on every delivery (instrumentation
--      only, never load-bearing for the burn decision).
--
--   2. `mark_chunk_served(share_id, chunk_index)` is the canonical write path.
--      The ingest service calls it once per chunk after `stream.CopyToAsync`
--      returns successfully — i.e. once the bytes have physically left the
--      server. Inside the function, after the chunk row is updated, we lock
--      the parent shares row and check whether every chunk now has a
--      `served_at` value. If yes, and the share is `burn_after_read = true`
--      and currently `state = 'ready'`, we atomically:
--         - flip state → 'destroyed'
--         - set destroyed_at = now(), destroyed_reason = 'burn'
--         - bump download_count
--         - append a `share_destroyed` audit-chain entry inside the same txn
--      The reaper (60 s sweep) picks up the destroyed-with-chunks state on
--      its next tick and removes the MinIO blobs.
--
--   3. The gateway's existing `POST /shares/:shortId/downloaded` endpoint
--      stays in place for backwards compatibility but is now decorative —
--      by the time a polite client reaches it, the ingest path will already
--      have flipped the state. The endpoint is made idempotent in TS so
--      a redundant call returns 200, not 404.
--
-- Race notes:
--   * Two parallel chunk completions could otherwise both think one chunk
--     remains unserved (each sees the other's UPDATE as not-yet-committed
--     under READ COMMITTED). We serialise inside `mark_chunk_served` by
--     taking a `SELECT ... FOR UPDATE` row lock on the parent shares row
--     before the chunk update. Postgres holds the lock until COMMIT, so
--     the unserved-count check sees a fully-consistent view.
--   * The gateway's `increment_download` and the ingest's
--     `mark_chunk_served` can race in either order. Whichever runs first
--     flips state → 'destroyed'; the second sees `state != 'ready'` and
--     no-ops. No double-burn, no duplicate audit entry.
--   * Re-uploading a chunk during the upload phase resets served_at to
--     NULL and served_count to 0 (see ON CONFLICT clause referenced from
--     UpsertChunkAsync) — the new blob deserves a fresh delivery
--     accounting. Re-uploads after `state = 'ready'` are blocked by
--     UploadEndpoint's CanAcceptUploads check, so the reset is a v0.1
--     belt-and-braces.
--
-- Forward-compat: when v0.5 introduces single-use HMAC chunk tokens (per
-- buildUploadUrl's TODO in shares.ts:138-141), `mark_chunk_served` becomes
-- the inner half of token consumption — the outer half verifies the token
-- before serving the bytes at all. Migrating the shape doesn't require
-- another schema change; the extra fields land on share_chunks alongside
-- served_at.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema additions
-- ---------------------------------------------------------------------------

ALTER TABLE share_chunks
    ADD COLUMN IF NOT EXISTS served_at    TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS served_count INTEGER NOT NULL DEFAULT 0;

-- Index the unserved-chunks lookup. The function does:
--     SELECT COUNT(*) FROM share_chunks
--      WHERE share_id = $1 AND served_at IS NULL
-- which without an index is a full scan over all chunks of the share. With
-- the partial index, the count is a tiny range read on the rows that are
-- actually pending. We make it a partial index because for the steady-state
-- of a share that's been fully delivered, every row has served_at set and
-- the index is empty — zero storage cost in the common case.
CREATE INDEX IF NOT EXISTS share_chunks_unserved_idx
    ON share_chunks (share_id)
    WHERE served_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. mark_chunk_served — the new canonical burn trigger.
-- ---------------------------------------------------------------------------
--
-- Returns three fields:
--   * burn_fired:  true iff THIS call atomically flipped state → 'destroyed'
--   * share_state: the row's state after the function commits
--   * audit_id:    the audit_chain.seq for the new share_destroyed entry,
--                  or NULL when burn_fired = false
--
-- The caller (ingest service) uses burn_fired to decide whether to publish
-- a NATS `slothbox.share.destroyed` event so the reaper can run an
-- immediate sweep instead of waiting for the next 60 s tick.

CREATE OR REPLACE FUNCTION mark_chunk_served(
    p_share_id    UUID,
    p_chunk_index INTEGER
)
RETURNS TABLE(
    burn_fired  BOOLEAN,
    share_state TEXT,
    audit_id    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_share          shares;
    v_unserved_count INTEGER;
    v_burn_fired     BOOLEAN := FALSE;
    v_audit_id       BIGINT;
    v_payload        JSONB;
BEGIN
    -- Lock the parent shares row first. Two purposes:
    --   (a) serialises the burn-fire decision against parallel chunk
    --       completions (otherwise the unserved-count race described in
    --       the file header fires);
    --   (b) serialises against the gateway's increment_download path —
    --       whichever transaction acquires the lock first flips the row,
    --       the other sees state != 'ready' and does nothing.
    SELECT * INTO v_share FROM shares WHERE id = p_share_id FOR UPDATE;

    IF NOT FOUND THEN
        -- Share row already gone — reaper has finished a destroy txn
        -- between when the chunk started streaming and now. The chunk
        -- row will be ON DELETE CASCADE'd when its parent goes; nothing
        -- left for us to do. Caller treats this as success-shaped.
        RETURN QUERY SELECT FALSE, 'destroyed'::TEXT, NULL::BIGINT;
        RETURN;
    END IF;

    -- Mark THIS chunk as served. served_at is preserved across retries
    -- via COALESCE so we keep the moment of first delivery; served_count
    -- increments on every delivery (legitimate retry, parallel reader,
    -- whatever — purely instrumentation).
    UPDATE share_chunks
       SET served_at    = COALESCE(served_at, now()),
           served_count = served_count + 1
     WHERE share_id    = p_share_id
       AND chunk_index = p_chunk_index;

    IF NOT FOUND THEN
        -- Chunk row missing. The DownloadEndpoint already validated the
        -- index range before serving, so this is a stale-state race.
        -- Don't raise — return the current share state so the caller
        -- can decide.
        RETURN QUERY SELECT FALSE, v_share.state, NULL::BIGINT;
        RETURN;
    END IF;

    -- Burn-fire decision. Only on burn_after_read shares currently in
    -- 'ready' (a previously-fired burn or expired share is left alone).
    IF v_share.burn_after_read AND v_share.state = 'ready' THEN
        SELECT COUNT(*) INTO v_unserved_count
          FROM share_chunks
         WHERE share_id  = p_share_id
           AND served_at IS NULL;

        IF v_unserved_count = 0 THEN
            -- Every chunk has been delivered at least once. Flip the
            -- share. The `AND state = 'ready'` guard is redundant given
            -- the FOR UPDATE lock above, but cheap and explicit.
            UPDATE shares
               SET state            = 'destroyed',
                   destroyed_at     = now(),
                   destroyed_reason = 'burn',
                   download_count   = download_count + 1
             WHERE id    = p_share_id
               AND state = 'ready'
            RETURNING * INTO v_share;

            IF v_share.id IS NOT NULL THEN
                v_burn_fired := TRUE;

                -- Append the share_destroyed audit entry inside this
                -- same transaction. Atomic: the row flip and the chain
                -- entry commit together or not at all. If the chain
                -- write fails, the entire txn rolls back and the next
                -- chunk fetch will retry from a clean state.
                v_payload := jsonb_build_object(
                    'shortId',     v_share.short_id,
                    'reason',      'burn',
                    'fileHashHex', encode(v_share.file_hash, 'hex'),
                    'destroyedAt', to_char(
                        v_share.destroyed_at AT TIME ZONE 'UTC',
                        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
                    ),
                    'chunkCount',  v_share.chunk_count,
                    'trigger',     'ingest_last_chunk'
                );
                v_audit_id := append_audit_entry(
                    'share_destroyed'::TEXT,
                    p_share_id,
                    v_payload
                );
            END IF;
        END IF;
    END IF;

    RETURN QUERY SELECT v_burn_fired, v_share.state, v_audit_id;
END;
$$;

-- Same grant pattern as increment_download (0001) and append_audit_entry
-- (0002): SECURITY DEFINER, callable only by service_role. The ingest
-- service connects as the `slothbox` role, which is granted service_role
-- in 0000_bootstrap_roles.sql.
REVOKE ALL ON FUNCTION mark_chunk_served(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION mark_chunk_served(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Update UpsertChunkAsync's ON CONFLICT clause expectations.
-- ---------------------------------------------------------------------------
--
-- The application-side INSERT in UpsertChunkAsync (PostgresShareRepository.cs)
-- runs:
--
--   INSERT INTO share_chunks (share_id, chunk_index, nonce, blob_key,
--                             ciphertext_size, uploaded_at)
--   VALUES (...)
--   ON CONFLICT (share_id, chunk_index) DO UPDATE
--   SET nonce           = EXCLUDED.nonce,
--       blob_key        = EXCLUDED.blob_key,
--       ciphertext_size = EXCLUDED.ciphertext_size,
--       uploaded_at     = EXCLUDED.uploaded_at;
--
-- Re-uploading a chunk during the upload phase replaces the blob (different
-- bytes, possibly different nonce). The accompanying delivery accounting
-- must reset — otherwise served_at/served_count from a prior upload-cycle
-- attempt would carry into the new blob. We update the C# query in this
-- migration to add the served_at/served_count reset, but post a SQL trigger
-- here as a defence in depth in case any other write path re-uses the
-- conflict pattern without remembering the reset.
--
-- The trigger is a no-op on first INSERT (NEW.served_at = NULL by default
-- already). On UPDATE, if the row's blob_key changed (or uploaded_at moved
-- forward to a newer time), the new blob is a different artefact and any
-- prior delivery accounting belongs to the previous blob — zero it out.

CREATE OR REPLACE FUNCTION clear_chunk_delivery_on_replace()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- TG_OP = 'UPDATE' guard: don't fire on plain INSERT.
    IF TG_OP = 'UPDATE' THEN
        IF NEW.blob_key IS DISTINCT FROM OLD.blob_key
           OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
        THEN
            NEW.served_at    := NULL;
            NEW.served_count := 0;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS share_chunks_clear_delivery ON share_chunks;
CREATE TRIGGER share_chunks_clear_delivery
    BEFORE UPDATE ON share_chunks
    FOR EACH ROW
    EXECUTE FUNCTION clear_chunk_delivery_on_replace();

COMMIT;
