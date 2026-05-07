-- 0000_bootstrap_roles.sql
--
-- Pre-flight migration. Creates the three Supabase-style Postgres roles
-- (`anon`, `authenticated`, `service_role`) that subsequent migrations
-- (0001+) reference in their RLS policies.
--
-- Why these specific names:
--   - The schema was originally drafted with eventual Supabase migration in
--     mind. Keeping the role names compatible means we can move to Supabase
--     in v0.5+ without rewriting every policy.
--   - On a vanilla self-hosted Postgres these roles don't exist, so we
--     create them here. They are NOLOGIN (no password, can't authenticate
--     directly) — only the application user (`slothbox`) connects, then
--     uses SET ROLE / SET LOCAL to activate the appropriate hat.
--
-- Idempotent: every CREATE ROLE is wrapped in DO $$ EXISTS guards.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        CREATE ROLE anon NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOLOGIN NOINHERIT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        -- service_role bypasses RLS by being a member of the bypass group
        -- once the policies attach BYPASSRLS via ALTER POLICY. For v0.1
        -- the application user is itself privileged; service_role is here
        -- to keep policy DDL parseable.
        CREATE ROLE service_role NOLOGIN NOINHERIT;
    END IF;

    -- Grant the application user the ability to assume each role via SET
    -- ROLE. Without this, the gateway / ingest can authenticate but cannot
    -- elevate to authenticated/service_role to satisfy RLS.
    GRANT anon, authenticated, service_role TO slothbox;
END
$$;

-- Ensure the public schema is usable by all three roles. Without these
-- grants, even SELECT statements on existing tables would be denied.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT ALL ON TABLES TO service_role;
