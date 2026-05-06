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

Self-host the data layer:

- **Postgres 16** — `postgres:16.4-alpine` in Docker, on the same Hetzner box
- **MinIO** — `minio/minio` in Docker, on the same box, S3-compatible API
- **Auth** — Lucia v3 / better-auth, Postgres-backed, no third-party service
- **Backups** — WAL-G to Hetzner Storage Box, encrypted with age

## Consequences

- More ops work — backups, monitoring, patches, version upgrades are mine
- Lower running cost — one Hetzner CCX13 (€14/mo) replaces ~$60-80/mo of
  managed equivalents
- Demo value — this project shows "I can run my own infra" which my other
  projects (managed Supabase) don't demonstrate
- EU residency is concrete — the data lives on a Hetzner box in Germany,
  not on a managed service whose data residency policy I'd have to research
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
  adds another vendor and removes the "all on one box" demo. Could swap in
  v1.0+ if egress economics demand it.

## References

- See `docs/ARCHITECTURE.md` for the full service map
- See `docs/RUNBOOK.md` for backup + restore procedures
- See README "Why EU-hosted" section
