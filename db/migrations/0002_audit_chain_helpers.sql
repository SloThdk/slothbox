-- Audit chain helpers — idempotent appends with hash-chain integrity.

BEGIN;

-- Append an entry. Computes prev_hash + entry_hash automatically inside a serializable txn.
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

    v_entry_hash := digest(
        v_prev_hash ||
        v_now::text::bytea ||
        p_event_type::bytea ||
        p_payload::text::bytea,
        'sha256'
    );

    INSERT INTO audit_chain (occurred_at, event_type, share_id, payload, prev_hash, entry_hash)
    VALUES (v_now, p_event_type, p_share_id, p_payload, v_prev_hash, v_entry_hash)
    RETURNING seq INTO v_seq;

    RETURN v_seq;
END;
$$;

REVOKE ALL ON FUNCTION append_audit_entry(TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION append_audit_entry(TEXT, UUID, JSONB) TO postgres;

-- Verify the chain integrity for a range — returns first broken seq or NULL if clean.
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
    FOR r IN
        SELECT * FROM audit_chain
        WHERE seq >= p_from AND (p_to IS NULL OR seq <= p_to)
        ORDER BY seq
    LOOP
        IF v_prev IS NULL THEN
            v_prev := r.entry_hash;
            CONTINUE;
        END IF;

        IF r.prev_hash != v_prev THEN
            RETURN r.seq;
        END IF;

        v_expected := digest(
            r.prev_hash ||
            r.occurred_at::text::bytea ||
            r.event_type::bytea ||
            r.payload::text::bytea,
            'sha256'
        );

        IF r.entry_hash != v_expected THEN
            RETURN r.seq;
        END IF;

        v_prev := r.entry_hash;
    END LOOP;

    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION verify_audit_chain(BIGINT, BIGINT) TO PUBLIC;

COMMIT;
