-- 0005_per_share_password.sql
--
-- Per-share password protection. Closes the README WARNING block #1
-- ("the shortId is the access secret — anyone holding a share URL can
-- destroy the share or download the ciphertext") for shares the sender
-- chose to password-protect.
--
-- TRUST MODEL — the password is NEVER stored or transmitted to the server
-- ============================================================================
-- The server stores three things per password-protected share:
--   * password_salt          — 16 random bytes (per-share, never reused)
--   * password_kdf_ops_limit — Argon2id `opsLimit` parameter used to derive
--   * password_kdf_mem_limit_kib — Argon2id `memLimit` in KiB (max 1 GiB)
--
-- The browser computes:
--   pwd_key  = Argon2id(password, salt, opsLimit, memLimit) → 32 bytes
--   aead_key = BLAKE2b-keyed(
--                message = "slothbox-aead-kdf-v1\0" || pwd_key,
--                key     = url_fragment_key,
--                length  = 32)
--
-- and uses `aead_key` to encrypt every chunk + the metadata blob.
--
-- Consequences:
--   1. The server never sees the password and cannot validate guesses —
--      decryption fails as an AEAD tag mismatch, not as a 401, so there
--      is no online password-guess oracle.
--   2. The URL fragment alone is harmless. Forwarded screenshot, chat-log
--      scrape, browser-history sync to a hostile device — none of those
--      open the file without the password.
--   3. The password alone is harmless. The fragment carries 256 bits of
--      uniform random; an attacker without it cannot brute-force the
--      AEAD key even with unlimited password guesses.
--   4. The KDF parameters are stored on the row so future cost increases
--      (we may bump opsLimit/memLimit in v0.6) don't invalidate existing
--      shares — old shares decrypt with their original parameters, new
--      shares get the new defaults.
--
-- Why the parameter ranges:
--   * opsLimit  in [1, 10]      — covers libsodium's INTERACTIVE (2),
--                                 MODERATE (3), and SENSITIVE (4) presets
--                                 with headroom for future increases.
--   * memLimit  in [8192, 1048576] KiB (8 MiB – 1 GiB)
--                                 — INTERACTIVE is 64 MiB, SENSITIVE is
--                                 1 GiB; the bounds let us pick a higher
--                                 floor as desktop RAM increases without
--                                 a follow-up migration.
--   * salt      always 16 bytes — libsodium's `crypto_pwhash_SALTBYTES`.
--
-- Why `password_protected` as a separate boolean rather than NULL-checking
-- `password_salt`:
--   A NULL salt with `password_protected = true` would be a bug in the
--   gateway (it should mint a salt before insert). Making the boolean
--   the source-of-truth + the CHECK constraint cross-validates means
--   either both columns are correct or the INSERT is rejected. The
--   gateway can also key off the boolean without dereferencing a
--   nullable BYTEA on every read.
--
-- Backwards compatibility:
--   Every existing row gets `password_protected = false` and NULL for
--   the three KDF columns via the default. No app-side migration of
--   in-flight shares is required.

BEGIN;

ALTER TABLE shares
    ADD COLUMN IF NOT EXISTS password_protected
        BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS password_salt
        BYTEA,
    ADD COLUMN IF NOT EXISTS password_kdf_ops_limit
        SMALLINT,
    ADD COLUMN IF NOT EXISTS password_kdf_mem_limit_kib
        INTEGER;

-- ----------------------------------------------------------------------------
-- Cross-column CHECK: when password_protected is true, all three KDF columns
-- MUST be populated with sane values; when false, all three MUST be NULL.
--
-- We split it into two halves so a future ALTER TABLE that drops one half
-- doesn't accidentally weaken both. The two CHECK constraints together
-- compose to "exactly one of these branches is satisfied".
-- ----------------------------------------------------------------------------

ALTER TABLE shares
    ADD CONSTRAINT shares_password_unset_chk CHECK (
        password_protected = false
        AND password_salt IS NULL
        AND password_kdf_ops_limit IS NULL
        AND password_kdf_mem_limit_kib IS NULL
    ) NOT VALID;

-- The unset branch CHECK above is too tight on its own (it would reject any
-- password_protected = true row). The composite constraint below replaces it
-- with the proper either/or. We `DROP` the temp NOT VALID constraint and
-- create the real one in a single transaction so the table is never visible
-- to other backends in the inconsistent state.

ALTER TABLE shares
    DROP CONSTRAINT shares_password_unset_chk;

ALTER TABLE shares
    ADD CONSTRAINT shares_password_fields_consistent CHECK (
        (
            password_protected = false
            AND password_salt IS NULL
            AND password_kdf_ops_limit IS NULL
            AND password_kdf_mem_limit_kib IS NULL
        )
        OR
        (
            password_protected = true
            AND octet_length(password_salt) = 16
            AND password_kdf_ops_limit BETWEEN 1 AND 10
            AND password_kdf_mem_limit_kib BETWEEN 8192 AND 1048576
        )
    );

-- ----------------------------------------------------------------------------
-- Partial index on password-protected shares so the gateway's "describe this
-- share" path doesn't sequential-scan when password protection becomes the
-- common case. Tiny in the steady state (empty when no rows are
-- password-protected) and small even at high adoption (one row per
-- password-protected share, no payload bytes).
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS shares_password_protected_idx
    ON shares (password_protected)
    WHERE password_protected = true;

COMMIT;
