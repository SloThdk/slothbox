// Package reaper — structured logger setup.
//
// We use zerolog because it's allocation-free on the hot path (the JSON
// encoder writes directly into a pooled byte slice), produces compact JSON
// that ingests cleanly into Loki / CloudWatch / Datadog, and supports
// contextual fields without `fmt.Sprintf` glue.
//
// Conventions used throughout the daemon:
//   - The root logger is the package-level `log.Logger` from zerolog/log;
//     callers should prefer `log.Ctx(ctx)` once a context-bound logger is
//     attached so per-sweep / per-share fields propagate automatically.
//   - Every log line has an `event=...` field that names what just happened
//     in domain language (`event=share_destroyed`, `event=sweep_started`).
//     This is the field we group on in dashboards.
package reaper

import (
	"context"
	"io"
	"os"
	"strings"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"
)

// InitLogger configures the global zerolog logger from the supplied config.
//
// Output is JSON to stdout — perfect for container log shippers. In a TTY
// (i.e. running locally with `go run`) we swap to the pretty console writer
// so logs are human-readable during dev.
func InitLogger(cfg Config) {
	level := parseLevel(cfg.LogLevel)
	zerolog.SetGlobalLevel(level)

	// Use RFC3339 millisecond timestamps. Easier to correlate with Postgres
	// `clock_timestamp()` and Stripe / S3 audit logs than the default unix.
	zerolog.TimeFieldFormat = time.RFC3339Nano

	var writer io.Writer = os.Stdout
	if isTerminal(os.Stdout) {
		writer = zerolog.ConsoleWriter{
			Out:        os.Stdout,
			TimeFormat: time.RFC3339,
		}
	}

	log.Logger = zerolog.New(writer).
		With().
		Timestamp().
		Str("service", "reaper").
		Logger()
}

// LoggerWithSweep returns a context whose attached logger has a `sweep_id`
// field so every log line emitted during one sweep iteration is correlatable.
func LoggerWithSweep(ctx context.Context, sweepID string) context.Context {
	l := log.Logger.With().Str("sweep_id", sweepID).Logger()
	return l.WithContext(ctx)
}

// LoggerWithShare returns a context that carries share-scoped fields so each
// per-share log line picks them up automatically without manual passing.
func LoggerWithShare(ctx context.Context, shareID, shortID string) context.Context {
	l := zerolog.Ctx(ctx).With().
		Str("share_id", shareID).
		Str("short_id", shortID).
		Logger()
	return l.WithContext(ctx)
}

// parseLevel converts the validated config string into a zerolog Level.
// Falls back to InfoLevel if the value is unrecognised — defence in depth,
// the validator already rejected unknown values.
func parseLevel(s string) zerolog.Level {
	switch strings.ToLower(s) {
	case "debug":
		return zerolog.DebugLevel
	case "warn":
		return zerolog.WarnLevel
	case "error":
		return zerolog.ErrorLevel
	default:
		return zerolog.InfoLevel
	}
}

// isTerminal returns true when the file descriptor refers to a TTY. We use
// it to pick the pretty console writer for local dev. Pure stdlib check —
// avoids dragging in golang.org/x/term just for one syscall.
func isTerminal(f *os.File) bool {
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}
