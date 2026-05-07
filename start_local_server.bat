@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM  SlothBox - local dev launcher
REM ----------------------------------------------------------------------------
REM  Tier 2 from LESSONS.md (full-stack with DB + multi-service).
REM    1. Free the dev port if a previous run left it occupied
REM    2. docker compose up -d --build (rebuilds ANY changed image so source
REM       changes propagate without manual `docker compose build`. Cache hits
REM       are near-instant when nothing changed.)
REM    3. Wait for Postgres + ingest healthy, then run idempotent migrations
REM    4. Start Next.js frontend in dev mode (hot reload, bypasses dockerised
REM       `web` container which only listens internally for the Caddy proxy)
REM    5. Open browser when /healthz responds 200
REM ============================================================================

set FRONTEND_PORT=3021
set GATEWAY_PORT=3022
set INGEST_PORT=3023
set RECEIPT_PORT=3024
set DASHBOARD_URL=http://localhost:%FRONTEND_PORT%

cd /d "%~dp0"

echo ============================================================================
echo  SlothBox local dev - booting up
echo ============================================================================
echo.
echo [1/5] Killing any process on dev ports (%FRONTEND_PORT%, %GATEWAY_PORT%, %INGEST_PORT%, %RECEIPT_PORT%) ...
for %%P in (%FRONTEND_PORT% %GATEWAY_PORT% %INGEST_PORT% %RECEIPT_PORT%) do (
    for /f "tokens=5" %%i in ('netstat -aon ^| findstr ":%%P "') do (
        taskkill /F /PID %%i >nul 2>&1
    )
)

echo [2/5] Building + starting full Docker Compose stack ...
echo       (--build picks up source changes since last run; near-instant on cache hit.)
docker compose up -d --build
if errorlevel 1 (
    echo.
    echo  ERROR: docker compose up failed. Is Docker Desktop running?
    echo  Try: docker compose logs --tail 40 ingest    (or whichever container failed^)
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

echo       Waiting for ingest healthcheck (.NET cold start ~10-20s) ...
set /a INGEST_TRIES=0
:waitingest
docker compose exec -T ingest wget -qO- http://localhost:3023/healthz >nul 2>&1
if errorlevel 1 (
    set /a INGEST_TRIES+=1
    if !INGEST_TRIES! GEQ 30 (
        echo       WARNING: ingest still unhealthy after 60s. Continuing anyway.
        echo       Check: docker compose logs --tail 40 ingest
        goto skipingest
    )
    timeout /t 2 /nobreak >nul
    goto waitingest
)
echo       Ingest is ready.
:skipingest

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
echo   Frontend (dev):  http://localhost:%FRONTEND_PORT%       (hot reload via pnpm dev^)
echo   Caddy + full:    http://localhost                       (production-shape proxy^)
echo   API gateway:     proxied at /api/*                      (internal :3022^)
echo   Ingest service:  proxied at /chunk/*                    (internal :3023^)
echo   Receipt service: proxied at /receipt/*                  (internal :3024^)
echo   MinIO console:   http://localhost:9001                  (slothbox-local / see .env^)
echo   Grafana:         http://localhost:3030                  (admin / admin^)
echo   Prometheus:      http://localhost:9090
echo   Live production: https://slothbox.philipsloth.com
echo ============================================================================
echo.
echo  Tip: ctrl+c to stop the dev server. Docker stack keeps running -
echo       use `docker compose down` to tear it down completely.
echo.

REM Browser opens after Next.js compiles (Next prints "Ready" first run)
start "" /min cmd /c "timeout /t 12 /nobreak >nul & start %DASHBOARD_URL%"

REM Run the frontend in the foreground so Ctrl+C cleans up
call pnpm --filter @slothbox/web run dev

endlocal
