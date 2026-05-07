@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM  SlothBox - local dev launcher
REM ----------------------------------------------------------------------------
REM  Tier 2 from LESSONS.md (full-stack with DB + multi-service).
REM    0. Detect Sync.com folder. If we're inside one, AUTO-MIRROR the project
REM       to C:\dev\slothbox (a non-Sync location) and re-launch from there.
REM       User-transparent: same command, same result, same hot-reload URL.
REM    1. Free the dev port if a previous run left it occupied
REM    2. docker compose up -d --build  (rebuilds changed images)
REM    3. Wait for Postgres + ingest healthy, then run idempotent migrations
REM    4. Start Next.js frontend in dev mode (hot reload)
REM
REM  WHY THE AUTO-MIRROR EXISTS:
REM    Files inside C:\Users\phili\Sync\... carry the Windows ReparsePoint
REM    attribute (0x400) even after full hydration, because Sync.com's
REM    filesystem driver uses it to track sync state. Docker BuildKit
REM    refuses to include reparse points in build context — it can't tell
REM    a Sync placeholder from a malicious symlink, so it rejects all of
REM    them with "invalid file request <path>". Sync.com's driver also
REM    re-applies the flag immediately if anything tries to strip it.
REM
REM    Solution: keep two copies of the project.
REM      Canonical (Sync\Websites\slothbox): source of truth, git ops,
REM         editor lives here, Sync.com cloud backup.
REM      Mirror (C:\dev\slothbox): non-Sync folder, BuildKit-friendly,
REM         used ONLY for `docker compose` runs.
REM
REM    Auto-mirror via robocopy. First run = a few seconds. Subsequent
REM    runs = sub-second incremental. Files that don't matter for the
REM    docker build (node_modules, .next, .git, dist, etc.) are excluded.
REM    The .env file is copied explicitly so secrets propagate correctly.
REM ============================================================================

set FRONTEND_PORT=3021
set GATEWAY_PORT=3022
set INGEST_PORT=3023
set RECEIPT_PORT=3024
REM The browser auto-opens to the Caddy-fronted production-shape URL on
REM port 80 because that's what's running the moment the docker stack
REM finishes coming up. The pnpm dev hot-reload server at :3021 is also
REM started below for code-tweak workflows, but it can take 30-60 seconds
REM to compile its first bundle — opening the browser there racy-fails
REM with "connection refused". The :80 URL is identical in shape to
REM production (Caddy reverse proxy, all 13 services live) and is what
REM most users actually want to look at.
set DASHBOARD_URL=http://localhost

cd /d "%~dp0"

REM Detect Sync.com cloud folder via path substring.
REM
REM We use cmd's string-replace-with-empty syntax instead of findstr.
REM `%CWD:\Sync\=%` returns CWD with the literal `\Sync\` removed; if
REM the result differs from CWD, Sync was present in the path.
set "CWD=%CD%"
set "STRIPPED=%CWD:\Sync\=%"
set "STRIPPED_LOWER=%CWD:\sync\=%"
if /I not "%STRIPPED%"=="%CWD%" goto :auto_mirror
if /I not "%STRIPPED_LOWER%"=="%CWD%" goto :auto_mirror
goto :no_sync

:auto_mirror
set "MIRROR=C:\dev\slothbox"
echo.
echo ============================================================================
echo  Sync.com folder detected - auto-mirroring to %MIRROR%
echo ============================================================================
echo  Source: %CWD%
echo  Target: %MIRROR%
echo  Why:    Sync.com placeholder flags break Docker BuildKit. Mirroring to
echo          a non-Sync folder lets Docker read files normally.
echo  Speed:  first run ~5 sec, incremental ~1 sec.
echo.

if not exist "C:\dev" mkdir "C:\dev"

REM robocopy options:
REM   /MIR              mirror tree (delete dest files not in source)
REM   /XD ...           exclude these directories
REM   /XF ...           exclude these files
REM   /R:1 /W:1         retry once with 1s wait on file lock
REM   /NJH /NJS /NDL /NFL /NC /NS  quiet output (no header/summary/dirlist/filelist/class/size)
REM
REM Excluded dirs:
REM   node_modules  - pnpm reinstalls inside container
REM   .next .turbo  - Next.js build caches
REM   dist out      - build outputs
REM   coverage      - test coverage
REM   .git          - keep git ops in canonical only (avoids cross-folder confusion)
REM
REM Excluded files:
REM   .env          - copied explicitly below so dev/prod values don't get crossed
REM   *.log         - noise
robocopy "%CWD%" "%MIRROR%" /MIR /XD node_modules .next .turbo dist out coverage .git /XF .env *.log /R:1 /W:1 /NJH /NJS /NDL /NFL /NC /NS >nul

REM robocopy exit codes: 0=no copy, 1=files copied, 2=extras, 4=mismatched,
REM 8+=failures. Anything 0-7 is success.
if errorlevel 8 (
    echo.
    echo  ERROR: robocopy mirror failed with exit code !errorlevel!.
    echo  You can run scripts\setup-local-dev.bat manually for a clean restart.
    pause
    exit /b 1
)

REM Always copy .env fresh so secrets propagate from canonical.
if exist "%CWD%\.env" copy /Y "%CWD%\.env" "%MIRROR%\.env" >nul

echo  Mirror ready. Switching to %MIRROR% and continuing...
echo.

REM Re-launch the script from the mirror so subsequent commands run from
REM the right cwd. The /B flag stays in the same console window; the
REM `exit` at the end propagates the launched bat's exit code back.
cd /d "%MIRROR%"
call "%MIRROR%\start_local_server.bat"
exit /b %errorlevel%

:no_sync

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

echo [5/5] Starting Next.js dev hot-reload (background) on :%FRONTEND_PORT% ...
echo.
echo ============================================================================
echo  Stack URLs
echo ----------------------------------------------------------------------------
echo   ^>^>^> http://localhost                ^<^<^< primary - prod-shape via Caddy
echo   API gateway:     proxied at /api/*                      (internal :3022^)
echo   Ingest service:  proxied at /chunk/*                    (internal :3023^)
echo   Receipt service: proxied at /receipt/*                  (internal :3024^)
echo   Frontend HMR:    http://localhost:%FRONTEND_PORT%       (hot reload, ~60s to compile^)
echo   MinIO console:   http://localhost:9001                  (slothbox-local / see .env^)
echo   Grafana:         http://localhost:3030                  (admin / admin^)
echo   Prometheus:      http://localhost:9090
echo   Live production: https://slothbox.philipsloth.com
echo ============================================================================
echo.
echo  Tip: ctrl+c to stop the dev server. Docker stack keeps running -
echo       use `docker compose down` to tear it down completely.
echo.

REM Browser opens to the prod-shape URL almost immediately - by this
REM point Caddy + web are both healthy (verified by the depends_on
REM gates above) so the page loads first try. 3 seconds is enough for
REM the user to glance at the printed URLs first.
start "" /min cmd /c "timeout /t 3 /nobreak >nul & start %DASHBOARD_URL%"

REM Run the frontend in the foreground so Ctrl+C cleans up
call pnpm --filter @slothbox/web run dev

endlocal
