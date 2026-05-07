@echo off
setlocal EnableDelayedExpansion

REM ============================================================================
REM  SlothBox - one-time local dev setup
REM ----------------------------------------------------------------------------
REM  Creates / updates the C:\dev\slothbox mirror that local Docker dev uses.
REM
REM  Why a mirror exists at all:
REM    The canonical source lives at C:\Users\phili\Sync\Websites\slothbox so
REM    every change is git-versioned + backed up to Sync.com. But Sync.com
REM    flags every file with the Windows ReparsePoint attribute even after
REM    full hydration, and Docker BuildKit refuses to read reparse points
REM    inside a build context (it can't tell a placeholder from a malicious
REM    symlink). So `docker compose build` fails with "invalid file request"
REM    on every COPY when run from inside the Sync folder.
REM
REM  This script bootstraps a sister copy at C:\dev\slothbox by either:
REM    a) `git clone` from origin (if the dir doesn't exist yet)
REM    b) `git pull` to fetch latest commits (if it already exists)
REM    c) `cp .env` so the local secrets propagate
REM
REM  Run once after every `git push` you want to test locally. Or set up
REM  a watcher that auto-mirrors on commit if you prefer.
REM ============================================================================

set MIRROR=C:\dev\slothbox
set REMOTE=https://github.com/SloThdk/slothbox.git
set CANONICAL=C:\Users\phili\Sync\Websites\slothbox

cd /d "%~dp0\.."

echo ============================================================================
echo  SlothBox - sync canonical (Sync.com) -^> mirror (C:\dev)
echo ============================================================================
echo.
echo  Canonical: %CANONICAL%
echo  Mirror:    %MIRROR%
echo  Remote:    %REMOTE%
echo.

if not exist "%MIRROR%" (
    echo [1/3] Mirror doesn't exist - cloning fresh from origin ...
    if not exist "C:\dev" mkdir "C:\dev"
    git clone %REMOTE% "%MIRROR%"
    if errorlevel 1 (
        echo  ERROR: git clone failed.
        pause
        exit /b 1
    )
) else (
    echo [1/3] Mirror exists - pulling latest from origin ...
    pushd "%MIRROR%"
    git fetch origin master
    git reset --hard origin/master
    if errorlevel 1 (
        echo  ERROR: git pull failed. Stash or commit local changes in the mirror.
        popd
        pause
        exit /b 1
    )
    popd
)

echo.
echo [2/3] Copying .env from canonical to mirror ...
if exist "%CANONICAL%\.env" (
    copy /Y "%CANONICAL%\.env" "%MIRROR%\.env" >nul
    echo       .env copied.
) else (
    echo       WARNING: %CANONICAL%\.env not found. Mirror won't have secrets.
    echo       Copy .env.example to .env and fill in values manually:
    echo         cd %MIRROR%
    echo         copy .env.example .env
)

echo.
echo [3/3] Done. Next steps:
echo.
echo   cd /d %MIRROR%
echo   start_local_server.bat
echo.
echo   The mirror is a normal git repo - commits + push from there work fine,
echo   but it's recommended to keep canonical-side as the source of truth and
echo   re-run this script before each local-test to pull latest.
echo.
pause
endlocal
