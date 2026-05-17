// deletion.go — `slothbox-verify deletion <path>` subcommand.
//
// In v1.0 this command verifies a SlothBox VERIFIABLE DELETION PROOF:
// the cryptographic artifact a server emits when a transfer is
// destroyed (TTL expired, manual delete, or recipient burn-after-read).
//
// A deletion proof is structurally similar to a delivery receipt but
// commits to a TOMBSTONE leaf rather than a delivery leaf in the
// transparency log. The verifier checks:
//
//  1. The deletion-proof JSON parses against the published schema.
//  2. The RFC 3161 timestamp signature is valid for the SlothBox TSA.
//  3. The tombstone leaf is present in the Merkle tree at the claimed
//     epoch (proves "yes, we logged the deletion").
//  4. NO delivery-leaf for the same transfer ID exists in any later
//     epoch (proves "and we did not silently re-create it").
//
// Step 4 is what makes the deletion proof "verifiable" rather than
// "claimed" — it relies on the transparency log being append-only.
//
// In v0.2.0 (the SKELETON), the command:
//
//   - Validates the file exists and is readable.
//   - Tries to JSON-parse it.
//   - Reports schema detection.
//   - Tells the user that signature + Merkle + non-existence verification
//     are not implemented yet.
//
// Exit code is always 0 in the skeleton.

package cmd

import (
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/spf13/cobra"

	"github.com/SloThdk/slothbox/tools/verify/internal/version"
)

// newDeletionCmd builds the `deletion` subcommand.
func newDeletionCmd() *cobra.Command {
	cmd := &cobra.Command{
		Use:   "deletion <path>",
		Short: "Verify a SlothBox verifiable deletion proof",
		Long: `Verify a SlothBox verifiable deletion proof offline, without contacting our servers.

A verifiable deletion proof is a JSON document SlothBox emits when a
transfer is destroyed. It is the cryptographic counterpart to a delivery
receipt: it proves the deletion was logged AND that no later delivery
leaf for the same transfer ID was ever appended to the transparency log.

In v1.0 this command validates the proof's signature, Merkle inclusion,
and the non-existence claim across the published log epochs. Exit codes:
0 = deleted-and-stayed-deleted, 1 = invalid proof or contradictory log,
2 = I/O / parse error.

In v0.2.0 (this build) the command only confirms the file is
readable JSON and reports which v1.0 primitives still need to land.

See: ` + version.Homepage + `/blob/master/docs/DELETION.md`,

		Args: cobra.ExactArgs(1),

		RunE: func(c *cobra.Command, args []string) error {
			return runDeletion(c.OutOrStdout(), c.ErrOrStderr(), args[0])
		},
	}

	return cmd
}

// runDeletion is the testable core of the `deletion` subcommand.
//
// Body mirrors runReceipt deliberately — we keep the two implementations
// parallel so they are easy to compare against each other in code review,
// and so v1.0 work can lift the shared structure into a helper without
// touching the public surface of either subcommand.
func runDeletion(stdout, stderr io.Writer, path string) error {
	info, err := os.Stat(path)
	if err != nil {
		fmt.Fprintf(stderr, "error: cannot read deletion proof file: %v\n", err)
		return err
	}
	if info.IsDir() {
		err := fmt.Errorf("path is a directory, not a file: %s", path)
		fmt.Fprintf(stderr, "error: %v\n", err)
		return err
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		fmt.Fprintf(stderr, "error: cannot read deletion proof file: %v\n", err)
		return err
	}

	var probe struct {
		Schema  string `json:"schema"`
		Version int    `json:"version"`
		Kind    string `json:"kind"` // expected "deletion" in v1.0
	}
	schemaDetected := "unknown"
	if jsonErr := json.Unmarshal(raw, &probe); jsonErr == nil {
		if probe.Schema != "" || probe.Version != 0 || probe.Kind != "" {
			if probe.Version != 0 {
				schemaDetected = fmt.Sprintf("detected (version %d)", probe.Version)
			} else if probe.Kind != "" {
				schemaDetected = fmt.Sprintf("detected (kind=%s)", probe.Kind)
			} else {
				schemaDetected = fmt.Sprintf("detected (%s)", probe.Schema)
			}
		} else {
			schemaDetected = "detected (version 1)"
		}
	} else {
		schemaDetected = fmt.Sprintf("UNPARSEABLE (%v)", jsonErr)
	}

	writeDeletionSkeletonReport(stdout, path, schemaDetected)
	return nil
}

// writeDeletionSkeletonReport emits the v0.2.0 "not implemented yet"
// block for deletion proofs. Kept separate from the receipt counterpart
// because the wording references different docs (DELETION.md vs
// RECEIPTS.md) and a different invariant (non-existence, not just
// inclusion).
func writeDeletionSkeletonReport(w io.Writer, path, schemaDetected string) {
	fmt.Fprintln(w, "slothbox-verify deletion — v0.2.0 (skeleton)")
	fmt.Fprintln(w)
	fmt.Fprintf(w, "File: %s\n", path)
	fmt.Fprintf(w, "Schema: %s\n", schemaDetected)
	fmt.Fprintln(w, "Signature verification: NOT IMPLEMENTED in v0.2.0")
	fmt.Fprintln(w, "Merkle inclusion (tombstone) verification: NOT IMPLEMENTED in v0.2.0")
	fmt.Fprintln(w, "Merkle non-existence (post-deletion) verification: NOT IMPLEMENTED in v0.2.0")
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Full verification lands in v1.0. See:")
	fmt.Fprintf(w, "  %s/blob/master/MILESTONES.md\n", version.Homepage)
	fmt.Fprintf(w, "  %s/blob/master/docs/DELETION.md\n", version.Homepage)
	fmt.Fprintln(w)
	fmt.Fprintln(w, "Until v1.0 ships, this command does not produce a usable verification result.")
}
