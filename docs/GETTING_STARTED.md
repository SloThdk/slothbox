# Getting Started

Steps to go from a fresh clone to running SlothBox locally.

## Prerequisites

| Tool           | Version | Why                                          |
| -------------- | ------- | -------------------------------------------- |
| Node.js        | 20.18+  | Frontend + API gateway                       |
| pnpm           | 9.12.3  | Workspace manager                            |
| .NET SDK       | 8.0.x   | Ingest + receipt services                    |
| Go             | 1.22+   | Reaper + verifier CLI                        |
| Docker         | 24+     | Postgres, MinIO, Valkey, NATS, observability |
| Docker Compose | v2      | Stack orchestration                          |
| `gitleaks`     | latest  | Secret scanning (pre-commit)                 |

On macOS:

```bash
brew install node@20 pnpm dotnet@8 go docker gitleaks
```

On Windows (with chocolatey):

```powershell
choco install nodejs-lts pnpm dotnet-8.0-sdk golang docker-desktop gitleaks
```

On Ubuntu/Debian:

```bash
# Node 20 + pnpm
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt install nodejs
npm install -g pnpm@9.12.3

# .NET 8
sudo apt install dotnet-sdk-8.0

# Go
sudo snap install go --classic

# Docker
sudo apt install docker-ce docker-compose-plugin

# Gitleaks
curl -fsSL https://github.com/gitleaks/gitleaks/releases/latest/download/gitleaks_8.21.0_linux_x64.tar.gz | tar xz
sudo mv gitleaks /usr/local/bin/
```

## First-time setup

```bash
git clone https://github.com/SloThdk/slothbox.git
cd slothbox

# Copy env template
cp .env.example .env
# Edit .env if you want non-default credentials. Defaults work for local dev.

# Install pnpm dependencies (root + all workspaces)
pnpm install

# Bring up the data + observability layer
docker compose up -d postgres minio valkey nats prometheus grafana loki promtail caddy

# Wait for Postgres to be healthy (a few seconds)
docker compose exec postgres pg_isready -U slothbox

# Run migrations
pnpm db:migrate
```

## Running the apps

### Option 1: full stack via Docker

```bash
docker compose up -d
```

13 services come up. Open <http://localhost:8080>. Caddy routes everything.

### Option 2: hot-reload dev (recommended for development)

```bash
# Terminal 1: backend infra (Postgres, MinIO, etc.)
docker compose up -d postgres minio valkey nats

# Terminal 2: frontend (Next.js dev server)
pnpm --filter @slothbox/web dev
# → http://localhost:3021

# Terminal 3: api-gateway (Node + Hono)
pnpm --filter @slothbox/api-gateway dev
# → http://localhost:3022

# Terminal 4: ingest service (.NET)
cd services/ingest && dotnet run
# → http://localhost:3023
```

Or on Windows just run `start_local_server.bat` to do all of the above.

## Verifying the install

```bash
# Health checks
curl http://localhost:3021/api/healthz   # frontend
curl http://localhost:3022/healthz       # api-gateway
curl http://localhost:3023/healthz       # ingest
curl http://localhost:3024/healthz       # receipt

# Or do all at once
./scripts/verify-stack.sh
```

## Running tests

```bash
# All tests across the workspace
pnpm test

# Just the crypto-core (fastest, most important)
pnpm --filter @slothbox/crypto-core test

# .NET services
cd services/ingest && dotnet test
cd services/receipt && dotnet test

# Go services
cd services/reaper && go test ./...
cd tools/verify && go test ./...
```

## Type-checking & linting

```bash
pnpm typecheck   # all TS workspaces
pnpm lint        # all TS workspaces
pnpm format      # auto-format (Prettier + Tailwind plugin)
pnpm format:check  # CI mode
```

## Resetting local DB

```bash
pnpm db:reset    # drops all SlothBox tables (dev only — refuses in prod)
pnpm db:migrate  # re-applies all migrations
```

## Clearing local volumes

```bash
docker compose down -v
docker volume rm slothbox_pg_data slothbox_minio_data slothbox_valkey_data slothbox_nats_data
```

## Common issues

**"docker compose up" hangs on `web`**
The first run builds the Next.js production image — takes 2-5 min. Subsequent runs reuse layers.

**Port conflicts**
Default ports: 3021 (web), 3022 (gateway), 3023 (ingest), 3024 (receipt), 5433 (postgres), 9000/9001 (minio), 6379 (valkey), 4222 (nats), 3030 (grafana), 9090 (prometheus), 8080 (caddy). Change in `.env` if needed.

**Postgres "database does not exist"**
Wait a few more seconds — Postgres init scripts run on first boot. Or check `docker compose logs postgres`.

**"libsodium-wrappers is not initialised"**
The `initCrypto()` function returned a rejected promise. Check browser console for the underlying error. Most often: the WASM module didn't load (CSP blocking, network issue).

## Where to go next

- See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for the system overview
- See [`docs/CRYPTO.md`](CRYPTO.md) for what's encrypted and how
- See [`docs/THREAT_MODEL.md`](THREAT_MODEL.md) for what we protect against
- See [`CONTRIBUTING.md`](../CONTRIBUTING.md) before opening a PR
- See [`docs/RUNBOOK.md`](RUNBOOK.md) for production operations
