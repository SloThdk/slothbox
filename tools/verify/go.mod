// Module definition for the SlothBox standalone verifier CLI.
//
// This binary lets users independently verify SlothBox delivery receipts
// and verifiable deletion proofs WITHOUT contacting our servers. The
// existence of this tool is the strongest signal that SlothBox does not
// trust itself either: anyone can audit a receipt offline.
//
// v0.1.0-alpha is a SKELETON. The full RFC 3161 + Merkle proof verification
// primitives land in v1.0.

module github.com/SloThdk/slothbox/tools/verify

go 1.22

require github.com/spf13/cobra v1.8.1

require (
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/spf13/pflag v1.0.5 // indirect
)
