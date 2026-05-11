# SlothBox Milestones

The phased plan from scaffold to externally-reviewed v1.0.

---

## v0.1.0-alpha — "Symmetric MVP"

**Status:** shipped 2026-05-07
**Goal:** the core encrypted-transfer flow works end-to-end locally.

| Area         | Scope                                                                 |
| ------------ | --------------------------------------------------------------------- |
| Frontend     | Drag-drop upload, progress UI, share-link generation, decryption page |
| Crypto       | XChaCha20-Poly1305 symmetric encryption in browser via libsodium      |
| Key handling | Key in URL fragment (never sent to server)                            |
| API gateway  | `POST /shares`, `GET /shares/:id`, WebSocket progress                 |
| Ingest       | Chunked upload to MinIO via .NET service                              |
| Storage      | MinIO self-hosted bucket                                              |
| Reaper       | Expiry sweep daemon (Go)                                              |
| Auth         | None (anonymous shares only)                                          |
| Receipts     | Out of scope                                                          |
| Docs         | Full README, SECURITY, ARCHITECTURE, CRYPTO, THREAT_MODEL             |
| CI           | typecheck + lint + test + gitleaks + npm audit on every push          |
| Deploy       | Docker Compose works locally; production deploy script                |

**Exit criteria:**

- `docker compose up -d` brings up all services
- Drag a file at <http://localhost:3021>, get a share link, open in another browser, file downloads decrypted
- All security gates green in CI
- README + SECURITY published

---

## v0.2.0-alpha — "URL-leak hardening" ✅ shipped 2026-05-11

**Status:** released
**Goal:** close both v0.1 WARNING-block gaps that did not require a full auth system.

| Area        | Scope                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------- |
| Crypto      | Per-share password protection — Argon2id + BLAKE2b-keyed combiner (sender-opt-in)           |
| Crypto      | Single-use chunk tokens — SHA-256 commitment, derived from URL fragment, enforced by ingest |
| Lifecycle   | Sender-revoke tokens — 32-byte capability, localStorage-only, gates POST /destroy           |
| Web         | `/my-shares` sender dashboard — device-local list with revoke + remove-local actions        |
| Crypto-core | Move from libsodium-wrappers (slim) to libsodium-wrappers-sumo for Argon2id                 |
| Tests       | 57/57 crypto-core tests green, typecheck clean across all four TS packages                  |

**Exit criteria — all met:**

- v0.1 WARNING block shrunk from three paragraphs to one (external audit remains a v1.0 gate)
- No behaviour change for legacy v0.1 shares (NULL hash columns → v0.1 semantics)
- Web typecheck + crypto-core test suite + dotnet build all clean

---

## v0.5.0 — "Accounts and Receipts"

**Goal:** Accounts let you see history. Receipts make delivery provable.

| Area          | Scope                                                                     |
| ------------- | ------------------------------------------------------------------------- |
| Auth          | Lucia v3 + Argon2id, magic-link primary, optional password                |
| Dashboard     | Share history, manual revoke, per-share stats                             |
| Receipts      | RFC 3161 timestamped receipt over file hash on download                   |
| Audit chain   | Append-only log with hash-chain integrity                                 |
| Docs          | RECEIPTS.md, full RUNBOOK.md, deployment guide                            |
| Observability | Grafana dashboards for upload throughput, share lifetime, receipt latency |
| Stripe        | Free vs Pro tiers (paid = bigger files, longer expiry, audit export)      |

**Exit criteria:**

- Sign up, upload, download → receipt appears in dashboard
- Receipt verifiable via the standalone CLI (skeleton from v0.1)
- Stripe webhook lands a paid plan correctly

---

## v1.0.0 — "Audited and Asymmetric"

**Goal:** This is what production-grade users can rely on.

| Area                     | Scope                                                                            |
| ------------------------ | -------------------------------------------------------------------------------- |
| Per-recipient encryption | `age` sealed-boxes — file encrypted to recipient's public key, not just URL key  |
| Verifier CLI             | Full offline verification of receipts and deletion proofs (brew/scoop/apt)       |
| Verifiable deletion      | Hash chain of destroyed encryption keys, anchored to a public read-only endpoint |
| External audit           | Independent cryptographer review published under `/audits/`                      |
| Pen test                 | Third-party application pen test                                                 |
| Bug bounty               | Public program (low budget, scope-limited)                                       |

**Exit criteria:**

- Audit report published, all critical and high findings fixed
- Pen test report published, all critical and high findings fixed
- Verifier CLI works against the live service
- Recipient can decrypt without ever knowing the URL fragment

---

## v1.1.0 — "P2P and Verified Senders"

**Goal:** Last-mile features — peer-to-peer paths, verified-sender identity, deferred unlock semantics.

| Area               | Scope                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------ |
| WebRTC P2P         | Browser-to-browser file transfer when both endpoints online (server only relays signaling) |
| MitID OIDC         | Danish digital ID for verified-sender identity attached to receipts                        |
| Time-locked shares | Files unlock at a specific future date or after a heartbeat lapse                          |
| Audit export       | CSV / JSON export of share history with multi-year retention semantics                     |

---

## Beyond v1.1

- Native desktop app (Tauri or .NET MAUI tray client)
- Browser extension (right-click any file → encrypted share link)
- Organization plans with role-based access
- Optional encrypted forum / async secure messaging

These are speculative and depend on actual user feedback after v1.0 launch.
