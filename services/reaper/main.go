// Command reaper — SlothBox share reaper daemon.
//
// The reaper sweeps for expired or burn-after-read shares and:
//
//   - Removes their encrypted chunk blobs from MinIO.
//   - Transitions the share state to `destroyed` with a destroy reason.
//   - Appends a `share_destroyed` entry to the tamper-evident audit
//     hash-chain via the `append_audit_entry` Postgres function.
//
// Usage:
//
//	reaper            # long-running loop; sweeps every REAPER_INTERVAL_SECONDS
//	reaper --once     # run one sweep iteration and exit (for cron triggers)
//
// All configuration is environment-only. See internal/reaper/config.go for
// the full list. The process refuses to start if any required variable is
// missing or malformed.
//
// Signal handling:
//
//	SIGINT / SIGTERM trigger graceful shutdown. The current sweep finishes
//	(bounded by a 5s deadline), the pgx pool is drained, then the process
//	exits with status 0. Anything else exits with status 1 and the reason
//	is the final log line.
package main

import (
	"context"
	"errors"
	"flag"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/SloThdk/slothbox/reaper/internal/reaper"
	"github.com/rs/zerolog/log"
)

// shutdownGrace is the hard deadline the daemon respects after it receives
// SIGINT / SIGTERM before forcibly cancelling in-flight work. Keep aligned
// with the Dockerfile / Kubernetes terminationGracePeriodSeconds.
const shutdownGrace = 5 * time.Second

func main() {
	once := flag.Bool("once", false, "run a single sweep iteration and exit")
	flag.Parse()

	cfg, err := reaper.LoadConfig()
	if err != nil {
		// Pre-logger boot failure — write to stderr in a shape humans can read,
		// then exit non-zero. We can't rely on zerolog yet; the config it
		// reads from is what failed.
		_, _ = os.Stderr.WriteString("reaper: " + err.Error() + "\n")
		os.Exit(2)
	}

	// Logger comes online as early as possible so subsequent failures are
	// captured in structured form.
	reaper.InitLogger(cfg)
	log.Info().
		Str("event", "boot").
		Bool("once", *once).
		Interface("config", cfg.Redacted()).
		Msg("reaper booting")

	// Root context that gets cancelled on SIGINT / SIGTERM. signal.NotifyContext
	// is cleaner than the manual signal.Notify dance and propagates cancellation
	// through every child context built off it.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	daemon, err := reaper.New(ctx, cfg)
	if err != nil {
		log.Fatal().
			Err(err).
			Str("event", "boot_failed").
			Msg("failed to construct reaper daemon")
	}

	// Schedule the close on a separate context so we still get to drain the
	// pgx pool after the main context is cancelled. shutdownGrace is the
	// upper bound the OS / orchestrator gives us to walk away cleanly.
	defer func() {
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownGrace)
		defer cancel()
		drainAndClose(shutdownCtx, daemon)
	}()

	switch {
	case *once:
		runOnce(ctx, daemon)
	default:
		runLoop(ctx, daemon)
	}
}

// runOnce executes a single sweep iteration. Exits non-zero on failure so
// cron / kubernetes Job runners surface the problem.
func runOnce(ctx context.Context, daemon *reaper.Daemon) {
	if err := daemon.Once(ctx); err != nil {
		if errors.Is(err, context.Canceled) {
			log.Warn().Str("event", "once_cancelled").Msg("one-shot run cancelled before completion")
			os.Exit(130) // 128 + SIGINT(2)
		}
		log.Error().Err(err).Str("event", "once_failed").Msg("one-shot sweep failed")
		os.Exit(1)
	}
	log.Info().Str("event", "once_finished").Msg("one-shot sweep complete")
}

// runLoop hands control to the daemon's long-running loop. Returns when the
// root context is cancelled.
func runLoop(ctx context.Context, daemon *reaper.Daemon) {
	if err := daemon.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
		log.Error().Err(err).Str("event", "loop_failed").Msg("reaper loop exited with error")
		os.Exit(1)
	}
}

// drainAndClose waits for any in-flight sweep finish window then releases
// long-lived resources. The bounded shutdownCtx prevents us from blocking
// the OS shutdown indefinitely.
func drainAndClose(shutdownCtx context.Context, daemon *reaper.Daemon) {
	done := make(chan struct{})
	go func() {
		daemon.Close()
		close(done)
	}()
	select {
	case <-done:
		log.Info().Str("event", "shutdown_complete").Msg("clean shutdown")
	case <-shutdownCtx.Done():
		log.Warn().
			Str("event", "shutdown_forced").
			Dur("grace", shutdownGrace).
			Msg("shutdown grace exceeded; exiting anyway")
	}
}
