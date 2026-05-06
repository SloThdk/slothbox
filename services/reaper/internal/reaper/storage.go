// Package reaper — MinIO / S3 object-store wrapper.
//
// We deliberately keep the SDK surface narrow: only `RemoveObject` is needed
// in v0.1, but isolating it behind a Storage interface keeps the rest of the
// daemon mockable in tests and gives us a single place to add retry / backoff
// when v0.5+ moves to bulk delete via `RemoveObjects`.
package reaper

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// Storage is the small slice of object-store operations the reaper needs.
// Real impl is *minioStorage; tests can swap in a fake without dragging in
// docker-compose just to assert chunk deletion.
type Storage interface {
	// RemoveBlob deletes a single object identified by key from the bucket.
	// "object not found" is NOT treated as an error — a previous sweep may
	// have removed the blob and crashed before committing the txn.
	RemoveBlob(ctx context.Context, key string) error
}

// minioStorage is the production Storage implementation backed by minio-go.
type minioStorage struct {
	client *minio.Client
	bucket string
}

// NewStorage wires up a MinIO client from validated config. Eager Ping is
// done by performing a `BucketExists` check — fails fast on bad creds /
// missing bucket.
func NewStorage(ctx context.Context, cfg Config) (Storage, error) {
	client, err := minio.New(cfg.MinIOEndpoint, &minio.Options{
		Creds:  credentials.NewStaticV4(cfg.MinIOAccessKey, cfg.MinIOSecretKey, ""),
		Secure: cfg.MinIOUseSSL,
	})
	if err != nil {
		return nil, fmt.Errorf("init minio client: %w", err)
	}

	exists, err := client.BucketExists(ctx, cfg.MinIOBucket)
	if err != nil {
		return nil, fmt.Errorf("verify minio bucket %q: %w", cfg.MinIOBucket, err)
	}
	if !exists {
		return nil, fmt.Errorf("minio bucket %q does not exist", cfg.MinIOBucket)
	}
	return &minioStorage{client: client, bucket: cfg.MinIOBucket}, nil
}

// RemoveBlob implements Storage. NoSuchKey is mapped to a debug-log no-op
// per the daemon contract — idempotent reaping is a feature.
func (s *minioStorage) RemoveBlob(ctx context.Context, key string) error {
	err := s.client.RemoveObject(ctx, s.bucket, key, minio.RemoveObjectOptions{})
	if err == nil {
		return nil
	}
	if isObjectNotFound(err) {
		log.Ctx(ctx).Debug().
			Str("event", "blob_already_gone").
			Str("blob_key", key).
			Msg("blob already absent from minio (idempotent skip)")
		return nil
	}
	return fmt.Errorf("remove object %q: %w", key, err)
}

// removeBlobs is a small helper that deletes a slice of keys serially and
// returns the first hard error encountered. We return early because if MinIO
// is degraded the rest of the sweep should bail out and try again next tick.
func removeBlobs(ctx context.Context, s Storage, keys []string, l *zerolog.Logger) error {
	for _, k := range keys {
		if err := ctx.Err(); err != nil {
			// Honour cancellation — the daemon may be shutting down.
			return err
		}
		if err := s.RemoveBlob(ctx, k); err != nil {
			l.Error().
				Err(err).
				Str("event", "blob_remove_failed").
				Str("blob_key", k).
				Msg("minio remove failed; aborting share reap to retry on next sweep")
			return err
		}
		l.Debug().
			Str("event", "blob_removed").
			Str("blob_key", k).
			Msg("blob removed from minio")
	}
	return nil
}

// isObjectNotFound recognises both the typed `minio.ErrorResponse` "NoSuchKey"
// shape and the HTTP-404 fallback so we don't treat a benign idempotent retry
// as a hard failure.
func isObjectNotFound(err error) bool {
	var minErr minio.ErrorResponse
	if errors.As(err, &minErr) {
		if minErr.Code == "NoSuchKey" || minErr.StatusCode == http.StatusNotFound {
			return true
		}
	}
	return false
}
