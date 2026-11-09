@echo off
setlocal enabledelayedexpansion
title Nolheim Control Panel

set "BRIDGE_BAT=C:\Users\Administrator\anybridge\start_bridge.bat"
set "VAULT_DIR=C:\Users\Administrator\Documents\Worldbuild & IP\Nolheim"
set "SNAPSHOTS_DIR=%VAULT_DIR%\Archives\Publish snapshots"
set "QUARTZ_DIR=%~dp0"
if "%QUARTZ_DIR:~-1%"=="\" set "QUARTZ_DIR=%QUARTZ_DIR:~0,-1%"
set "WEBSITE=https://northradeus.github.io/Parialfare-Reimagined/"
set "NOLHEIM_DASHBOARD=1"

:MENU
cls
color 0F
call :SHOW_STATUS
echo.
echo ================================================================
echo   NOLHEIM CONTROL PANEL
echo ================================================================
echo.
echo    [1] Start Bridge         (new window - agent server)
echo    [2] Test Local           (new window - serve on :8080)
echo    [3] Staging Preview      (preview changes without promoting)
echo    [4] Promote              (apply pending request)
echo    [5] Deploy               (build + push to GitHub Pages)
echo    [6] Open Vault folder
echo    [7] Open Quartz folder
echo    [8] Open Website
echo.
echo    [0] Exit
echo.
set "CHOICE="
set /p "CHOICE=Select: "
if "%CHOICE%"=="1" goto DO_BRIDGE
if "%CHOICE%"=="2" goto DO_TESTLOCAL
if "%CHOICE%"=="3" goto DO_PREVIEW
if "%CHOICE%"=="4" goto DO_PROMOTE
if "%CHOICE%"=="5" goto DO_DEPLOY
if "%CHOICE%"=="6" goto DO_VAULT
if "%CHOICE%"=="7" goto DO_QUARTZ
if "%CHOICE%"=="8" goto DO_WEB
if "%CHOICE%"=="0" goto EXIT
goto MENU

:SHOW_STATUS
set "VERSION=none"
for /f "tokens=1 delims=-" %%V in ('dir /b /ad /o-n "%SNAPSHOTS_DIR%\v*" 2^>nul') do (
    if "!VERSION!"=="none" set "VERSION=%%V"
)
set "BRIDGE_STATUS=stopped"
for /f "tokens=*" %%L in ('netstat -ano 2^>nul ^| findstr /c:":3456 " ^| findstr LISTENING') do (
    set "BRIDGE_STATUS=running on :3456"
)
set "PENDING=no"
if exist "%~dp0Promote-Request.json" set "PENDING=YES"
echo ----------------------------------------------------------------
echo   Version:       !VERSION!
echo   Bridge:        !BRIDGE_STATUS!
echo   Pending:       !PENDING!
echo   Vault:         %VAULT_DIR%
echo ----------------------------------------------------------------
goto :eof

:DO_BRIDGE
start "Nolheim Bridge" cmd /k "%BRIDGE_BAT%"
goto MENU

:DO_TESTLOCAL
start "Nolheim Test Local" cmd /k "%~dp0Test-Local.bat"
goto MENU

:DO_PREVIEW
echo.
echo Running Staging Preview...
echo.
call "%~dp0Preview.bat"
echo.
echo ----------------------------------------------------------------
echo   Preview session ended.
echo   (Changes are staged. Run [4] Promote to make them official.)
echo ----------------------------------------------------------------
pause >nul
goto MENU

:DO_PROMOTE
if not exist "%~dp0Promote-Request.json" (
    echo.
    echo No Promote-Request.json found. Ask the agent to write one first.
    echo.
    pause
    goto MENU
)
echo.
echo Running Promote.bat...
echo.
call "%~dp0Promote.bat"
echo.
echo ----------------------------------------------------------------
echo   Promotion finished.
echo ----------------------------------------------------------------
pause >nul
goto MENU

:DO_DEPLOY
echo.
echo Running Update-Wiki.bat...
echo.
call "%~dp0Update-Wiki.bat"
echo.
echo ----------------------------------------------------------------
echo   Deploy finished.
echo ----------------------------------------------------------------
pause >nul
goto MENU

:DO_VAULT
start "" "%VAULT_DIR%"
goto MENU

:DO_QUARTZ
start "" "%QUARTZ_DIR%"
goto MENU

:DO_WEB
start "" "%WEBSITE%"
goto MENU

:EXIT
endlocal
exit /b 0
