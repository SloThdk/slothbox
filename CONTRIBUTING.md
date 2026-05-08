# Contributing to SlothBox

Thanks for considering a contribution. This is primarily a personal portfolio
project, so the process is lightweight, but a few rules are non-negotiable.

---

## Quick start

```bash
# Fork + clone
git clone https://github.com/<your-username>/slothbox.git
cd slothbox

# Install dependencies
pnpm install

# Set up local env
cp .env.example .env

# Bring up the infra
docker compose up -d postgres minio valkey nats

# Run migrations
pnpm db:migrate

# Start dev (frontend + gateway in parallel)
pnpm dev
```

Frontend on <http://localhost:3021>, gateway on <http://localhost:3022/healthz>.

---

## Before opening a PR

- [ ] **Discuss large changes in an issue first.** I don't want to ask you to
      throw away significant work because the design isn't a fit.
- [ ] `pnpm lint` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (including any new tests you add)
- [ ] `gitleaks detect --no-git --redact` is clean
- [ ] Commits are signed (`git commit -S`) — required by branch protection
- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org)
      (e.g. `feat(ingest): add chunked upload streaming`)

---

## Cryptographic code: special rules

Any PR that touches code under `packages/crypto-core/` or any code that handles:

- Encryption keys, salts, nonces, IVs
- Password hashing
- Random number generation
- Signature creation or verification
- Key derivation
- The URL fragment handling
- The encrypted payload format

is held to a higher bar.

### Hard rules

1. **No new cryptographic primitives.** This repo uses `libsodium-wrappers`
   (browser), `libsodium-net` (.NET), and `age` (asymmetric). PRs that
   introduce new ciphers, KDFs, MACs, or signature schemes will be
   **closed by the maintainer** during review unless the PR description
   references an audited reference implementation. CODEOWNERS routes any
   change under `packages/crypto-core/` to maintainer review.

2. **No "rolling your own".** If your PR contains a function that does
   key-stretching, signing, encrypting, or random-number generation that
   doesn't ultimately call into `libsodium` or `age`, it will be
   **closed by the maintainer** under the same review.

3. **Test vectors are mandatory.** Every cryptographic function must have:
   - Round-trip tests (encrypt → decrypt produces input)
   - Test vectors against known-good outputs (RFC test vectors where available)
   - Negative tests (tampered ciphertext fails AEAD verification)

4. **Constant-time operations only.** Comparisons of secret values must use
   `crypto.timingSafeEqual` (Node) or `sodium.memcmp` / `Sodium.compare` (.NET).
   Never `==` or `===`.

5. **Maintainer signoff required.** Two reviewers are encouraged, at least one
   with cryptographic background.

### Soft rules

- Document the _why_ in the PR description, not just the _what_. Cryptographic
  changes need their threat-model justification spelled out.
- Reference the audited reference implementation you're following.
- If the change affects the threat model, update [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md)
  in the same PR.

---

## Architecture decisions

If your change introduces a new service, switches a database engine, swaps a
runtime, or changes the deploy target, please open an **architecture decision
record (ADR)** in `docs/adr/NNNN-title.md` first. Use the template in
`docs/adr/_template.md`. We follow the
[Michael Nygard ADR format](https://github.com/joelparkerhenderson/architecture-decision-record).

This is to keep the rationale for changes traceable as the project ages.

---

## Code style

- **TypeScript:** Prettier + ESLint + Tailwind plugin. `pnpm format` runs both.
- **C#:** `dotnet format` (StyleCop conventions). 4-space indent. PascalCase types,
  camelCase locals.
- **Go:** `gofmt` + `goimports`. Standard Go style. Tabs, not spaces.
- **SQL:** lowercase keywords, snake_case identifiers, one statement per migration
  block.

Pre-commit hook runs the formatters. CI fails on diff.

---

## Filing issues

| Type                   | Use                                                                                                                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bug                    | Issue template `bug`                                                                                                                                                                      |
| Feature request        | Issue template `feature`                                                                                                                                                                  |
| Security vulnerability | **DO NOT** file an issue. Email <philipsloth1@gmail.com> or use the form at <https://philipsloth.com/contact> — see [`SECURITY.md`](SECURITY.md) for the disclosure SLA + PGP fingerprint |
| Question               | GitHub Discussions (when enabled)                                                                                                                                                         |

When filing a bug, please include:

- SlothBox version (commit SHA or tag)
- Browser + OS (for frontend) or Docker version (for backend)
- Steps to reproduce
- Expected vs actual behaviour
- Logs (`docker compose logs <service>`)

---

## Code of conduct

This project follows the [Contributor Covenant 2.1](CODE_OF_CONDUCT.md). Be
kind. Disagreements about technical decisions are fine. Disagreements about
people aren't.

---

## License

By submitting a PR, you agree that your contribution is licensed under the
[MIT License](LICENSE) of this repository. There's no CLA — submission =
agreement.

---

## Recognition

Anyone whose PR is merged, or whose vulnerability report leads to a fix, gets
listed in `CONTRIBUTORS.md` (with consent). For security reports, the standard
"Reported by \_\_\_" credit is in the release notes.
