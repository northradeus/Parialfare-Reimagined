@echo off
setlocal
title Nolheim Studio Suite
color 0C

cd /d "%~dp0"

echo ================================================================
echo           NOLHEIM STUDIO SUITE (Local Web App)
echo ================================================================
echo.
echo   Authoring, Experimentation, Bilingual Lab, and Operations
echo   Running at: http://localhost:3333
echo.
echo   Opening browser in 2 seconds...
echo   Press Ctrl+C in this window to stop the Studio server.
echo.

start "" "http://localhost:3333"
call node studio\studio-server.cjs

if errorlevel 1 (
    echo.
    echo [ERROR] Studio server exited unexpectedly.
    pause
)
