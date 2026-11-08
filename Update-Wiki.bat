@echo off
title Nolheim Wiki Updater
color 0A

echo =========================================
echo       NOLHEIM WIKI DEPLOYMENT SCRIPT
echo =========================================
echo.

:: Navigate to the directory where this bat file is located
cd /d "%~dp0"

echo [1/3] Extracting and building content from vault...
call node build-content.cjs

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed. Please check the console output above.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [2/3] Pushing changes to GitHub...
call npx quartz sync

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Failed to push to GitHub. Check your internet or git credentials.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [3/3] Deployment triggered!
echo =========================================
echo SUCCESS: Your site is building on GitHub.
echo It will be live in about 1-2 minutes at:
echo https://northradeus.github.io/Parialfare-Reimagined/
echo =========================================

pause
