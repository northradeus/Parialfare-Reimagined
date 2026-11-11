@echo off
setlocal
title Nolheim Markdown Syntax Checker
color 0B

cd /d "%~dp0"

echo ============================================================
echo         NOLHEIM MARKDOWN SYNTAX LINT ^& CHECKER
echo ============================================================
echo.

node lint-autocorrect.cjs %*

echo.
pause
