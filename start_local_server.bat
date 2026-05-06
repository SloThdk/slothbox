@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM  SlothBox — local dev launcher
REM ----------------------------------------------------------------------------
REM  This is Tier 2 from LESSONS.md (full-stack with DB + multi-service):
REM    1. Free the dev port if a previous run left it occupied
REM    2. docker compose up -d (Postgres, MinIO, Valkey, NATS, Caddy, observability)
REM    3. Run idempotent migrations
REM    4. Start Next.js frontend in dev mode (hot reload)
REM    5. Open browser when /healthz responds 200
REM ============================================================================

set FRONTEND_PORT=3021
set GATEWAY_PORT=3022
set INGEST_PORT=3023
set RECEIPT_PORT=3024
set DASHBOARD_URL=http://localhost:%FRONTEND_PORT%

cd /d "%~dp0"

echo ============================================================================
echo  SlothBox local dev — booting up
echo ============================================================================
echo.
echo [1/5] Killing any process on dev ports (%FRONTEND_PORT%, %GATEWAY_PORT%, %INGEST_PORT%) ...
for %%P in (%FRONTEND_PORT% %GATEWAY_PORT% %INGEST_PORT% %RECEIPT_PORT%) do (
    for /f "tokens=5" %%i in ('netstat -aon ^| findstr ":%%P "') do (
        taskkill /F /PID %%i >nul 2>&1
    )
)

echo [2/5] Starting Docker Compose stack (Postgres + MinIO + Valkey + NATS + observability) ...
docker compose up -d postgres minio valkey nats prometheus grafana loki promtail caddy
if errorlevel 1 (
    echo.
    echo  ERROR: docker compose up failed. Is Docker Desktop running?
    echo.
    pause
    exit /b 1
)

echo [3/5] Waiting for Postgres to become healthy ...
:waitpg
docker compose exec -T postgres pg_isready -U slothbox >nul 2>&1
if errorlevel 1 (
    timeout /t 2 /nobreak >nul
    goto waitpg
)
echo       Postgres is ready.

echo [4/5] Running database migrations (idempotent) ...
call pnpm db:migrate
if errorlevel 1 (
    echo.
    echo  WARNING: migrations failed. Check db/migrations/ and DATABASE_URL.
    echo.
)

echo [5/5] Starting Next.js dev server on http://localhost:%FRONTEND_PORT% ...
echo.
echo ============================================================================
echo  Stack URLs
echo ----------------------------------------------------------------------------
echo   Frontend:        http://localhost:%FRONTEND_PORT%
echo   API gateway:     http://localhost:%GATEWAY_PORT%/healthz
echo   Ingest service:  http://localhost:%INGEST_PORT%/healthz
echo   Receipt service: http://localhost:%RECEIPT_PORT%/healthz
echo   MinIO console:   http://localhost:9001  (slothbox-local / see .env)
echo   Grafana:         http://localhost:3030  (admin / admin)
echo   Prometheus:      http://localhost:9090
echo ============================================================================
echo.

REM Browser opens after Next.js compiles (Next prints "Ready" first run)
start "" /min cmd /c "timeout /t 12 /nobreak >nul & start %DASHBOARD_URL%"

REM Run the frontend in the foreground so Ctrl+C cleans up
call pnpm --filter @slothbox/web run dev

endlocal
