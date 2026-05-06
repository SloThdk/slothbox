// chain.go — `slothbox-verify chain <url>` subcommand.
//
// In v1.0 this command fetches a published SlothBox transparency-log
// MERKLE ROOT ANCHOR (a small signed JSON document at a stable URL) and
// verifies:
//
//  1. The anchor's signature is valid for the SlothBox log signing key.
//  2. The anchor's claimed root hash matches the locally-recomputed root
//     when the user has previously cached a sequence of leaves.
//  3. The anchor extends the previous epoch consistently (Merkle
//     consistency proof) — i.e. the log is append-only.
//
// In v0.1.0-alpha (the SKELETON), the command:
//
//   - Validates the URL syntactically (with net/url).
//   - Tells the user that fetching + signature + consistency-proof
//     verification are not implemented yet.
//
// We deliberately do NOT make a network request in v0.1 — even a HEAD
// probe — because the skeleton must be safe to run in air-gapped
// environments (CI smoke tests, security reviews, offline packaging
// builds). v1.0 introduces a `--offline` flag for that use case and
// performs the fetch by default.
//
// Exit code is always 0 in the skeleton.

package cmd

import (
	"fmt"
	"io"
	"net/url"

	"github.com/spf13/cobra"

	"github.com/SloThdk/slothbox/tools/verify/internal/version"
)

// newChainCmd builds the `chain` subcommand.
func newChainCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "chain <url>",
		Short: "Fetch and verify a published SlothBox Merkle root anchor",
		Long: `Fetch and verify a published SlothBox transparency-log root anchor.

SlothBox publishes a signed Merkle root anchor at the end of every log
epoch. The anchor is the public commitment that lets receipts and
deletion proofs be verified independently — without trusting any
SlothBox server.

In v1.0 this command:
  - Fetches the anchor JSON from the given URL.
  - Verifies its signature against the SlothBox log signing key.
  - Verifies a Merkle consistency proof against the previously
    cached anchor (if one is available locally).

In v0.1.0-alpha (this build) the command only validates that the URL
is syntactically well-formed and reports which v1.0 primitives still
need to land. NO network request is made — the skeleton is safe to
run in air-gapped environments.

See: ` + version.Homepage + `/blob/master/docs/RECEIPTS.md`,

		Args: cobra.ExactArgs(1),

		RunE: func(c *cobra.Command, args []string) error {
			return runChain(c.OutOrStdout(), c.ErrOrStderr(), args[0])
		},
	}

	return cmd
}

// runChain is the testable core of the `chain` subcommand.
//
// In the skeleton we only validate the URL. We accept http and https
// schemes; v1.0 will reject http unless --insecure is passed.
func runChain(stdout, stderr io.Writer, raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		fmt.Fprintf(stderr, "error: invalid URL: %v\n", err)
		return err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		err := fmt.Errorf("unsupported URL scheme %q (expected http or https)", parsed.Scheme)
		fmt.Fprintf(stderr, "error: %v\n", err)
		return err
	}
	if parsed.Host == "" {
		err := fmt.Errorf("URL is missing a host: %s", raw)
		fmt.Fprintf(stderr, "error: %v\n", err)
		return err
	}

	writeChainSkeletonReport(stdout, raw)
	return nil
}

// writeChainSkeletonReport emits the v0.1.0-alpha "not implemented yet"
// block for the chain anchor command.
func writeChainSkeletonReport(w io.Writer, anchorURL string) {
	fmt.Fprintln(w, "slothbox-verify chain — v0.1.0-alpha (skeleton)")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "URL: %s\n", anchorURL)
	fmt.Fprintln(w, "URL syntax: ok")
	fmt.Fprintln(w, "Anchor fetch: NOT IMPLEMENTED in v0.1.0-alpha (no network request made)")
	fmt.Fprintln(w, "Signature verification: NOT IMPLEMENTED in v0.1.0-alpha")
	fmt.Fprintln(w, "Consistency-proof verification: NOT IMPLEMENTED in v0.1.0-alpha")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Full verification lands in v1.0. See:")
	fmt.Fprintf(w, "  %s/blob/master/MILESTONES.md\n", version.Homepage)
	fmt.Fprintf(w, "  %s/blob/master/docs/RECEIPTS.md\n", version.Homepage)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Until v1.0 ships, this command does not produce a usable verification result.")
}
