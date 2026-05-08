# ADR 0003 — Self-hosted Postgres + MinIO + Auth

**Status:** accepted
**Date:** 2026-05-07
**Authors:** Philip Sloth

## Context

For most of my projects I use Supabase managed Postgres + Supabase Auth +
Supabase Storage. It's an excellent stack and ships fast. SlothCV uses it.

For SlothBox specifically, I'm choosing the opposite: self-hosted Postgres in
Docker, MinIO for object storage, Lucia for auth (v0.5+).

## Decision

Self-host the data layer on a single EU-jurisdiction Linux VM:

- **Postgres 16** — `postgres:16.4-alpine` in Docker, on the production VM
- **MinIO** — `minio/minio` in Docker, on the same VM, S3-compatible API
- **Auth** — Lucia v3 / better-auth, Postgres-backed, no third-party service
- **Backups** — nightly `pg_dump` (gzipped) to a local Docker volume with 28-day rotation in v0.1; v0.5 adds WAL-G continuous archiving with an offsite copy on provider block storage

## Consequences

- More ops work — backups, monitoring, patches, version upgrades are mine
- Lower running cost than the managed-everything baseline; concrete numbers
  vary by provider and region and are deliberately not advertised in this
  ADR (they only matter at scale, and the project's primary demo value is
  architectural, not financial)
- Demo value — this project shows "I can run my own infra" which my other
  projects (managed Supabase) don't demonstrate
- EU residency is concrete — the data lives on a VM in a German data
  centre, not on a managed service whose data residency policy I'd have
  to research
- Recovery story is real — I can drill restores, snapshot the box, and
  rebuild from `docker-compose.yml` + WAL archives

## Alternatives considered

- **Supabase managed (like SlothCV)** — fastest to ship, but defeats the
  "self-hosted" demo and incurs SaaS cost
- **Neon Postgres** — serverless, branching, but adds a third-party dep and
  removes the "ops" demo value
- **AWS RDS** — defeats the EU-residency story (Schrems II) for the wedge
- **MongoDB / DynamoDB** — wrong data model; security model relies on
  Postgres RLS + triggers
- **Cloudflare R2** for object storage instead of MinIO — fine choice, but
  adds another vendor and removes the "all on one VM" demo. Could swap in
  v1.0+ if egress economics demand it.

## References

- See `docs/ARCHITECTURE.md` for the full service map
- See `docs/RUNBOOK.md` for backup + restore procedures
- See README "Why EU-hosted" section
