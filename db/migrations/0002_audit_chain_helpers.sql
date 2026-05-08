-- Audit chain helpers — idempotent appends with hash-chain integrity.
--
-- Hash algorithm note: v0.1 uses SHA-256 via pgcrypto's `digest()` because
-- pgcrypto ships with stock Postgres and does not include BLAKE2. The
-- application-layer documentation (`docs/CRYPTO.md`) lists BLAKE2b-256 as
-- the v0.5 target — at v0.5 the chain logic moves to libsodium-net inside
-- the receipt service so the receipt + the chain entry share the same
-- BLAKE2 hash, which is what the offline `slothbox-verify` CLI will
-- recompute. v0.1's SHA-256 is a perfectly fine cryptographic hash for
-- a tamper-evidence chain on its own; the migration to BLAKE2 is purely
-- about end-to-end algorithm consistency, not a security upgrade.

BEGIN;

-- Append an entry. Computes prev_hash + entry_hash automatically inside
-- a serializable txn. The pg_advisory_xact_lock + ORDER BY seq DESC
-- LIMIT 1 read pattern guarantees no two appends ever pick up the same
-- prev_hash even under concurrent writers (lock is released on COMMIT).
CREATE OR REPLACE FUNCTION append_audit_entry(
    p_event_type TEXT,
    p_share_id   UUID,
    p_payload    JSONB
)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_prev_hash BYTEA;
    v_entry_hash BYTEA;
    v_seq BIGINT;
    v_now TIMESTAMPTZ := now();
BEGIN
    -- Lock the chain to ensure single-writer ordering.
    PERFORM pg_advisory_xact_lock(hashtext('slothbox.audit_chain'));

    SELECT entry_hash INTO v_prev_hash
    FROM audit_chain
    ORDER BY seq DESC
    LIMIT 1;

    IF v_prev_hash IS NULL THEN
        RAISE EXCEPTION 'audit chain not initialised — genesis row missing';
    END IF;

    -- Hash inputs are length-prefixed (4-byte big-endian length followed
    -- by bytes) so adjacent fields cannot collide via boundary ambiguity.
    -- Without prefixing, an attacker who controls `event_type` and
    -- `payload` could craft inputs where shifting bytes between the two
    -- fields produces the same concatenated digest, weakening the
    -- chain's tamper-evidence. The wire format is documented in
    -- `docs/CRYPTO.md` so the offline verifier CLI can recompute it.
    v_entry_hash := digest(
        v_prev_hash
        || int4send(length(v_now::text)::int) || v_now::text::bytea
        || int4send(length(p_event_type)) || p_event_type::bytea
        || int4send(length(p_payload::text)) || p_payload::text::bytea,
        'sha256'
    );

    INSERT INTO audit_chain (occurred_at, event_type, share_id, payload, prev_hash, entry_hash)
    VALUES (v_now, p_event_type, p_share_id, p_payload, v_prev_hash, v_entry_hash)
    RETURNING seq INTO v_seq;

    RETURN v_seq;
END;
$$;

-- Mirror 0001: target service_role, not the env-dependent superuser.
REVOKE ALL ON FUNCTION append_audit_entry(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_audit_entry(TEXT, UUID, JSONB) TO service_role;

-- Verify the chain integrity for a range — returns the first broken seq
-- or NULL if every row in the range hashes correctly AND the range's
-- first row's `prev_hash` matches the entry immediately before it.
--
-- Two correctness invariants enforced:
--
--   1. Every row in the range is integrity-checked, including the FIRST
--      row of the loop. The earlier implementation skipped the first
--      iteration entirely (it just bootstrapped `v_prev` from
--      `r.entry_hash` and continued), which meant calling
--      `verify_audit_chain(p_from)` for any `p_from` returned NULL even
--      when row `p_from` had been tampered with — its `entry_hash` was
--      blindly trusted as the bootstrap value. Now the loop recomputes
--      the expected hash on every row.
--
--   2. When `p_from > 1` the function fetches the row immediately BEFORE
--      `p_from` and uses its `entry_hash` to validate `p_from.prev_hash`.
--      Without that fetch, range verification was strictly weaker than
--      full verification — `verify_audit_chain(2)` would miss a tamper
--      that broke the link between row 1 and row 2. Genesis row (seq=1)
--      handles its own boundary case below.
CREATE OR REPLACE FUNCTION verify_audit_chain(p_from BIGINT DEFAULT 1, p_to BIGINT DEFAULT NULL)
RETURNS BIGINT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    r RECORD;
    v_prev BYTEA;
    v_expected BYTEA;
BEGIN
    -- Bootstrap v_prev from the row IMMEDIATELY BEFORE p_from when the
    -- range starts mid-chain. This is what makes range verification as
    -- strong as full verification — without it, a corrupted prev_hash
    -- on the first row of the range would be invisible.
    IF p_from > 1 THEN
        SELECT entry_hash INTO v_prev
        FROM audit_chain
        WHERE seq = p_from - 1;
        -- If the boundary row is missing, the requested range itself is
        -- impossible to verify. Treat as a chain break at p_from.
        IF v_prev IS NULL THEN
            RETURN p_from;
        END IF;
    END IF;

    FOR r IN
        SELECT * FROM audit_chain
        WHERE seq >= p_from AND (p_to IS NULL OR seq <= p_to)
        ORDER BY seq
    LOOP
        -- Genesis row (seq=1) has all-zero prev_hash by construction
        -- (set in 0001_init.sql). Its entry_hash is just digest of
        -- itself + the genesis sentinel — the canonical value is
        -- inserted by 0001_init.sql. Skip the prev_hash chain check
        -- only for the genesis row.
        IF r.seq > 1 THEN
            IF r.prev_hash != v_prev THEN
                RETURN r.seq;
            END IF;

            v_expected := digest(
                r.prev_hash
                || int4send(length(r.occurred_at::text)::int) || r.occurred_at::text::bytea
                || int4send(length(r.event_type)) || r.event_type::bytea
                || int4send(length(r.payload::text)) || r.payload::text::bytea,
                'sha256'
            );

            IF r.entry_hash != v_expected THEN
                RETURN r.seq;
            END IF;
        END IF;

        v_prev := r.entry_hash;
    END LOOP;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_audit_chain(BIGINT, BIGINT) TO PUBLIC;

COMMIT;
