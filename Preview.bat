@echo off
title Nolheim Staging Preview
color 0E
echo =========================================
echo       NOLHEIM STAGING PREVIEW
echo =========================================
echo.
echo This is a TEMPORARY preview. Changes are NOT promoted yet.
echo.
cd /d "%~dp0"

set NOLHEIM_FORCE_BUILD=1
echo [1/2] Building content from vault (bypassing integrity check)...
call node build-content.cjs
if errorlevel 1 (
    echo.
    echo ERROR: Content generation failed.
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
