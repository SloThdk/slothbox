-- Migration 0003: tighten RLS on shares.
--
-- Migration 0001 created `shares_select_anonymous_by_id` with the predicate
-- `state IN ('ready','uploading','pending')` and no per-row filter. The name
-- implied "scoped by id" but the policy actually returned every share row to
-- any role for which RLS applied — the app's `WHERE short_id = $1` clause was
-- the only thing keeping a row scan from leaking every encrypted_meta /
-- nonce_meta / file_hash on the table.
--
-- Fix:
--   * Drop the over-broad anonymous SELECT policy.
--   * Replace with a policy that reads the current share's shortId from a
--     session-local GUC `app.current_short_id`. The intent is for the
--     api-gateway to set this before every share fetch via
--     `SET LOCAL app.current_short_id = '<id>'`.
--   * Audit chain rules stay unchanged (already SECURITY DEFINER).
--
-- v0.1 STATUS — what this migration enforces and what it does NOT yet:
--   The api-gateway currently connects as the `slothbox` role, which is
--   the table owner. Postgres bypasses RLS for table owners by design,
--   so this policy DOES NOT fire under v0.1 traffic. The gateway also
--   does not yet `SET LOCAL app.current_short_id` per-request. The
--   actual v0.1 scoping comes from the gateway's application-layer
--   `WHERE short_id = $1` clauses on every read.
--
--   This migration intentionally lays the policy groundwork so that
--   when v0.5 lands the auth refactor — switching the gateway to a
--   `non_owner_role` whose RLS is enforced AND wrapping every request
--   in `SET LOCAL app.current_short_id` via Drizzle middleware — the
--   policy activates without a fresh schema migration.
--
--   To activate today (post-v0.5 readiness check):
--     1. ALTER TABLE shares       FORCE ROW LEVEL SECURITY;
--     2. ALTER TABLE share_chunks FORCE ROW LEVEL SECURITY;
--     3. Switch DATABASE_URL to a non-owner role with RLS-applies.
--     4. Wrap every gateway query in
--        `await db.execute(sql\`SET LOCAL app.current_short_id = ...\`)`
--        before the SELECT.
--   See README.md "Trust model — v0.1" for the user-facing version.

BEGIN;

-- 1. Drop the broken policy.
DROP POLICY IF EXISTS shares_select_anonymous_by_id ON shares;

-- 2. New scoped-anonymous SELECT.
--    NULLIF(...) returns NULL on empty/missing GUC, which the comparison
--    yields NULL → policy fails closed. Important: we use `current_setting`
--    with the second arg `true` so missing setting raises NULL instead of an
--    error (otherwise the policy would 500 every health check that doesn't
--    SET LOCAL).
CREATE POLICY shares_select_by_short_id_guc ON shares
    FOR SELECT
    USING (
        short_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_short_id', true), '')
        AND state IN ('ready', 'uploading', 'pending', 'downloaded')
    );

-- 3. Authenticated-owner policies survive untouched (created in 0001).
--    Re-asserted here as comments for grep-discoverability:
--      * shares_select_owner          — owner reads own row
--      * shares_insert_authenticated  — owner inserts own row
--      * shares_update_owner          — owner updates own row

-- 4. Lock down the share_chunks SELECT to flow through the same gate.
--    Migration 0001 had `share_chunks_select_via_share` that joined on the
--    shares table — fine, but we re-emit it here so the gate is colocated
--    with the policy fix.
DROP POLICY IF EXISTS share_chunks_select_via_share ON share_chunks;
CREATE POLICY share_chunks_select_via_share ON share_chunks
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
              FROM shares s
             WHERE s.id = share_chunks.share_id
               AND s.short_id IS NOT DISTINCT FROM NULLIF(current_setting('app.current_short_id', true), '')
               AND s.state IN ('ready', 'uploading', 'pending', 'downloaded')
        )
    );

-- 5. Append-only enforcement on audit_chain. Already RLS-enabled in 0001
--    with only a SELECT policy → all UPDATE/DELETE attempts deny by default.
--    Belt-and-braces: revoke explicit permissions from anon/authenticated.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_chain FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_chain FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON audit_chain FROM authenticated;
-- Only SECURITY DEFINER functions (append_audit_entry) may write rows.

COMMIT;
