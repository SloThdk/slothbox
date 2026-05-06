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

go 1.22

require (
	// pgx v5 — native Postgres driver. Faster than database/sql + lib/pq and
	// gives first-class support for JSONB, LISTEN/NOTIFY, COPY, and array
	// types. We reach for the *pgxpool* connection pool inside the daemon.
	github.com/jackc/pgx/v5 v5.5.5

	// MinIO Go SDK — talks to any S3-compatible object store. We use it for
	// `RemoveObject` against the chunk blobs.
	github.com/minio/minio-go/v7 v7.0.70

	// zerolog — zero-allocation structured logger. JSON output by default,
	// trivially shippable to Loki / CloudWatch / stdout in containers.
	github.com/rs/zerolog v1.32.0

	// Prometheus client + HTTP exporter. The /metrics endpoint is optional
	// for v0.1; gated by the `METRICS_ADDR` env var.
	github.com/prometheus/client_golang v1.19.0
)
