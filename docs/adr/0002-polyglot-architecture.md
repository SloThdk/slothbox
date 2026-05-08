# ADR 0002 — Polyglot architecture (TS + C# + Go)

**Status:** accepted
**Date:** 2026-05-07
**Authors:** Philip Sloth

## Context

SlothBox could be written entirely in TypeScript. That would give a smaller
build matrix, fewer Dockerfiles, and a simpler hire profile. It would also be
defensible — most modern web SaaS is written that way.

But two parts of the system hit problems TypeScript handles poorly enough to justify a different runtime:

1. **The chunked upload ingest service.** Files can be 5 GB. Node's stream
   API works but has rougher backpressure semantics than .NET's `PipeReader`.
   Kestrel + `PipeReader` handles multi-GB streaming better and `ImageSharp`
   is the strongest image library available for thumbnail generation.

2. **The reaper daemon.** It runs every 60 seconds and exits. A Node process
   for that workload sits at ~80 MB RAM idle. A Go static binary sits at ~8 MB.
   For a daemon that should disappear and reappear cleanly, Go is the right tool.

The verifier CLI is also in Go for the same single-binary distribution reason
(brew/scoop/apt single-binary deploy).

## Decision

SlothBox is polyglot:

- **TypeScript** — frontend (Next 15), API gateway (Hono), shared packages
- **C# / .NET 8** — ingest service, receipt service (v0.5+)
- **Go** — reaper daemon, verifier CLI

Each non-default language has a 1-sentence justification that holds up in
review:

| Language   | Justification                                                                                |
| ---------- | -------------------------------------------------------------------------------------------- |
| TypeScript | Default stack. Same shared types frontend ↔ backend. Expert work.                            |
| C# / .NET  | Kestrel's `PipeReader` for streaming uploads + ImageSharp for thumbnails — perf-critical I/O |
| Go         | Single static binary + low-memory footprint — right tool for daemons and CLIs                |

## Consequences

- Build matrix is bigger: 3 language toolchains, 5 service Dockerfiles, 3
  language-specific CI jobs
- Hiring profile broadens — contributors only need to know one of the
  languages, not all three
- Some types are duplicated across language boundaries (Share, Chunk, etc.)
- Refactors that cross language boundaries cost more
- Easier to scale individual services independently — each one ships as its
  own container

## Alternatives considered

- **All TypeScript** — simpler, but ingest service would need workarounds for
  multi-GB streaming and reaper would have unjustified RAM overhead
- **All Go** — frontend ecosystem is weak in Go (Gomponents exists but it's
  niche), and the team's expert language is TS — fighting the strong axis
- **All C#** — Blazor exists but the React ecosystem is bigger, and Go is
  measurably better for the daemon use case
- **Add Rust for the daemon** — Rust would also be defensible, but Go is enough
  and adds a fourth language without a sharp differentiator

## References

- See README "Why each language" table
- See `docs/ARCHITECTURE.md` for the full service map
