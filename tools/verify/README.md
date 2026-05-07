# slothbox-verify

`slothbox-verify` is the standalone, offline verifier CLI for
[SlothBox](https://github.com/SloThdk/slothbox) — a public-source
end-to-end encrypted file transfer service.

The tool lets anyone — sender, recipient, auditor, regulator, or
hostile observer — independently confirm SlothBox's claims about
**delivery receipts** and **verifiable deletion proofs** without
contacting any SlothBox server. If we ever lie about a delivery or a
deletion, this binary will catch it.

> **Status: v0.1.0-alpha (SKELETON).**
> The command structure, distribution path, and packaging story are in
> place. The actual verification primitives (RFC 3161 signature
> validation, Merkle inclusion proofs, append-only consistency proofs)
> land in **v1.0**. Until then the subcommands print a clear "not
> implemented yet" message and link back to the relevant docs.

---

## Why a separate binary?

The SlothBox web app, mobile app, and server can all be compromised in
principle. The verifier is shipped as an independent, source-available
Go binary so that:

1. You compile it yourself (or trust a single, signed release artifact).
2. It links to nothing SlothBox-controlled at runtime — only stdlib +
   [`spf13/cobra`](https://github.com/spf13/cobra) + the public
   transparency-log URL you point it at.
3. A reproducible build can be diffed against the official release.

The mere existence of this tool is the strongest claim SlothBox makes:
**we don't trust ourselves either, and neither should you.**

---

## Installation

> v0.1.0-alpha is **not yet published** to any package registry. Build
> from source for now. Distribution wiring (Homebrew tap, Scoop bucket,
> Debian repo) lands alongside v1.0 — the templates are in
> [`dist/`](./dist) for review.

### Build from source

Requirements: Go 1.22 or newer.

```bash
git clone https://github.com/SloThdk/slothbox.git
cd slothbox/tools/verify
make build
./bin/slothbox-verify --version
```

### Future: macOS / Linux (Homebrew)

```bash
brew tap philipsloth/tap
brew install slothbox-verify
```

### Future: Windows (Scoop)

```powershell
scoop bucket add philipsloth https://github.com/SloThdk/scoop-bucket
scoop install slothbox-verify
```

### Future: Debian / Ubuntu (apt)

```bash
curl -fsSL https://philipsloth.com/apt/pubkey.gpg | sudo gpg --dearmor -o /usr/share/keyrings/philipsloth.gpg
echo "deb [signed-by=/usr/share/keyrings/philipsloth.gpg] https://philipsloth.com/apt stable main" | sudo tee /etc/apt/sources.list.d/philipsloth.list
sudo apt update
sudo apt install slothbox-verify
```

---

## Usage

```
slothbox-verify [flags] <command> [args]

Commands:
  receipt   <path>   Verify a delivery receipt JSON file (offline)
  deletion  <path>   Verify a verifiable deletion proof JSON file (offline)
  chain     <url>    Fetch and verify a published Merkle root anchor (v1.0+)
  help               Help about any command

Global flags:
  -v, --version   Print version information and exit
      --json      Emit machine-readable JSON instead of human-facing text
  -q, --quiet     Suppress non-essential output (reserved for v1.0)
  -h, --help      Show help for any command
```

### Example: verify a delivery receipt

```bash
slothbox-verify receipt ./my-receipt.json
```

In v1.0:

```
slothbox-verify receipt — v1.0.0

File: my-receipt.json
Schema: v1
Transfer ID: 9b7c...e2d1
Timestamp: 2026-08-14T09:31:42Z (RFC 3161, signed by SlothBox TSA: OK)
Merkle inclusion: epoch 4172, leaf #2891 → root 6a93...c4f0 (OK)
Anchor cross-check: matches https://anchors.slothbox.com/4172.json (OK)

Verdict: VALID
```

In v0.1.0-alpha:

```
slothbox-verify receipt — v0.1.0-alpha (skeleton)

File: my-receipt.json
Schema: detected (version 1)
Signature verification: NOT IMPLEMENTED in v0.1.0-alpha
Merkle proof verification: NOT IMPLEMENTED in v0.1.0-alpha

Full verification lands in v1.0. See:
  https://github.com/SloThdk/slothbox/blob/master/MILESTONES.md
  https://github.com/SloThdk/slothbox/blob/master/docs/RECEIPTS.md

Until v1.0 ships, this command does not produce a usable verification result.
```

### Example: verify a deletion proof

```bash
slothbox-verify deletion ./my-deletion-proof.json
```

### Example: pin and verify a Merkle root anchor

```bash
slothbox-verify chain https://anchors.slothbox.com/4172.json
```

---

## Exit codes

| Code | Meaning                                                            |
| ---- | ------------------------------------------------------------------ |
| 0    | Success / verified-valid (in v0.1, all skeleton runs return 0)     |
| 1    | Verification failed: signature mismatch, proof invalid, or missing |
| 2    | Usage / I/O / parse error                                          |

The strict `0/1/2` contract is honoured from **v1.0** onwards. The
v0.1.0-alpha skeleton always returns 0 on a successful skeleton run and
2 on user-facing errors (missing file, malformed URL, etc.).

---

## Build & release

```bash
make build           # local build → ./bin/slothbox-verify
make cross-compile   # darwin / linux / windows binaries → ./bin/<os>-<arch>/
make test            # go test ./...
make lint            # golangci-lint run
make clean           # rm -rf ./bin
```

Binary size target: **< 8 MB** after `go build -ldflags='-w -s' -trimpath`.

---

## See also

- [`MILESTONES.md`](../../MILESTONES.md) — the v0.1 → v1.0 → v2.0 roadmap.
- [`docs/RECEIPTS.md`](../../docs/RECEIPTS.md) — receipt JSON schema & verification algorithm.
- [`docs/DELETION.md`](../../docs/DELETION.md) — deletion-proof schema & verification algorithm.
- [`SECURITY.md`](../../SECURITY.md) — vulnerability disclosure & threat model.

---

## License

See [`LICENSE`](../../LICENSE) at the repository root.
