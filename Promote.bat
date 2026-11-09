@echo off
setlocal
title Nolheim Promotion
color 0E
if defined NOLHEIM_DASHBOARD set "SKIP_PAUSE=1"

cd /d "%~dp0"

echo =========================================
echo       NOLHEIM PROMOTION
echo =========================================
echo.

node promote.cjs
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo Promotion failed. See errors above.
    if not defined SKIP_PAUSE pause
    exit /b %ERRORLEVEL%
)

echo.
if not defined SKIP_PAUSE pause
