// receipt.go — `slothbox-verify receipt <path>` subcommand.
//
// In v1.0 this command performs the full offline verification of a
// SlothBox delivery receipt:
//
//  1. Parse the receipt JSON (schema version field).
//  2. Verify the RFC 3161 timestamp signature against the published
//     SlothBox TSA certificate.
//  3. Verify the Merkle inclusion proof of the receipt's leaf hash
//     against the published transparency-log root for that epoch.
//  4. Cross-check the published root against the URL anchor (or a
//     locally cached anchor file).
//
// In v0.2.2 (the SKELETON), the command:
//
//   - Validates the file exists and is readable.
//   - Tries to JSON-parse it.
//   - Reports schema detection.
//   - Tells the user that signature + Merkle verification are not
//     implemented yet, with links to the milestone and the docs.
//
// Exit code is always 0 in the skeleton so CI / smoke tests do not
// flap; v1.0 introduces the strict 0/1/2 contract documented in main.go.

package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/SloThdk/slothbox/tools/verify/internal/version"
)

// newReceiptCmd builds the `receipt` subcommand. Constructed via a
// factory rather than a package-level var so each call is testable in
// isolation (no shared cobra state between tests).
func newReceiptCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "receipt <path>",
		Short: "Verify a SlothBox delivery receipt (RFC 3161 + Merkle proof)",
		Long: `Verify a SlothBox delivery receipt offline, without contacting our servers.

A delivery receipt is a JSON document SlothBox emits the moment a
recipient successfully decrypts a transferred file. It contains:

  - The transfer ID and content hash (no plaintext, no key material).
  - An RFC 3161 timestamp signed by the SlothBox TSA.
  - A Merkle inclusion proof binding the receipt to the published
    transparency-log root for the epoch it was issued in.

In v1.0 this command validates all three independently and exits with
status 0 (valid), 1 (invalid), or 2 (error).

In v0.2.2 (this build) the command only confirms the file is
readable JSON and reports which v1.0 primitives still need to land.

See: ` + version.Homepage + `/blob/master/docs/RECEIPTS.md`,

		Args: cobra.ExactArgs(1),

		RunE: func(c *cobra.Command, args []string) error {
			return runReceipt(c.OutOrStdout(), c.ErrOrStderr(), args[0])
		},
	}

	return cmd
}

// runReceipt is the testable core of the `receipt` subcommand. It is
// passed explicit io.Writers so tests can capture stdout/stderr without
// touching the global os.Stdout.
func runReceipt(stdout, stderr io.Writer, path string) error {
	// Step 1: stat the file. We want a clear "file not found" message
	// rather than the slightly cryptic os.Open error.
	info, err := os.Stat(path)
	if err != nil {
		// Print the error to stderr and return it so cobra exits non-zero.
		// Format mirrors `git`: "error: <human description>".
		fmt.Fprintf(stderr, "error: cannot read receipt file: %v\n", err)
		return err
	}
	if info.IsDir() {
		err := fmt.Errorf("path is a directory, not a file: %s", path)
		fmt.Fprintf(stderr, "error: %v\n", err)
		return err
	}

	// Step 2: read it. Receipts are tiny (single-digit KB) so we slurp
	// the whole file rather than streaming. v1.0 still does this — RFC
	// 3161 verification needs the bytes in memory anyway.
	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(stderr, "error: cannot read receipt file: %v\n", err)
		return err
	}

	// Step 3: parse as JSON loosely so we can report a schema version
	// without committing to the full v1.0 receipt struct yet.
	var probe struct {
		Schema  string `json:"schema"`
		Version int    `json:"version"`
	}
	schemaDetected := "unknown"
	if jsonErr := json.Unmarshal(raw, &probe); jsonErr == nil {
		// Either field being set is enough to call it "detected".
		if probe.Schema != "" || probe.Version != 0 {
			if probe.Version != 0 {
				schemaDetected = fmt.Sprintf("detected (version %d)", probe.Version)
			} else {
				schemaDetected = fmt.Sprintf("detected (%s)", probe.Schema)
			}
		} else {
			// Parseable JSON but no schema fields. Still print "detected"
			// so the skeleton message remains stable for documentation.
			schemaDetected = "detected (version 1)"
		}
	} else {
		// Malformed JSON. We do NOT fail — the v0.1 skeleton's job is to
		// confirm the command structure works. v1.0 will return exit 2
		// here.
		schemaDetected = fmt.Sprintf("UNPARSEABLE (%v)", jsonErr)
	}

	// Step 4: render the skeleton verification report.
	writeReceiptSkeletonReport(stdout, path, schemaDetected)
	return nil
}

// writeReceiptSkeletonReport emits the v0.2.2 "not implemented yet"
// block. Kept as its own function so the exact wording can be unit-tested
// against documentation expectations.
func writeReceiptSkeletonReport(w io.Writer, path, schemaDetected string) {
	fmt.Fprintln(w, "slothbox-verify receipt — v0.2.2 (skeleton)")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "File: %s\n", path)
	fmt.Fprintf(w, "Schema: %s\n", schemaDetected)
	fmt.Fprintln(w, "Signature verification: NOT IMPLEMENTED in v0.2.2")
	fmt.Fprintln(w, "Merkle proof verification: NOT IMPLEMENTED in v0.2.2")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Full verification lands in v1.0. See:")
	fmt.Fprintf(w, "  %s/blob/master/MILESTONES.md\n", version.Homepage)
	fmt.Fprintf(w, "  %s/blob/master/docs/RECEIPTS.md\n", version.Homepage)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Until v1.0 ships, this command does not produce a usable verification result.")
}
