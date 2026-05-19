#!/usr/bin/env bash
# ============================================================================
#  SlothBox - local dev launcher (macOS / Linux)
# ----------------------------------------------------------------------------
#  Mirrors start_local_server.bat (Windows) for cross-platform parity. The
#  flow is identical to the bat, minus the Sync.com auto-mirror step —
#  that's a Windows-only workaround for the Sync.com reparse-point flag
#  that breaks Docker BuildKit. macOS / Linux don't have that filesystem
#  attribute so Docker reads the project directly from the working copy.
#
#  Steps (mirrors bat 1-5):
#    1. Free dev ports if previous run left them occupied
#    2. docker compose up -d --build  (rebuilds changed images)
#    3. Wait for Postgres + ingest health
#    4. Apply idempotent SQL migrations via `docker compose exec postgres psql`
#    5. Open browser to http://localhost (Caddy-fronted prod-shape URL)
#       then run `pnpm --filter @slothbox/web run dev` in foreground so
#       Ctrl+C tears down cleanly.
#
#  Prereqs:
#    - Docker Desktop (or Docker Engine + compose plugin) running
#    - Node 18.18+ and pnpm (install via `corepack enable pnpm` or
#      `npm install -g pnpm`)
#
#  Usage:
#    chmod +x start_local_server.sh && ./start_local_server.sh
# ============================================================================

set -euo pipefail

FRONTEND_PORT=3021
GATEWAY_PORT=3022
INGEST_PORT=3023
RECEIPT_PORT=3024
DASHBOARD_URL="http://localhost"

# Set CWD to script folder regardless of how it was invoked.
cd "$(dirname "$0")"

# Helper: portable "is X command on PATH" check.
have() { command -v "$1" >/dev/null 2>&1; }

# Helper: kill any process listening on $1, silent.
kill_port() {
    local port=$1
    if have lsof; then
        local pids
        pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
        if [ -n "$pids" ]; then
            # shellcheck disable=SC2086
            kill -9 $pids 2>/dev/null || true
        fi
    elif have fuser; then
        fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    fi
}

# Helper: open URL in default browser (macOS / Linux / WSL).
open_browser() {
    local url=$1
    if have open; then
        open "$url" 2>/dev/null || true
    elif have xdg-open; then
        xdg-open "$url" >/dev/null 2>&1 &
    elif have cmd.exe; then
        cmd.exe /c start "" "$url" >/dev/null 2>&1 || true
    else
        echo "  Open $url in your browser."
    fi
}

# Pre-flight checks. Fail loud on missing prereqs so the user can fix
# before the docker stack confuses them.
echo "============================================================================"
echo " SlothBox local dev - macOS / Linux"
echo "============================================================================"

if ! have docker; then
    echo "[ERROR] docker not found in PATH."
    echo "  Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    echo "  (or Docker Engine + compose plugin on Linux)"
    exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
    echo "[ERROR] 'docker compose' subcommand missing."
    echo "  Update Docker to a version with the compose plugin (v2.0+, ships with Desktop)."
    exit 1
fi
if ! have node; then
    echo "[ERROR] node not found in PATH."
    echo "  Install Node 18.18 or newer from https://nodejs.org"
    exit 1
fi
if ! have pnpm; then
    echo "[ERROR] pnpm not found in PATH."
    echo "  Install via: corepack enable pnpm"
    echo "  Or:          npm install -g pnpm"
    exit 1
fi

# Node version >= 18 (slothbox uses Next.js features that need it).
if ! node -e "process.exit(parseInt(process.versions.node.split('.')[0]) >= 18 ? 0 : 1)" 2>/dev/null; then
    echo "[ERROR] Node.js version is too old ($(node --version))."
    echo "  Need 18.18+. Upgrade from https://nodejs.org or via nvm:"
    echo "    nvm install 20 && nvm use 20"
    exit 1
fi

# Docker daemon reachable check. `docker info` returns non-zero if the
# socket is unreachable (Docker Desktop not running, daemon down, etc.).
# Save the user from a confusing "compose up" failure deep in step 2.
if ! docker info >/dev/null 2>&1; then
    echo "[ERROR] Docker daemon not reachable."
    echo "  Start Docker Desktop (or run 'systemctl start docker' on Linux)."
    exit 1
fi

# If node_modules is missing run pnpm install for the host-side hot-reload
# pnpm dev command (step 5). The containers do their own install inside.
if [ ! -d "node_modules" ]; then
    echo "[setup] node_modules missing - running pnpm install for host-side dev tooling..."
    if ! pnpm install; then
        echo "[ERROR] pnpm install failed."
        echo "  Common fixes: no internet / behind proxy / corepack pnpm version mismatch."
        exit 1
    fi
fi

# Auto-copy .env.example to .env if .env is missing. Note: .env is in
# .gitignore (verified) and never committed to git history. Your local
# .env stays on YOUR machine; nothing leaks upstream.
if [ ! -f ".env" ] && [ -f ".env.example" ]; then
    echo "[setup] .env not found - copying .env.example to .env..."
    cp ".env.example" ".env"
    echo "[setup] Created .env from the example template."
fi

# Credential-doctor: scan .env for CHANGE_ME_* placeholders and report
# what needs real values. Works for local dev with placeholders, but
# production-grade features (sign / encrypt / persist real shares
# without password-flips) need real values.
print_credential_status() {
    [ -f ".env" ] || return 0
    # Each tuple: VAR_NAME | what it's for | how to generate
    # Plain string, separated by | for parsing — keep CHANGE_ME-suffix
    # tolerant via grep "^VAR=CHANGE_ME".
    local checks=(
        "INTERNAL_TOKEN|service-to-service auth for reaper DELETE /chunk/*|openssl rand -hex 32"
        "POSTGRES_PASSWORD|Postgres database password|openssl rand -hex 24"
        "MINIO_SECRET_KEY|MinIO (S3-compatible) object storage secret|openssl rand -hex 24"
        "AUTH_SECRET|Lucia session signing key|openssl rand -hex 32"
    )
    local placeholders=()
    for line in "${checks[@]}"; do
        IFS='|' read -r var purpose howto <<<"$line"
        local val
        val=$(grep -E "^${var}=" .env | head -1 | cut -d= -f2- || true)
        if [[ "$val" == CHANGE_ME* ]] || [ -z "$val" ]; then
            placeholders+=("$var|$purpose|$howto")
        fi
    done
    if [ ${#placeholders[@]} -gt 0 ]; then
        echo
        echo "  ⚠️  Your .env has placeholder values for ${#placeholders[@]} secret(s)."
        echo "      Local dev works with these. PRODUCTION needs real values:"
        echo
        for p in "${placeholders[@]}"; do
            IFS='|' read -r var purpose howto <<<"$p"
            printf "        %-22s  %s\n" "$var" "$purpose"
            printf "        %-22s  generate: %s\n" "" "$howto"
        done
        echo
        echo "      See docs/CREDENTIALS.md for the full setup guide."
    fi
}

print_credential_status

echo
echo "[1/5] Killing any process on dev ports ($FRONTEND_PORT, $GATEWAY_PORT, $INGEST_PORT, $RECEIPT_PORT)..."
for port in "$FRONTEND_PORT" "$GATEWAY_PORT" "$INGEST_PORT" "$RECEIPT_PORT"; do
    kill_port "$port"
done

echo "[2/5] Building + starting full Docker Compose stack..."
echo "      (--build picks up source changes; near-instant on cache hit.)"
if ! docker compose up -d --build; then
    echo
    echo "  ERROR: docker compose up failed."
    echo "  Try: docker compose logs --tail 40 ingest"
    echo "  Or:  docker compose logs --tail 40 web"
    exit 1
fi

echo "[3/5] Waiting for Postgres..."
postgres_tries=0
until docker compose exec -T postgres pg_isready -U slothbox >/dev/null 2>&1; do
    postgres_tries=$((postgres_tries + 1))
    if [ "$postgres_tries" -ge 30 ]; then
        echo "      WARNING: Postgres still not ready after 60s."
        echo "      Check: docker compose logs --tail 40 postgres"
        break
    fi
    sleep 2
done
echo "      Postgres is ready."

echo "      Waiting for ingest healthcheck (.NET cold start ~10-20s)..."
ingest_tries=0
while ! docker compose exec -T ingest wget -qO- "http://localhost:${INGEST_PORT}/healthz" >/dev/null 2>&1; do
    ingest_tries=$((ingest_tries + 1))
    if [ "$ingest_tries" -ge 30 ]; then
        echo "      WARNING: ingest still unhealthy after 60s. Continuing anyway."
        echo "      Check: docker compose logs --tail 40 ingest"
        break
    fi
    sleep 2
done
echo "      Ingest is ready."

echo "[4/5] Running database migrations (idempotent)..."
# Same psql-pipe pattern as the bat. DATABASE_URL on the host points at
# the docker-internal hostname `postgres:5432` which doesn't resolve from
# the host shell, so we exec inside the postgres container.
if [ -d "db/migrations" ]; then
    shopt -s nullglob
    for mig in db/migrations/*.sql; do
        name=$(basename "$mig")
        if docker compose exec -T postgres psql -U slothbox -d slothbox -v ON_ERROR_STOP=1 -f - <"$mig" >/dev/null 2>&1; then
            echo "      applied $name"
        else
            echo "      WARNING: $name did not apply cleanly. Run manually if needed:"
            echo "        docker compose exec -T postgres psql -U slothbox -d slothbox -f - < $mig"
        fi
    done
fi

echo "[5/5] Starting Next.js dev hot-reload (foreground) on :$FRONTEND_PORT..."
echo
echo "============================================================================"
echo " Stack URLs"
echo "----------------------------------------------------------------------------"
echo "   >>> http://localhost                <<< primary - prod-shape via Caddy"
echo "   API gateway:     proxied at /api/*                      (internal :$GATEWAY_PORT)"
echo "   Ingest service:  proxied at /chunk/*                    (internal :$INGEST_PORT)"
echo "   Receipt service: proxied at /receipt/*                  (internal :$RECEIPT_PORT)"
echo "   Frontend HMR:    http://localhost:$FRONTEND_PORT       (hot reload, ~60s to compile)"
echo "   MinIO console:   http://localhost:9001                  (slothbox-local / see .env)"
echo "   Grafana:         http://localhost:3030                  (admin / admin)"
echo "   Prometheus:      http://localhost:9090"
echo "   Live production: https://slothbox.philipsloth.com"
echo "============================================================================"
echo
echo "  Tip: Ctrl+C stops the host-side Next dev server."
echo "       Docker stack keeps running - use 'docker compose down' to tear it down."
echo

# Open browser to the prod-shape URL after 3s grace (Caddy + web are
# healthy by now via depends_on gates; 3s is just polite UX). Run in
# the background so the script doesn't block before pnpm dev starts.
(sleep 3 && open_browser "$DASHBOARD_URL") &

# Trap Ctrl+C so the foreground pnpm dev child is killed cleanly.
trap 'kill $(jobs -p) 2>/dev/null || true; exit 0' INT TERM

# Run frontend in foreground - Ctrl+C lands here.
pnpm --filter @slothbox/web run dev
