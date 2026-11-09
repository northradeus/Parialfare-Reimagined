@echo off
title Nolheim Wiki Updater
color 0A
if defined NOLHEIM_DASHBOARD set "SKIP_PAUSE=1"

echo =========================================
echo       NOLHEIM WIKI DEPLOYMENT SCRIPT
echo =========================================
echo.

cd /d "%~dp0"

echo [1/5] Building content from vault...
call node build-content.cjs
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed. Check output above.
    if not defined SKIP_PAUSE pause & exit /b %ERRORLEVEL%
)
echo.

echo [2/5] Fixing git case-sensitivity for assets...
git config core.ignorecase false
if exist "content\assets" (
    git rm -r --cached content/assets >nul 2>nul
    git add content/assets
)
echo.

echo [3/5] Committing and pushing to GitHub...
call npx quartz sync
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Push failed. Check internet or git credentials.
    if not defined SKIP_PAUSE pause & exit /b %ERRORLEVEL%
)
echo.

echo [4/5] Waiting for GitHub Actions to deploy...
echo (This takes 1-2 minutes. Do not close this window.)
echo.

where gh >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: GitHub CLI ^(gh^) not installed.
    echo Cannot wait for deployment status. Install with: winget install GitHub.cli
    echo The push succeeded; check status manually at:
    echo   https://github.com/northradeus/Parialfare-Reimagined/actions
    goto :deploy_check_skipped
)

gh run watch --exit-status
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: GitHub Actions workflow FAILED.
    echo Open https://github.com/northradeus/Parialfare-Reimagined/actions to see the log.
    if not defined SKIP_PAUSE pause & exit /b %ERRORLEVEL%
)

:deploy_check_skipped
echo.
echo [5/5] Deployment complete.
echo =========================================
echo SUCCESS: Site is live at:
echo   https://northradeus.github.io/Parialfare-Reimagined/
echo.
echo If images look wrong, press Ctrl+Shift+R on the site.
echo =========================================
if not defined SKIP_PAUSE pause
