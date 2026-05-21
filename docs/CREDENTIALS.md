# Credentials & Secrets

This file documents every secret in `.env.example` — what it does, where
to get the real value, and which features it gates.

`.env` is in `.gitignore` and **never** committed. Your real values stay
on your machine. The repo only tracks `.env.example` (placeholder
template). Anyone cloning this repo gets the template, not your
credentials.

## Quick start (local dev)

The `start_local_server.{sh,bat}` script auto-copies `.env.example` to
`.env` on first run. The placeholder values are enough to spin up the
full Docker stack and click around the UI. You only need to replace
placeholders when you want to ship to production or test features that
hit external services.

After the script copies the template, it prints a `⚠️ placeholder
values` warning listing which secrets still need real values. Replace
them in `.env` and re-run the script.

## Secret catalogue

### Required for any deployment (placeholder breaks production)

| Variable            | Purpose                                                                                                                                                                      | How to generate / where to get                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `INTERNAL_TOKEN`    | Service-to-service shared secret for reaper's `DELETE /chunk/*` calls into ingest. Without a real value, leaked URLs could be replayed against the reaper endpoint.          | `openssl rand -hex 32`                               |
| `POSTGRES_PASSWORD` | Postgres `slothbox` user password. Used by every service that touches the DB. The example value `CHANGE_ME_LOCAL_DEV_ONLY` is intentionally insecure to force you to rotate. | `openssl rand -hex 24`                               |
| `MINIO_SECRET_KEY`  | MinIO (S3-compatible) blob storage credential. Encrypted chunks live here; the secret key gates access.                                                                      | `openssl rand -hex 24` (≥ 8 chars required by MinIO) |
| `AUTH_SECRET`       | Lucia auth session-cookie signing key. Required when v0.5+ session auth ships. Until then it's unused but should be set for forward-compat.                                  | `openssl rand -hex 32`                               |

After updating any of these, **also update `DATABASE_URL`** if you
changed `POSTGRES_PASSWORD` — the URL embeds the password inline.

### Optional (feature-flag gated, safe to leave default)

| Variable                            | Default | Why you might change it                                                                      |
| ----------------------------------- | ------- | -------------------------------------------------------------------------------------------- |
| `GRAFANA_ADMIN_PASSWORD`            | `admin` | Grafana dashboard login. Local dev fine with `admin`.                                        |
| `VALKEY_PASSWORD`                   | empty   | Redis-fork password. Empty is fine for local dev (no external access). Set in production.    |
| `FEATURE_BURN_AFTER_READ`           | `true`  | Toggle burn-after-read feature.                                                              |
| `FEATURE_MITID_AUTH`                | `false` | Enables MitID authentication route. Needs MitID broker credentials (see below) if turned on. |
| `FEATURE_PASSWORD_PROTECTED_SHARES` | `true`  | Per-share password gating in addition to URL fragment.                                       |
| `FEATURE_PER_RECIPIENT_ENCRYPTION`  | `false` | Per-recipient key wrap (v1.0+ roadmap).                                                      |
| `RATE_LIMIT_ANONYMOUS_PER_MINUTE`   | `10`    | Anonymous-user rate limit.                                                                   |
| `RATE_LIMIT_ANONYMOUS_PER_DAY`      | `100`   | Daily rate limit.                                                                            |
| `RATE_LIMIT_AUTHED_PER_MINUTE`      | `60`    | Logged-in user rate limit.                                                                   |
| `SHARE_MAX_DOWNLOADS`               | `100`   | Hard cap on per-share download count.                                                        |

### Production-only (defaults work locally but need real values to deploy)

If you fork this repo and want to deploy your own SlothBox instance,
you'll need to provision your own infrastructure for:

- **Domain + TLS**: Caddy auto-fetches Let's Encrypt certs when the
  Caddyfile points to a real domain. Local dev uses `localhost`.
- **MinIO**: production needs a real S3-compatible store (AWS S3,
  Backblaze B2, Hetzner Object Storage, or self-hosted MinIO with
  proper auth).
- **Postgres**: production needs managed Postgres (Hetzner, Neon, Crunchy
  Bridge) or self-hosted with proper backup. Local dev runs in the
  Docker container.
- **Monitoring**: Grafana / Prometheus / Loki credentials should be
  rotated. Default `admin` is local-dev only.

## Why placeholders, not real secrets?

`.env.example` is committed to git so anyone cloning the repo can see
what variables exist. If real secrets lived there, they'd leak the
moment someone pushed the repo public.

The `CHANGE_ME_*` prefix on placeholder values serves two purposes:

1. The local dev stack runs without complaint (the value is non-empty,
   so Docker compose doesn't bail).
2. The `start_local_server.sh` credential-doctor scans for this prefix
   and warns you on every run. You can't accidentally ship to production
   with placeholder secrets — the script reminds you on every start.

## Reporting a leak

If you find a real secret accidentally committed to the public history
of this repo, email `philipsloth1@gmail.com` immediately. Don't open a
public issue (that defeats the purpose). Standard responsible-disclosure
guidelines apply: report in private, give time to rotate before any
public mention.

See [`SECURITY.md`](../SECURITY.md) for the full threat model and the
broader disclosure policy.
