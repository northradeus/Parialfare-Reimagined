@echo off
setlocal
title Nolheim Khmer Bulk Polisher
color 0A

cd /d "%~dp0"

echo ============================================================
echo           NOLHEIM KHMER BULK POLISH ENGINE
echo ============================================================
echo.

node polish-khmer.cjs %*

echo.
pause
