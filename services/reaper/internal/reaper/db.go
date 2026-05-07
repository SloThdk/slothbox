// Package reaper — Postgres data access via pgx v5.
//
// All SQL the daemon issues lives in this file. Two design choices worth
// flagging up front:
//
//  1. We use *pgxpool* rather than a single *pgx.Conn* even though the
//     daemon is single-threaded today. The pool gives us automatic
//     reconnect on transient network failures, request-scoped
//     `pool.AcquireFunc(ctx, ...)` ergonomics, and a clean upgrade path
//     when a future v0.5+ wants to reap in parallel.
//
//  2. We do NOT use database/sql. pgx's native API lets us:
//       - bind UUIDs and JSONB without scanner shims
//       - call `pgx.CollectRows` and `pgx.RowToStructByName` for
//         readable result mapping
//       - hand JSONB straight into the audit-chain RPC as
//         `pgtype.JSONB` without re-marshalling on the driver side.
//
// The schema referenced here is the canonical SlothBox migration set:
//
//   shares(id uuid pk, short_id text, state text, expires_at timestamptz,
//          burn_after_read bool, max_downloads int, download_count int,
//          destroyed_at timestamptz, destroyed_reason text,
//          file_hash bytea, …)
//   share_chunks(share_id uuid fk, blob_key text, …)
//   audit_log(append_audit_entry RPC writes here under hash-chain rules)
package reaper

import (
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rs/zerolog"
)

// ----------------------------------------------------------------------------
// connection helpers
// ----------------------------------------------------------------------------

// NewPool builds a connection pool tuned for a low-throughput daemon.
// One sweep usually needs at most two connections (the SELECT + a transaction)
// so a max-pool of 4 leaves headroom without being wasteful.
//
// Retries the initial Ping for up to 60 seconds because Postgres takes a few
// seconds to be authentication-ready after first compose-up (postgres_isready
// returns OK on TCP accept before SASL handshake is fully wired). Without
// retries, the reaper container restart-loops for 30s after every fresh
// `docker compose up -d` until Postgres catches up.
func NewPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse DATABASE_URL: %w", err)
	}
	cfg.MaxConns = 4
	cfg.MinConns = 0
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pgxpool: %w", err)
	}

	// Retry the initial Ping for up to 60 seconds. Backoff doubles from 1s,
	// capped at 5s. We log every attempt at debug — operator running with
	// LOG_LEVEL=debug sees the retry sequence; default info-level just sees
	// success or final failure.
	const maxWait = 60 * time.Second
	const maxBackoff = 5 * time.Second
	deadline := time.Now().Add(maxWait)
	backoff := time.Second
	for {
		pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return pool, nil
		}
		if time.Now().After(deadline) {
			pool.Close()
			return nil, fmt.Errorf("ping postgres after %s: %w", maxWait, err)
		}
		// Sleep, but bail early if the parent ctx is cancelled (signal etc).
		select {
		case <-ctx.Done():
			pool.Close()
			return nil, fmt.Errorf("ping postgres cancelled: %w", ctx.Err())
		case <-time.After(backoff):
		}
		if backoff < maxBackoff {
			backoff *= 2
			if backoff > maxBackoff {
				backoff = maxBackoff
			}
		}
	}
}

// ----------------------------------------------------------------------------
// row models
// ----------------------------------------------------------------------------

// reapableShare is a single row returned by the candidate selection query.
// Carries just enough state to drive the per-share reap path; we re-fetch
// everything else inside the transaction so we read consistent values.
type reapableShare struct {
	ID      string
	ShortID string
}

// chunkRow is one row of the share_chunks table for a given share.
type chunkRow struct {
	BlobKey string
}

// destroyContext is the JSONB payload we feed into the audit-chain entry.
// Using a struct keeps the field names stable across versions; the JSON tag
// names are the contract the audit subscribers read against.
type destroyContext struct {
	ShareID     string `json:"shareId"`
	ShortID     string `json:"shortId"`
	Reason      string `json:"reason"`
	FileHashHex string `json:"fileHashHex"`
	DestroyedAt string `json:"destroyedAt"`
	ChunkCount  int    `json:"chunkCount"`
}

// ----------------------------------------------------------------------------
// queries
// ----------------------------------------------------------------------------

// selectReapableSQL is the candidate query. Notes:
//
//   - Two reapable conditions, mutually exclusive at the row level:
//       (a) the share is still nominally LIVE (state in ready/uploading/pending)
//           but its TTL has lapsed or download cap is hit.
//       (b) the share has already been flipped to DESTROYED (by the gateway's
//           /downloaded route firing burn-after-read, by /destroy, or by an
//           earlier reaper sweep that committed the row update but failed to
//           clear all blobs) AND there are still share_chunks rows waiting
//           on cleanup.
//     Putting `state='destroyed'` in the same outer IN list as the live
//     statuses (which earlier code did) is wrong because the second OR
//     clause never matches — the AND is unreachable. Two top-level branches
//     joined by OR makes the boolean clean.
//   - We re-query inside the per-share transaction with `FOR UPDATE SKIP
//     LOCKED` so two reaper instances (e.g. during a rolling deploy)
//     never fight over the same row. A daemon today only runs one replica,
//     but the lock is cheap and removes a foot-gun.
//   - Sort by `destroyed_at NULLS LAST, expires_at ASC` so burn-after-read
//     rows already flagged by the read path drain first.
const selectReapableSQL = `
SELECT id::text, short_id
  FROM shares s
 WHERE (
         state IN ('ready', 'uploading', 'pending')
         AND (
                expires_at < now()
                OR (max_downloads IS NOT NULL AND download_count >= max_downloads)
         )
       )
    OR (
         state = 'destroyed'
         AND destroyed_at IS NOT NULL
         AND EXISTS (SELECT 1 FROM share_chunks c WHERE c.share_id = s.id)
       )
 ORDER BY destroyed_at NULLS LAST, expires_at ASC
 LIMIT $1
`

// fetchShareForUpdateSQL re-reads the row inside the txn and locks it.
// Returns the data we need to build the audit payload + decide the reason.
const fetchShareForUpdateSQL = `
SELECT id::text,
       short_id,
       expires_at,
       burn_after_read,
       max_downloads,
       download_count,
       file_hash,
       state,
       destroyed_at
  FROM shares
 WHERE id = $1
   FOR UPDATE SKIP LOCKED
`

// updateShareDestroyedSQL flips the row to terminal `destroyed` state.
// `destroyed_at` is set to `now()` ONLY when it isn't already populated —
// burn-after-read rows have it set by the read path and we preserve that
// timestamp so the audit trail reflects the real moment of destruction.
const updateShareDestroyedSQL = `
UPDATE shares
   SET state = 'destroyed',
       destroyed_at = COALESCE(destroyed_at, now()),
       destroyed_reason = $2
 WHERE id = $1
`

// deleteChunksSQL removes the share_chunks rows. The FK is ON DELETE CASCADE
// in the canonical schema, but we issue an explicit DELETE so the row count
// is observable in logs and we don't depend on schema-level behaviour.
const deleteChunksSQL = `DELETE FROM share_chunks WHERE share_id = $1`

// fetchChunksSQL collects the blob keys we need to remove from MinIO.
const fetchChunksSQL = `SELECT blob_key FROM share_chunks WHERE share_id = $1`

// appendAuditSQL invokes the canonical SlothBox hash-chain helper. The RPC
// is the only way auditable entries enter the chain — it computes the prev
// hash, signs the row, and inserts inside the same txn.
const appendAuditSQL = `SELECT append_audit_entry($1, $2, $3::jsonb)`

// ----------------------------------------------------------------------------
// public-ish functions used by reaper.go
// ----------------------------------------------------------------------------

// fetchReapable returns up to `limit` shares that are due for reaping.
func fetchReapable(ctx context.Context, pool *pgxpool.Pool, limit int) ([]reapableShare, error) {
	rows, err := pool.Query(ctx, selectReapableSQL, limit)
	if err != nil {
		return nil, fmt.Errorf("select reapable: %w", err)
	}
	defer rows.Close()

	out := make([]reapableShare, 0, limit)
	for rows.Next() {
		var r reapableShare
		if err := rows.Scan(&r.ID, &r.ShortID); err != nil {
			return nil, fmt.Errorf("scan reapable row: %w", err)
		}
		out = append(out, r)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate reapable rows: %w", err)
	}
	return out, nil
}

// fetchChunkKeys reads every blob key for a share. Run BEFORE we open the
// destruction txn — we need the keys to delete from MinIO first, and we
// don't want to hold the row lock while doing remote network I/O.
func fetchChunkKeys(ctx context.Context, pool *pgxpool.Pool, shareID string) ([]string, error) {
	rows, err := pool.Query(ctx, fetchChunksSQL, shareID)
	if err != nil {
		return nil, fmt.Errorf("query chunks: %w", err)
	}
	defer rows.Close()

	var keys []string
	for rows.Next() {
		var c chunkRow
		if err := rows.Scan(&c.BlobKey); err != nil {
			return nil, fmt.Errorf("scan chunk: %w", err)
		}
		keys = append(keys, c.BlobKey)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate chunks: %w", err)
	}
	return keys, nil
}

// finalizeDestroy runs inside a Postgres transaction. It:
//
//  1. Locks the share row with FOR UPDATE SKIP LOCKED — if another reaper
//     instance has it, we silently skip (returns ErrShareGone).
//  2. Decides the destruction reason from the row state.
//  3. Deletes share_chunks rows.
//  4. Updates the share to `destroyed`.
//  5. Calls append_audit_entry with the JSONB payload.
//
// Idempotent on retry: if a previous run already destroyed the share, the
// FOR UPDATE returns no row and we report ErrShareGone — caller treats that
// as success.
func finalizeDestroy(
	ctx context.Context,
	pool *pgxpool.Pool,
	shareID string,
	chunkCount int,
) (FinalizeResult, error) {
	var result FinalizeResult

	tx, err := pool.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.ReadCommitted})
	if err != nil {
		return result, fmt.Errorf("begin tx: %w", err)
	}
	// Defer rollback — committing nils the txn so the rollback is a no-op
	// when we succeed.
	defer func() { _ = tx.Rollback(ctx) }()

	var (
		gotID, gotShortID, state         string
		expiresAt, destroyedAt           *time.Time
		burnAfterRead                    bool
		maxDownloads, downloadCount      *int
		fileHash                         []byte
	)
	err = tx.QueryRow(ctx, fetchShareForUpdateSQL, shareID).Scan(
		&gotID,
		&gotShortID,
		&expiresAt,
		&burnAfterRead,
		&maxDownloads,
		&downloadCount,
		&fileHash,
		&state,
		&destroyedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Either someone else holds the lock or the row is already
			// terminal. Either way: not our problem this sweep.
			return result, ErrShareGone
		}
		return result, fmt.Errorf("lock share row: %w", err)
	}

	reason := classifyReason(burnAfterRead, state, destroyedAt, expiresAt, maxDownloads, downloadCount)

	if _, err := tx.Exec(ctx, deleteChunksSQL, shareID); err != nil {
		return result, fmt.Errorf("delete chunks: %w", err)
	}
	if _, err := tx.Exec(ctx, updateShareDestroyedSQL, shareID, reason); err != nil {
		return result, fmt.Errorf("update share destroyed: %w", err)
	}

	// Build the audit payload. We freeze `destroyedAt` from the post-update
	// row so the JSON matches what's persisted in the shares row exactly.
	var rowDestroyedAt time.Time
	if err := tx.QueryRow(ctx,
		`SELECT destroyed_at FROM shares WHERE id = $1`, shareID,
	).Scan(&rowDestroyedAt); err != nil {
		return result, fmt.Errorf("re-read destroyed_at: %w", err)
	}

	payload := destroyContext{
		ShareID:     gotID,
		ShortID:     gotShortID,
		Reason:      reason,
		FileHashHex: hex.EncodeToString(fileHash),
		DestroyedAt: rowDestroyedAt.UTC().Format(time.RFC3339Nano),
		ChunkCount:  chunkCount,
	}
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return result, fmt.Errorf("marshal audit payload: %w", err)
	}
	// `append_audit_entry(event_type text, target_id uuid, payload jsonb)`
	// returns BIGINT (the new chain row's seq), so we MUST scan into int64.
	// Earlier code scanned into *string which pgx rejects with an explicit
	// type error on every txn — that bug crashed the whole sweep.
	var auditID int64
	if err := tx.QueryRow(ctx, appendAuditSQL, "share_destroyed", shareID, string(payloadBytes)).Scan(&auditID); err != nil {
		return result, fmt.Errorf("append audit entry: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return result, fmt.Errorf("commit destroy txn: %w", err)
	}

	result.Reason = reason
	result.AuditID = auditID
	result.DestroyedAt = rowDestroyedAt
	result.ShortID = gotShortID
	return result, nil
}

// FinalizeResult is the per-share output of the destroy txn. Used purely for
// logging at the moment; structured so callers don't have to thread reason
// strings through layers.
type FinalizeResult struct {
	Reason      string
	AuditID     int64
	DestroyedAt time.Time
	ShortID     string
}

// ErrShareGone is the sentinel returned by finalizeDestroy when the row is
// no longer reapable — race with another reaper, already destroyed, etc.
// Callers treat this as a successful no-op.
var ErrShareGone = errors.New("share already gone")

// classifyReason returns the canonical destruction-reason string written
// into shares.destroyed_reason and the audit payload.
func classifyReason(
	burnAfterRead bool,
	state string,
	destroyedAt, expiresAt *time.Time,
	maxDownloads, downloadCount *int,
) string {
	// The read path may have already flipped state=destroyed for a burn-
	// after-read share — in that case the row is in the candidate set
	// purely so we can clean up blobs + emit the audit entry.
	if burnAfterRead && state == "destroyed" && destroyedAt != nil {
		return "burn"
	}
	if maxDownloads != nil && downloadCount != nil && *downloadCount >= *maxDownloads {
		return "max_downloads"
	}
	if expiresAt != nil && expiresAt.Before(time.Now()) {
		return "expiry"
	}
	// Defensive default — should never hit if the candidate query is in sync.
	return "expiry"
}

// LogFields is a tiny helper that returns a closure callers use to attach
// share-scope fields to a logger event. Saves a few lines at each callsite.
func LogFields(shareID, shortID string) func(*zerolog.Event) *zerolog.Event {
	return func(e *zerolog.Event) *zerolog.Event {
		return e.Str("share_id", shareID).Str("short_id", shortID)
	}
}
