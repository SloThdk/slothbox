// Package module for the SlothBox reaper daemon.
//
// The reaper is a small Go process that runs on a schedule (default every 60s)
// and reaps shares whose lifecycle has ended:
//   - expired by `expires_at`
//   - burn-after-read shares already marked destroyed by the read path
//   - shares that hit `max_downloads`
//
// For each candidate share it deletes the encrypted blobs from MinIO,
// transitions the row to `state='destroyed'`, and appends a `share_destroyed`
// entry to the tamper-evident audit hash-chain inside a single Postgres
// transaction so the chain stays consistent even on partial failures.
//
// Module path matches the Sloth Studio GitHub org convention:
//   github.com/SloThdk/slothbox/reaper
//
// Pinned to Go 1.22 — the toolchain we standardise on across slothbox services.
module github.com/SloThdk/slothbox/reaper

go 1.25.0

require (
	// pgx v5 — native Postgres driver. Faster than database/sql + lib/pq and
	// gives first-class support for JSONB, LISTEN/NOTIFY, COPY, and array
	// types. We reach for the *pgxpool* connection pool inside the daemon.
	github.com/jackc/pgx/v5 v5.9.2

	// MinIO Go SDK — talks to any S3-compatible object store. We use it for
	// `RemoveObject` against the chunk blobs.
	github.com/minio/minio-go/v7 v7.0.70

	// zerolog — zero-allocation structured logger. JSON output by default,
	// trivially shippable to Loki / CloudWatch / stdout in containers.
	github.com/rs/zerolog v1.32.0
)

require (
	github.com/dustin/go-humanize v1.0.1 // indirect
	github.com/goccy/go-json v0.10.2 // indirect
	github.com/google/uuid v1.6.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/klauspost/compress v1.17.6 // indirect
	github.com/klauspost/cpuid/v2 v2.2.6 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.19 // indirect
	github.com/minio/md5-simd v1.1.2 // indirect
	github.com/rs/xid v1.5.0 // indirect
	golang.org/x/crypto v0.21.0 // indirect
	golang.org/x/net v0.23.0 // indirect
	golang.org/x/sync v0.17.0 // indirect
	golang.org/x/sys v0.18.0 // indirect
	golang.org/x/text v0.29.0 // indirect
	gopkg.in/ini.v1 v1.67.0 // indirect
)
