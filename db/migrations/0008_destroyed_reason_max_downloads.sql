-- 0008_destroyed_reason_max_downloads.sql
--
-- Widen shares_dest_reason_chk to allow 'max_downloads'.
--
-- The reaper classifies a share destroyed because its download cap was
-- reached as destroyed_reason='max_downloads' (services/reaper — classifyReason).
-- Such a share arrives at the reaper as state='expired', set atomically by
-- increment_download (0001_init.sql) the moment download_count hits
-- max_downloads. The original CHECK only allowed
-- ('burn','expiry','manual','abuse'), so the reaper's UPDATE would have thrown
-- a CHECK violation and rolled the whole sweep back — which, combined with the
-- candidate query never selecting state='expired' shares (fixed in the same
-- change), left every cap-reached share's ciphertext orphaned in MinIO forever,
-- directly contradicting docs/DELETION.md. Making 'max_downloads' a first-class
-- reason lets the audit chain record the real cause of destruction.
--
-- Idempotent: drops the prior constraint if present and re-adds the widened
-- one, so it is safe whether the database was bootstrapped fresh (runner applies
-- 0001 then 0008 in order) or already carries the original constraint.

BEGIN;

ALTER TABLE shares DROP CONSTRAINT IF EXISTS shares_dest_reason_chk;

ALTER TABLE shares
    ADD CONSTRAINT shares_dest_reason_chk CHECK (
        destroyed_reason IS NULL
        OR destroyed_reason IN ('burn', 'expiry', 'manual', 'abuse', 'max_downloads')
    );

COMMIT;
