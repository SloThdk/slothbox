-- SlothBox — initial schema
-- Tables: shares, share_chunks, audit_chain
-- All tables have RLS. Anonymous shares are owner_id = NULL.

BEGIN;

-- ─── Extensions ─────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Shares (metadata only — never plaintext) ───────────────────
CREATE TABLE shares (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    short_id        TEXT        NOT NULL UNIQUE,        -- URL-friendly, 12 chars
    owner_id        UUID,                                -- NULL = anonymous
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at      TIMESTAMPTZ NOT NULL,
    burn_after_read BOOLEAN     NOT NULL DEFAULT false,
    max_downloads   INTEGER,                             -- NULL = unlimited within expiry
    download_count  INTEGER     NOT NULL DEFAULT 0,
    file_hash       BYTEA       NOT NULL,                -- BLAKE2b-256 of plaintext (computed client-side)
    file_size       BIGINT      NOT NULL,
    encrypted_meta  BYTEA       NOT NULL,                -- name + mime + extra, encrypted alongside file
    nonce_meta      BYTEA       NOT NULL,                -- 24 bytes, XChaCha20-Poly1305
    chunk_count     INTEGER     NOT NULL,
    chunk_size      INTEGER     NOT NULL,
    state           TEXT        NOT NULL DEFAULT 'pending',
                              -- pending | uploading | ready | downloaded | expired | destroyed
    destroyed_at    TIMESTAMPTZ,
    destroyed_reason TEXT,                               -- burn | expiry | manual | abuse
    sender_ip_hash  BYTEA,                               -- SHA-256 of IP for rate limiting (deletable)
    sender_region   TEXT,                                -- coarse geo for receipts (e.g. "EU-DK")

    CONSTRAINT shares_state_chk CHECK (
        state IN ('pending', 'uploading', 'ready', 'downloaded', 'expired', 'destroyed')
    ),
    CONSTRAINT shares_dest_reason_chk CHECK (
        destroyed_reason IS NULL OR destroyed_reason IN ('burn', 'expiry', 'manual', 'abuse')
    ),
    CONSTRAINT shares_expires_after_create CHECK (expires_at > created_at),
    CONSTRAINT shares_chunk_count_pos CHECK (chunk_count > 0),
    CONSTRAINT shares_chunk_size_pos CHECK (chunk_size > 0)
);

CREATE INDEX shares_short_id_idx     ON shares(short_id);
CREATE INDEX shares_owner_id_idx     ON shares(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX shares_expires_at_idx   ON shares(expires_at) WHERE state = 'ready';
CREATE INDEX shares_state_idx        ON shares(state);
CREATE INDEX shares_created_at_idx   ON shares(created_at);

-- ─── Share chunks (encrypted blobs metadata) ────────────────────
-- The actual ciphertext lives in MinIO; this table tracks chunk-level metadata.
CREATE TABLE share_chunks (
    share_id        UUID        NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    chunk_index     INTEGER     NOT NULL,
    nonce           BYTEA       NOT NULL,
    blob_key        TEXT        NOT NULL,                -- MinIO object key
    ciphertext_size INTEGER     NOT NULL,
    uploaded_at     TIMESTAMPTZ,

    PRIMARY KEY (share_id, chunk_index),
    CONSTRAINT share_chunks_index_nonneg CHECK (chunk_index >= 0),
    CONSTRAINT share_chunks_ct_size_pos CHECK (ciphertext_size > 0)
);

-- ─── Audit chain (append-only, hash-chained) ────────────────────
-- Every significant event (share created, downloaded, destroyed) is a leaf.
-- prev_hash binds each entry to the previous one — tampering breaks the chain.
CREATE TABLE audit_chain (
    seq             BIGSERIAL   PRIMARY KEY,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    event_type      TEXT        NOT NULL,
                              -- share_created | share_downloaded | share_destroyed | chain_anchor
    share_id        UUID,                                -- NULL for anchor events
    payload         JSONB       NOT NULL,                -- event-specific data
    prev_hash       BYTEA       NOT NULL,                -- hash of previous row's `entry_hash`
    entry_hash      BYTEA       NOT NULL,                -- hash(prev_hash || occurred_at || event_type || payload)

    CONSTRAINT audit_chain_event_type_chk CHECK (
        event_type IN ('share_created', 'share_downloaded', 'share_destroyed',
                       'chain_anchor', 'auth_login', 'admin_action')
    )
);

CREATE INDEX audit_chain_share_idx ON audit_chain(share_id) WHERE share_id IS NOT NULL;
CREATE INDEX audit_chain_event_idx ON audit_chain(event_type);
CREATE INDEX audit_chain_time_idx  ON audit_chain(occurred_at);

-- Genesis row — bootstraps the chain with an all-zeros prev_hash
INSERT INTO audit_chain (event_type, payload, prev_hash, entry_hash)
VALUES (
    'chain_anchor',
    jsonb_build_object('genesis', true, 'version', '0.1.0-alpha'),
    decode('0000000000000000000000000000000000000000000000000000000000000000', 'hex'),
    decode(encode(digest('slothbox-genesis-v0.1.0-alpha', 'sha256'), 'hex'), 'hex')
);

-- ─── Rate limits (anti-abuse) ───────────────────────────────────
CREATE TABLE rate_limits (
    bucket          TEXT        NOT NULL,                -- e.g. "ip:1.2.3.4" or "user:uuid"
    window_start    TIMESTAMPTZ NOT NULL,
    counter         INTEGER     NOT NULL DEFAULT 1,

    PRIMARY KEY (bucket, window_start)
);

CREATE INDEX rate_limits_window_idx ON rate_limits(window_start);

-- ─── Row-Level Security ─────────────────────────────────────────
ALTER TABLE shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_chain ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;

-- Shares: anonymous readable by short_id (the only way to find them);
-- authenticated owner can read their own; nobody can read someone else's owned shares.
CREATE POLICY shares_select_anonymous_by_id ON shares
    FOR SELECT
    USING (state = 'ready' OR state = 'uploading' OR state = 'pending');

CREATE POLICY shares_select_owner ON shares
    FOR SELECT
    TO authenticated
    USING (owner_id = current_setting('app.current_user_id', true)::uuid);

-- Inserts: only authenticated users can create owned shares; anonymous
-- creates go through service-role gateway code that explicitly sets owner_id = NULL.
CREATE POLICY shares_insert_authenticated ON shares
    FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = current_setting('app.current_user_id', true)::uuid);

-- Updates: only owner can modify their own share metadata.
CREATE POLICY shares_update_owner ON shares
    FOR UPDATE
    TO authenticated
    USING (owner_id = current_setting('app.current_user_id', true)::uuid)
    WITH CHECK (owner_id = current_setting('app.current_user_id', true)::uuid);

-- Share chunks: same readability as parent share, via service role.
CREATE POLICY share_chunks_select_via_share ON share_chunks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM shares
            WHERE shares.id = share_chunks.share_id
              AND (shares.state IN ('ready', 'uploading', 'pending'))
        )
    );

-- Audit chain: append-only. Reads allowed for transparency; no updates, no deletes.
CREATE POLICY audit_chain_select_all ON audit_chain
    FOR SELECT
    USING (true);

-- Rate limits: service-role only. No public access.
-- (RLS enabled with no policy => deny by default.)

-- ─── Helper: bump download_count atomically ────────────────────
CREATE OR REPLACE FUNCTION increment_download(share_short_id TEXT)
RETURNS shares
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result shares;
BEGIN
    UPDATE shares
    SET download_count = download_count + 1,
        state = CASE
            WHEN burn_after_read THEN 'destroyed'
            WHEN max_downloads IS NOT NULL AND download_count + 1 >= max_downloads THEN 'expired'
            ELSE state
        END,
        destroyed_at = CASE
            WHEN burn_after_read THEN now()
            ELSE destroyed_at
        END,
        destroyed_reason = CASE
            WHEN burn_after_read THEN 'burn'
            ELSE destroyed_reason
        END
    WHERE short_id = share_short_id
      AND state IN ('ready', 'downloaded')
      AND now() < expires_at
    RETURNING * INTO result;

    IF result.id IS NULL THEN
        RAISE EXCEPTION 'share not available';
    END IF;

    RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION increment_download(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_download(TEXT) TO postgres;

COMMIT;
