// Package reaper — the long-running sweep loop and one-shot entry points.
//
// The state machine looks like this:
//
//	  ┌──────────────┐     interval tick / --once
//	  │  Run / Once  │──────────────────────────────┐
//	  └──────┬───────┘                              │
//	         ▼                                      ▼
//	  ┌──────────────┐                       ┌──────────────┐
//	  │   Sweep      │ ────► fetchReapable ──► fetchChunks  │
//	  │  (1 round)   │                       │ (per share)  │
//	  └──────┬───────┘                       └──────┬───────┘
//	         │                                      ▼
//	         │                               removeBlobs (MinIO)
//	         │                                      │
//	         │                                      ▼
//	         │                               finalizeDestroy (txn)
//	         │                                      │
//	         ▼                                      ▼
//	  log sweep summary                      append_audit_entry
//
// Failure semantics:
//   - MinIO failure on a chunk → abort THIS share, log error, continue with
//     the next share. The unprocessed share remains in `state='ready'` so the
//     next sweep picks it up again.
//   - DB failure inside the txn → rollback, no audit entry, no row update.
//     Same retry behaviour.
//   - Context cancellation (SIGTERM) → drain the in-flight share if past
//     MinIO step, then exit. The graceful-shutdown deadline in main.go is
//     5 seconds.
package reaper

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Daemon is the top-level reaper runtime. Holds long-lived dependencies and
// exposes Run/Once. Kept as a struct rather than free functions so tests can
// inject a fake Storage.
type Daemon struct {
	Cfg     Config
	Pool    *pgxpool.Pool
	Storage Storage
}

// New constructs a Daemon by initialising the pgx pool and MinIO client from
// the supplied config. Caller is responsible for calling Close when done.
func New(ctx context.Context, cfg Config) (*Daemon, error) {
	pool, err := NewPool(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	storage, err := NewStorage(ctx, cfg)
	if err != nil {
		pool.Close()
		return nil, err
	}
	return &Daemon{Cfg: cfg, Pool: pool, Storage: storage}, nil
}

// Close releases the database pool. MinIO client has no explicit close.
func (d *Daemon) Close() {
	if d.Pool != nil {
		d.Pool.Close()
	}
}

// Once runs exactly one sweep iteration and returns. Used by `reaper --once`
// and by external cron triggers.
func (d *Daemon) Once(ctx context.Context) error {
	return d.sweepOnce(ctx)
}

// Run is the long-running loop. Sleeps for cfg.Interval between sweeps and
// returns nil on graceful context cancellation, or an error if the sweep
// loop hit something unrecoverable (currently nothing — sweep failures are
// per-share and never escape).
func (d *Daemon) Run(ctx context.Context) error {
	log.Info().
		Str("event", "reaper_started").
		Dur("interval", d.Cfg.Interval).
		Int("batch_size", d.Cfg.BatchSize).
		Msg("reaper daemon started")

	// Run an immediate sweep so a freshly-deployed reaper picks up backlog
	// without waiting a full interval.
	if err := d.sweepOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Error().Err(err).Str("event", "sweep_failed").Msg("initial sweep failed")
	}

	ticker := time.NewTicker(d.Cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Info().
				Str("event", "reaper_stopped").
				Msg("reaper context cancelled, exiting cleanly")
			return nil
		case <-ticker.C:
			if err := d.sweepOnce(ctx); err != nil && !errors.Is(err, context.Canceled) {
				log.Error().Err(err).Str("event", "sweep_failed").Msg("sweep iteration failed")
			}
		}
	}
}

// sweepOnce runs a single sweep round end-to-end. Returns nil unless the
// context is cancelled — per-share errors are logged but not propagated.
func (d *Daemon) sweepOnce(ctx context.Context) error {
	sweepID := newSweepID()
	ctx = LoggerWithSweep(ctx, sweepID)
	l := log.Ctx(ctx)

	start := time.Now()
	l.Info().Str("event", "sweep_started").Msg("sweep started")

	candidates, err := fetchReapable(ctx, d.Pool, d.Cfg.BatchSize)
	if err != nil {
		l.Error().Err(err).Str("event", "sweep_query_failed").Msg("failed to query reapable shares")
		return err
	}
	if len(candidates) == 0 {
		l.Debug().
			Str("event", "sweep_idle").
			Dur("duration_ms", time.Since(start)).
			Msg("no shares to reap")
		return nil
	}

	var (
		processed int
		skipped   int
		failed    int
	)
	for _, share := range candidates {
		if err := ctx.Err(); err != nil {
			l.Warn().
				Err(err).
				Str("event", "sweep_aborted").
				Int("processed", processed).
				Int("remaining", len(candidates)-processed).
				Msg("sweep aborted by context cancellation")
			return err
		}

		shareCtx := LoggerWithShare(ctx, share.ID, share.ShortID)
		switch err := d.reapOne(shareCtx, share); {
		case err == nil:
			processed++
		case errors.Is(err, ErrShareGone):
			skipped++
		default:
			failed++
		}
	}

	l.Info().
		Str("event", "sweep_finished").
		Int("processed", processed).
		Int("skipped", skipped).
		Int("failed", failed).
		Int("candidates", len(candidates)).
		Dur("duration_ms", time.Since(start)).
		Msg("sweep finished")
	return nil
}

// reapOne reaps a single share. Order of operations:
//   1. Read the chunk keys (outside any txn — these don't change)
//   2. Delete each blob from MinIO (network I/O, no DB locks held)
//   3. Open destruction txn: lock row, delete chunks, mark destroyed,
//      append audit entry. Commit.
//
// If MinIO fails we leave the DB row alone — next sweep will retry.
// If the row is already gone (race / already destroyed) we treat as success.
func (d *Daemon) reapOne(ctx context.Context, share reapableShare) error {
	l := log.Ctx(ctx)
	start := time.Now()

	chunkKeys, err := fetchChunkKeys(ctx, d.Pool, share.ID)
	if err != nil {
		l.Error().Err(err).Str("event", "fetch_chunks_failed").Msg("failed to read share_chunks rows")
		return err
	}

	if err := removeBlobs(ctx, d.Storage, chunkKeys, l); err != nil {
		// Already logged inside removeBlobs. Bail out so the txn doesn't fire.
		return err
	}

	res, err := finalizeDestroy(ctx, d.Pool, share.ID, len(chunkKeys))
	if err != nil {
		if errors.Is(err, ErrShareGone) {
			l.Debug().
				Str("event", "share_already_destroyed").
				Msg("share gone before lock acquired (race or already terminal)")
			return ErrShareGone
		}
		l.Error().
			Err(err).
			Str("event", "finalize_destroy_failed").
			Msg("destruction txn failed; share will retry on next sweep")
		return err
	}

	l.Info().
		Str("event", "share_destroyed").
		Int("chunk_count", len(chunkKeys)).
		Str("reason", res.Reason).
		Int64("audit_id", res.AuditID).
		Time("destroyed_at", res.DestroyedAt).
		Dur("duration_ms", time.Since(start)).
		Msg("share destroyed")
	return nil
}

// newSweepID returns a short hex token used to correlate every log line
// emitted during one sweep iteration. 64 bits is overkill; 16 hex chars is
// short enough to skim in logs.
func newSweepID() string {
	var b [8]byte
	if _, err := rand.Read(b[:]); err != nil {
		// Failure to read the OS RNG is exotic — fall back to nanos.
		return time.Now().UTC().Format("20060102150405.000000000")
	}
	return hex.EncodeToString(b[:])
}

// Suppress the unused-import warning for zerolog when this file is the only
// one referencing log.Ctx — present in case a future refactor strips it.
var _ = zerolog.Ctx
