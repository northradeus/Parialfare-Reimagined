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
if errorlevel 1 (
    echo.
    echo ERROR: Content generation failed. Existing content was preserved.
    pause
    exit /b 1
)
echo.

echo [2/2] Starting local Quartz server...
echo http://localhost:8080
echo.
echo Press Ctrl+C to stop the server.
call npx quartz build --serve
pause
