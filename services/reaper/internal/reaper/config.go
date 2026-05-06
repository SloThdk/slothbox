// Package reaper implements the SlothBox share-expiry reaper daemon.
//
// This file owns runtime configuration. Everything is loaded from environment
// variables at process boot, validated, and frozen into an immutable Config
// value that the rest of the package reads through. We deliberately do NOT
// support a config file or CLI flags for these values — env-only is the
// twelve-factor pattern, plays well with Docker / Kubernetes / Fly machines,
// and avoids the "which source wins?" precedence headache.
package reaper

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the immutable runtime configuration for the reaper daemon.
//
// All fields are required unless a default is documented. The zero value of
// Config is NOT usable — always construct via LoadConfig.
type Config struct {
	// DatabaseURL is a libpq-style connection string for the SlothBox
	// Postgres database, e.g. `postgres://user:pass@host:5432/slothbox?sslmode=require`.
	// Validated to be non-empty and to start with `postgres://` or `postgresql://`.
	DatabaseURL string

	// MinIOEndpoint is the host[:port] of the MinIO / S3 endpoint without
	// scheme, e.g. `minio.internal:9000` or `s3.eu-central-1.amazonaws.com`.
	MinIOEndpoint string

	// MinIOAccessKey is the access key id used to authenticate against MinIO.
	MinIOAccessKey string

	// MinIOSecretKey is the secret access key paired with MinIOAccessKey.
	// Treated as a secret — never logged at info level.
	MinIOSecretKey string

	// MinIOBucket is the bucket that holds encrypted chunk blobs.
	MinIOBucket string

	// MinIOUseSSL toggles HTTPS to the object store. Default false (suitable
	// for in-cluster MinIO over a private network); set true for hosted S3.
	MinIOUseSSL bool

	// Interval is the wall-clock duration between sweep iterations in the
	// long-running mode. Default 60s.
	Interval time.Duration

	// BatchSize caps how many shares a single sweep iteration will reap.
	// Default 100. Keeps individual sweeps bounded and prevents one giant
	// transaction from blocking concurrent writes.
	BatchSize int

	// LogLevel is the zerolog level: debug | info | warn | error.
	// Default info.
	LogLevel string

	// MetricsAddr, if non-empty, is the listen address for the Prometheus
	// /metrics endpoint, e.g. `:9090`. When empty the metrics server is
	// disabled entirely (v0.1 default — wire it up in v0.5+).
	MetricsAddr string
}

// LoadConfig reads the daemon configuration from the process environment.
//
// Returns a fully validated Config or an aggregated error describing every
// missing / malformed variable in one shot — easier on the operator than
// failing one variable at a time.
func LoadConfig() (Config, error) {
	cfg := Config{
		DatabaseURL:    strings.TrimSpace(os.Getenv("DATABASE_URL")),
		MinIOEndpoint:  strings.TrimSpace(os.Getenv("MINIO_ENDPOINT")),
		MinIOAccessKey: strings.TrimSpace(os.Getenv("MINIO_ACCESS_KEY")),
		MinIOSecretKey: os.Getenv("MINIO_SECRET_KEY"), // do NOT TrimSpace a secret
		MinIOBucket:    strings.TrimSpace(os.Getenv("MINIO_BUCKET")),
		LogLevel:       strings.ToLower(strings.TrimSpace(getenvDefault("LOG_LEVEL", "info"))),
		MetricsAddr:    strings.TrimSpace(os.Getenv("METRICS_ADDR")),
	}

	// MINIO_USE_SSL — accept the usual truthy strings.
	cfg.MinIOUseSSL = parseBool(os.Getenv("MINIO_USE_SSL"))

	// Interval: REAPER_INTERVAL_SECONDS, default 60.
	intervalSec, err := parseIntDefault("REAPER_INTERVAL_SECONDS", 60)
	if err != nil {
		return Config{}, err
	}
	if intervalSec < 1 {
		return Config{}, fmt.Errorf("REAPER_INTERVAL_SECONDS must be >= 1, got %d", intervalSec)
	}
	cfg.Interval = time.Duration(intervalSec) * time.Second

	// Batch size: REAPER_BATCH_SIZE, default 100.
	batchSize, err := parseIntDefault("REAPER_BATCH_SIZE", 100)
	if err != nil {
		return Config{}, err
	}
	if batchSize < 1 {
		return Config{}, fmt.Errorf("REAPER_BATCH_SIZE must be >= 1, got %d", batchSize)
	}
	cfg.BatchSize = batchSize

	if err := cfg.validate(); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

// validate enforces the field-level invariants. Aggregates every problem so
// the operator sees a single error message listing all missing pieces.
func (c Config) validate() error {
	var problems []string

	if c.DatabaseURL == "" {
		problems = append(problems, "DATABASE_URL is required")
	} else if !strings.HasPrefix(c.DatabaseURL, "postgres://") &&
		!strings.HasPrefix(c.DatabaseURL, "postgresql://") {
		problems = append(problems, "DATABASE_URL must begin with postgres:// or postgresql://")
	}

	if c.MinIOEndpoint == "" {
		problems = append(problems, "MINIO_ENDPOINT is required")
	} else if strings.Contains(c.MinIOEndpoint, "://") {
		// MinIO SDK takes host[:port] without scheme.
		problems = append(problems, "MINIO_ENDPOINT must be host[:port] without scheme (use MINIO_USE_SSL for tls)")
	}

	if c.MinIOAccessKey == "" {
		problems = append(problems, "MINIO_ACCESS_KEY is required")
	}
	if c.MinIOSecretKey == "" {
		problems = append(problems, "MINIO_SECRET_KEY is required")
	}
	if c.MinIOBucket == "" {
		problems = append(problems, "MINIO_BUCKET is required")
	}

	switch c.LogLevel {
	case "debug", "info", "warn", "error":
		// ok
	default:
		problems = append(problems, fmt.Sprintf("LOG_LEVEL must be debug|info|warn|error, got %q", c.LogLevel))
	}

	if len(problems) == 0 {
		return nil
	}
	return errors.New("invalid configuration:\n  - " + strings.Join(problems, "\n  - "))
}

// Redacted returns a copy of the config safe for structured logging — secret
// values are replaced with a fixed placeholder so we can dump the whole struct
// at startup without leaking credentials into log shippers.
func (c Config) Redacted() Config {
	out := c
	if out.MinIOSecretKey != "" {
		out.MinIOSecretKey = "[redacted]"
	}
	// DATABASE_URL frequently contains an embedded password — collapse the
	// whole value to a host-only summary.
	out.DatabaseURL = redactDSN(c.DatabaseURL)
	return out
}

// ----------------------------------------------------------------------------
// helpers
// ----------------------------------------------------------------------------

// getenvDefault returns os.Getenv(key) when set, otherwise def.
func getenvDefault(key, def string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return def
}

// parseBool accepts the conventional truthy spellings used in 12-factor envs.
func parseBool(s string) bool {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

// parseIntDefault reads an int env var with a fallback default.
func parseIntDefault(key string, def int) (int, error) {
	raw, ok := os.LookupEnv(key)
	if !ok || strings.TrimSpace(raw) == "" {
		return def, nil
	}
	n, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer, got %q", key, raw)
	}
	return n, nil
}

// redactDSN trims user:pass out of a libpq URL leaving scheme + host[:port] +
// dbname. Best-effort; fall back to a generic placeholder on parse trouble.
func redactDSN(dsn string) string {
	if dsn == "" {
		return ""
	}
	// scheme://user:pass@host:port/db?args
	schemeEnd := strings.Index(dsn, "://")
	if schemeEnd < 0 {
		return "[redacted dsn]"
	}
	scheme := dsn[:schemeEnd]
	rest := dsn[schemeEnd+3:]
	at := strings.LastIndex(rest, "@")
	if at >= 0 {
		rest = rest[at+1:]
	}
	// drop query string for brevity
	if q := strings.Index(rest, "?"); q >= 0 {
		rest = rest[:q]
	}
	return scheme + "://[redacted]@" + rest
}
