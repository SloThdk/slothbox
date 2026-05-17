// Package version exposes build-time version metadata for slothbox-verify.
//
// The values are set via -ldflags at build time:
//
//	go build -ldflags "-X github.com/SloThdk/slothbox/tools/verify/internal/version.Version=0.2.2
//	                   -X github.com/SloThdk/slothbox/tools/verify/internal/version.GitSHA=$(git rev-parse --short HEAD)
//	                   -X github.com/SloThdk/slothbox/tools/verify/internal/version.BuildDate=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
//
// If a build is produced without -ldflags (e.g. `go run .`), the defaults
// below are used so `--version` still produces meaningful output during
// development.
package version

// Version is the semver string for the binary. The v0.2.x line is the
// skeleton release; full verification primitives land in v1.0 alongside
// the external cryptographer review.
var Version = "0.2.2"

// GitSHA is the short commit hash the binary was built from. Empty in
// `go run` builds. Populated by Makefile / CI via -ldflags.
var GitSHA = ""

// BuildDate is the UTC RFC3339 timestamp of the build. Empty in `go run`
// builds. Populated by Makefile / CI via -ldflags.
var BuildDate = ""

// Homepage is the canonical project URL. Hardcoded because it should not
// drift across releases.
const Homepage = "https://github.com/SloThdk/slothbox"

// GoVersion is the Go toolchain target. Hardcoded for the v0.2 skeleton;
// in v1.0+ this is overridden via -ldflags from `go version` output.
var GoVersion = "go1.22"
