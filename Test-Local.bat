@echo off
title Nolheim Local Preview
color 0B
echo =========================================
echo       NOLHEIM LOCAL PREVIEW
echo =========================================
echo.
cd /d "%~dp0"

echo [1/2] Building content from vault...
call node build-content.cjs

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Build failed. Please check the console output above.
    pause
    exit /b %ERRORLEVEL%
)
echo.

echo [2/2] Starting local Quartz server...
echo.
echo The site is now available at:
echo http://localhost:8080
echo.
echo Press Ctrl+C in this window to stop the server when you are done.
echo.
call npx quartz build --serve
pause
