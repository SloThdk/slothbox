// Package main is the entry point for the slothbox-verify CLI.
//
// All real work lives in the cmd package. main only:
//  1. Hands control to the cobra root command.
//  2. Translates a non-nil error from cobra into a non-zero exit code.
//
// Exit code conventions for slothbox-verify (will be honoured strictly
// from v1.0 onwards; the v0.2.x skeleton always returns 0 on success
// and 2 on user-facing errors):
//
//	0 = success / verified-valid (or skeleton ok)
//	1 = verification failed (signature mismatch, proof invalid, anchor missing)
//	2 = usage / I/O / parse error
//
// Keep this file deliberately tiny. If you find yourself adding logic here,
// it almost certainly belongs in cmd/ instead.
package main

import (
	"os"

	"github.com/SloThdk/slothbox/tools/verify/cmd"
)

func main() {
	// cmd.Execute prints its own user-facing errors via cobra; we only need
	// to forward the exit code. cobra returns nil on success and a non-nil
	// error on usage/runtime failure.
	if err := cmd.Execute(); err != nil {
		// User-facing error message is already printed to stderr by cobra
		// (SilenceErrors is false in cmd/root.go). Nothing more to do here.
		os.Exit(2)
	}
}
