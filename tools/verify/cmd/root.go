// Package cmd hosts every cobra command for slothbox-verify.
//
// The root command does no work itself — running the binary with no
// subcommand prints help. Every verification primitive (receipt,
// deletion, chain) is its own subcommand so we can grow the surface
// over time without breaking flag parsing.
package cmd

import (
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/SloThdk/slothbox/tools/verify/internal/version"
)

// Global flags. Declared as package vars so subcommands can read them
// without re-plumbing through closures. They are wired in init() below.
var (
	// jsonOutput toggles machine-readable output. v0.1 only honours it
	// for --version (everything else is human-facing skeleton text);
	// from v1.0 every subcommand emits a stable JSON shape under this flag.
	jsonOutput bool

	// quiet suppresses non-essential stdout. Reserved for v1.0; declared
	// now so users scripting against the binary do not have to relearn
	// flags between releases.
	quiet bool

	// showVersion is the --version global. We handle it in PersistentPreRunE
	// rather than as a subcommand so `slothbox-verify --version` works
	// without typing a verb.
	showVersion bool
)

// rootCmd is the cobra root. Exported only via Execute() to keep the
// public surface of the cmd package minimal.
var rootCmd = &cobra.Command{
	Use:   "slothbox-verify",
	Short: "Independently verify SlothBox delivery receipts and deletion proofs",
	Long: `slothbox-verify is the standalone, offline verifier for SlothBox.

SlothBox is a public-source end-to-end encrypted file transfer service.
Every successful delivery and every successful deletion produces a
cryptographic receipt that anyone — sender, recipient, auditor, or
hostile observer — can verify WITHOUT contacting SlothBox's servers.

This binary is that verifier. It reads a receipt or proof file (or
fetches a published Merkle anchor by URL) and tells you whether the
claim holds against the published transparency log.

If SlothBox ever lies about a delivery or a deletion, this tool will
catch it. That is the point.

The v0.1.0-alpha release is a command-structure skeleton. Full RFC 3161
signature verification and Merkle inclusion-proof checking land in v1.0.
See: ` + version.Homepage + `/blob/master/MILESTONES.md`,

	// Disable cobra's default behaviour of printing usage on every
	// runtime error — we want a clean error line for scripting.
	SilenceUsage: true,

	// Keep error printing on so users see why a command failed.
	SilenceErrors: false,

	// PersistentPreRunE intercepts --version before any subcommand
	// runs, which is why `slothbox-verify --version` (no verb) works.
	PersistentPreRunE: func(cmd *cobra.Command, args []string) error {
		if showVersion {
			printVersion(cmd.OutOrStdout())
			// Returning a sentinel error would also work, but cobra's
			// idiom for "I handled this, exit cleanly" is to call
			// os.Exit. We do it explicitly because returning nil here
			// would still cause the root command's RunE to fire.
			os.Exit(0)
		}
		return nil
	},

	// If the user runs the binary with no subcommand and no --version,
	// cobra defaults to printing help. Explicit RunE keeps the exit
	// code at 0 (help is not an error).
	RunE: func(cmd *cobra.Command, args []string) error {
		return cmd.Help()
	},
}

// init wires global flags onto the root command. Called automatically
// by the runtime before main() runs.
func init() {
	// --version / -v: short form is intentionally `-v` even though
	// some tools use it for verbose. We do not have a verbose mode in
	// v0.1, and following `git --version` / `go version` ergonomics is
	// more important than reserving -v for future verbosity.
	rootCmd.PersistentFlags().BoolVarP(&showVersion, "version", "v", false,
		"Print version information and exit")

	// --json: machine-readable output mode. Honoured only by --version
	// in v0.1; subcommands gain JSON output in v1.0.
	rootCmd.PersistentFlags().BoolVar(&jsonOutput, "json", false,
		"Emit machine-readable JSON instead of human-facing text (v1.0+)")

	// --quiet / -q: reserved. Declared now so the flag exists and
	// scripts written against the alpha do not break in v1.0.
	rootCmd.PersistentFlags().BoolVarP(&quiet, "quiet", "q", false,
		"Suppress non-essential output (reserved for v1.0)")

	// Register subcommands. New verbs go here.
	rootCmd.AddCommand(newReceiptCmd())
	rootCmd.AddCommand(newDeletionCmd())
	rootCmd.AddCommand(newChainCmd())
}

// Execute runs the root cobra command and returns whatever cobra returns.
// main() is responsible for translating non-nil errors into exit code 2.
func Execute() error {
	return rootCmd.Execute()
}

// printVersion writes the standard version block to w. Honours --json
// for users piping the output into other tools.
//
// The format is intentionally stable: scripts can grep for "version "
// or jq the JSON output and rely on those keys not changing across
// patch releases.
func printVersion(w io.Writer) {
	if jsonOutput {
		// Hand-rolled JSON to avoid pulling in encoding/json from a
		// path that runs unconditionally. (`go run`-with-LDFLAGS-stripped
		// builds keep startup cheap.) Escape values that could contain
		// quotes? — No: Version, GitSHA, GoVersion are all controlled
		// by us via -ldflags or constants, so they cannot contain
		// reserved JSON characters. If that ever stops being true,
		// switch to encoding/json.
		fmt.Fprintf(w, `{"name":"slothbox-verify","version":%q,"go":%q,"git":%q,"build_date":%q,"homepage":%q}`+"\n",
			version.Version,
			version.GoVersion,
			version.GitSHA,
			version.BuildDate,
			version.Homepage,
		)
		return
	}

	// Human-facing block. Mirrors `go version` / `git --version` style.
	fmt.Fprintf(w, "slothbox-verify version %s\n", version.Version)
	fmt.Fprintf(w, "go: %s\n", version.GoVersion)
	if version.GitSHA != "" {
		fmt.Fprintf(w, "git: %s\n", version.GitSHA)
	}
	if version.BuildDate != "" {
		fmt.Fprintf(w, "build date: %s\n", version.BuildDate)
	}
	fmt.Fprintf(w, "homepage: %s\n", version.Homepage)
}
