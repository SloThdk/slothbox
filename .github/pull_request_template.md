<!--
Thanks for the PR! A few quick checks before submission:

- [ ] Discussed in an issue first (if non-trivial)
- [ ] Conventional commit title (e.g. `feat(ingest): add chunked upload`)
- [ ] Commits are signed (`git commit -S`)
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all pass
- [ ] `gitleaks detect --no-git --redact` is clean

If your PR touches `packages/crypto-core/` or any other cryptographic code, please
also confirm:

- [ ] No new primitives introduced (we use libsodium and age only)
- [ ] No "rolling your own" — every operation calls into the audited library
- [ ] Test vectors added or updated
- [ ] `THREAT_MODEL.md` updated if the change affects the threat model
-->

## What this PR does

<!-- One paragraph. What's changing and why. -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor / cleanup
- [ ] Docs only
- [ ] CI / build only
- [ ] Cryptographic code (requires extra review)

## Test plan

<!-- How did you verify this works? -->

## Threat model impact

<!-- Required for crypto / auth / RLS changes. Otherwise: "n/a". -->

## Related issues

<!-- e.g. Closes #123 -->
