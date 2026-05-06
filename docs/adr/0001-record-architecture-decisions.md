# ADR 0001 — Record architecture decisions

**Status:** accepted
**Date:** 2026-05-07
**Authors:** Philip Sloth

## Context

Architecture choices are the part of a project that's hardest to reverse later.
Without a record of *why* a decision was made, future maintainers (including
future-me) end up either preserving the current shape because nobody remembers
the rationale, or breaking constraints they didn't know existed.

## Decision

We record significant architectural decisions in `docs/adr/NNNN-title.md` files
following the [Michael Nygard format](https://github.com/joelparkerhenderson/architecture-decision-record).

A decision is "significant" if any of the following apply:

- It introduces a new service, language, or runtime to the system
- It swaps a database engine, queue system, or storage backend
- It changes the deploy target or topology
- It alters the trust model or threat boundary
- It commits to a third-party dependency that would be expensive to replace

For lower-stakes choices (e.g. picking a UI library, choosing a testing
framework), a code comment or PR description is sufficient.

## Consequences

- New significant changes require an ADR PR before code lands. Slows the
  earliest decision a little; saves arguments later.
- Existing decisions become legible. Anyone reading the repo cold can understand
  *why* `apps/api-gateway` is in TypeScript and `services/ingest` is in C#.
- Older ADRs may become superseded — that's fine, we add a new ADR with status
  "supersedes 0007" or similar.

## Alternatives considered

- **No ADRs, just code comments** — works for small teams; loses rationale at
  the file boundary level (cross-cutting concerns)
- **Confluence / Notion** — separate from the code, drifts from reality
- **PR descriptions only** — invisible after the PR is merged unless you know
  to look

## References

- <https://github.com/joelparkerhenderson/architecture-decision-record>
- <https://adr.github.io/madr/>
