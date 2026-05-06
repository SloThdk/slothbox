# Makefile for slothbox-verify (the standalone offline verifier CLI).
#
# Targets:
#   build          local build to ./bin/slothbox-verify
#   cross-compile  build for darwin/amd64+arm64, linux/amd64+arm64, windows/amd64
#   test           go test ./...
#   lint           golangci-lint run
#   clean          remove ./bin
#
# Notes:
#   - LDFLAGS strip the symbol table (-w -s) and bake in the version,
#     git SHA, and build date for `slothbox-verify --version`.
#   - -trimpath is mandatory: without it the binary embeds absolute
#     filesystem paths from Philip's machine, which (a) inflates size
#     past the 8MB target and (b) leaks the build environment.
#   - Cross-compile output lives in ./bin/<os>-<arch>/slothbox-verify[.exe].
#     The Homebrew / Scoop / Debian distribution stubs in dist/ point at
#     this layout.

# ---- variables ----------------------------------------------------------

BINARY      := slothbox-verify
PKG         := github.com/SloThdk/slothbox/tools/verify
VERSION_PKG := $(PKG)/internal/version

# Read version from internal/version/version.go (the var declaration).
# Falls back to "0.0.0-dev" if grep finds nothing (e.g. file moved).
VERSION  := $(shell grep -E '^var Version' internal/version/version.go | sed -E 's/.*"([^"]+)".*/\1/' 2>/dev/null || echo 0.0.0-dev)
GIT_SHA  := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILD_DT := $(shell date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)
GO_VER   := $(shell go version 2>/dev/null | awk '{print $$3}' || echo go1.22)

LDFLAGS := -w -s \
  -X '$(VERSION_PKG).Version=$(VERSION)' \
  -X '$(VERSION_PKG).GitSHA=$(GIT_SHA)' \
  -X '$(VERSION_PKG).BuildDate=$(BUILD_DT)' \
  -X '$(VERSION_PKG).GoVersion=$(GO_VER)'

GOFLAGS := -trimpath -ldflags "$(LDFLAGS)"

BIN_DIR := bin

# ---- phony targets ------------------------------------------------------

.PHONY: all build test lint clean cross-compile help

all: build

help:
	@echo "slothbox-verify Makefile targets:"
	@echo "  build          local build to ./$(BIN_DIR)/$(BINARY)"
	@echo "  cross-compile  build for darwin/amd64, darwin/arm64, linux/amd64, linux/arm64, windows/amd64"
	@echo "  test           go test ./..."
	@echo "  lint           golangci-lint run"
	@echo "  clean          remove ./$(BIN_DIR)"

build:
	@mkdir -p $(BIN_DIR)
	go build $(GOFLAGS) -o $(BIN_DIR)/$(BINARY) ./

test:
	go test ./...

lint:
	golangci-lint run

clean:
	rm -rf $(BIN_DIR)

# ---- cross-compile ------------------------------------------------------
#
# Each target writes to ./bin/<os>-<arch>/slothbox-verify[.exe] so that
# downstream packaging (Homebrew, Scoop, Debian, GoReleaser) can find the
# binaries at predictable paths.

CROSS_TARGETS := \
  darwin-amd64 \
  darwin-arm64 \
  linux-amd64 \
  linux-arm64 \
  windows-amd64

cross-compile: $(addprefix cross-,$(CROSS_TARGETS))

cross-darwin-amd64:
	@mkdir -p $(BIN_DIR)/darwin-amd64
	GOOS=darwin GOARCH=amd64 CGO_ENABLED=0 go build $(GOFLAGS) -o $(BIN_DIR)/darwin-amd64/$(BINARY) ./

cross-darwin-arm64:
	@mkdir -p $(BIN_DIR)/darwin-arm64
	GOOS=darwin GOARCH=arm64 CGO_ENABLED=0 go build $(GOFLAGS) -o $(BIN_DIR)/darwin-arm64/$(BINARY) ./

cross-linux-amd64:
	@mkdir -p $(BIN_DIR)/linux-amd64
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build $(GOFLAGS) -o $(BIN_DIR)/linux-amd64/$(BINARY) ./

cross-linux-arm64:
	@mkdir -p $(BIN_DIR)/linux-arm64
	GOOS=linux GOARCH=arm64 CGO_ENABLED=0 go build $(GOFLAGS) -o $(BIN_DIR)/linux-arm64/$(BINARY) ./

cross-windows-amd64:
	@mkdir -p $(BIN_DIR)/windows-amd64
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build $(GOFLAGS) -o $(BIN_DIR)/windows-amd64/$(BINARY).exe ./
