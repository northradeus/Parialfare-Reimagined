@echo off
setlocal enabledelayedexpansion
title Nolheim Control Panel

set "BRIDGE_BAT=C:\Users\Administrator\anybridge\start_bridge.bat"
set "VAULT_DIR=C:\Users\Administrator\Documents\Worldbuild & IP\Nolheim"
set "KM_VAULT_DIR=C:\Users\Administrator\Documents\Worldbuild & IP\Nolheim-Khmer"
set "BUNDLE_BAT=C:\Users\Administrator\Documents\Worldbuild & IP\bundle_vault.bat"
set "BILINGUAL_TOOL=C:\Users\Administrator\Documents\Worldbuild & IP\bilingual_tool.cjs"
set "SNAPSHOTS_DIR=%VAULT_DIR%\Archives\Publish snapshots"
set "QUARTZ_DIR=%~dp0"
if "%QUARTZ_DIR:~-1%"=="\" set "QUARTZ_DIR=%QUARTZ_DIR:~0,-1%"
set "WEBSITE=https://northradeus.github.io/Parialfare-Reimagined/"
set "WEBSITE_KM=https://northradeus.github.io/Parialfare-Reimagined/km/"
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
echo    [1] Nolheim Studio Suite (Local Web App - Recommended)
echo    [2] Website Operations   (Preview, Local, Deploy -^> EN / KM / Both)
echo    [3] Start Bridge         (new window - agent server)
echo    [4] Publish Pages        (choose pages, write a note, go live)
echo    [5] Drift Check          (Continuities vs Publish)
echo    [6] Bundle AI Vault      (EN / KM / Bilingual -^> NotebookLM/LLMs)
echo    [7] Bilingual Drift      (Track EN vs KM translation status)
echo    [8] Bulk Polish Khmer    (Deterministic polish, terms, punctuation, .bak)
echo    [9] Markdown Syntax Lint (Detect ^& fix spaced bold, italics, tags)
echo    [10] Translate to Draft  (Single note, group, or all)
echo    [11] Copy Polish Prompt  (Generate AI polish prompt to clipboard)
echo    [12] Scaffold Template   (Blank structured note from English)
echo    [13] Open Vault (EN)     (English Nolheim)
echo    [14] Open Vault (KM)     (Nolheim-Khmer)
echo    [15] Open Quartz Folder
echo.
echo    [0] Exit
echo.
set "CHOICE="
set /p "CHOICE=Select: "
if "!CHOICE!"=="1" goto DO_STUDIO
if "!CHOICE!"=="2" goto WEBSITE_MENU
if "!CHOICE!"=="3" goto DO_BRIDGE
if "!CHOICE!"=="4" goto DO_PROMOTE
if "!CHOICE!"=="5" goto DO_DRIFT
if "!CHOICE!"=="6" goto DO_BUNDLE
if "!CHOICE!"=="7" goto DO_BILINGUAL_DRIFT
if "!CHOICE!"=="8" goto DO_KHMER_POLISH
if "!CHOICE!"=="9" goto DO_SYNTAX_CHECK
if "!CHOICE!"=="10" goto DO_TRANSLATE_DRAFT
if "!CHOICE!"=="11" goto DO_POLISH_PROMPT
if "!CHOICE!"=="12" goto DO_SCAFFOLD
if "!CHOICE!"=="13" goto DO_VAULT
if "!CHOICE!"=="14" goto DO_KM_VAULT
if "!CHOICE!"=="15" goto DO_QUARTZ
if "!CHOICE!"=="0" goto EXIT
goto MENU

:DO_STUDIO
start "" "%QUARTZ_DIR%\Studio.bat"
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
set "DRIFT_STATUS=checking..."
for /f "tokens=*" %%D in ('node "%~dp0drift-check.cjs" --summary 2^>nul') do (
    set "DRIFT_STATUS=%%D"
)
set "BILINGUAL_STATUS=checking..."
for /f "tokens=*" %%B in ('node "%BILINGUAL_TOOL%" drift --summary 2^>nul') do (
    set "BILINGUAL_STATUS=%%B"
)
echo ----------------------------------------------------------------
echo   Version:       !VERSION!
echo   Bridge:        !BRIDGE_STATUS!
echo   Unpromoted:    !DRIFT_STATUS!
echo   Bilingual:     !BILINGUAL_STATUS!
echo   Pending:       !PENDING!
echo   Vault (EN):    !VAULT_DIR!
echo   Vault (KM):    !KM_VAULT_DIR!
echo ----------------------------------------------------------------
goto :eof

:WEBSITE_MENU
cls
color 0B
echo.
echo ================================================================
echo   NOLHEIM WEBSITE OPERATIONS (EN / KM / UNIFIED)
echo ================================================================
echo.
echo    Live URLs:
echo      English: !WEBSITE!
echo      Khmer:   !WEBSITE_KM!
echo.
echo ----------------------------------------------------------------
echo    [1] Staging Preview      (Preview changes without promoting)
echo    [2] Local Preview        (Serve live on http://localhost:8080)
echo    [3] Deploy to GitHub     (Build + sync to GitHub Pages)
echo    [4] Open Live Website    (Open in browser)
echo.
echo    [0] Back to Main Menu
echo.
set "W_CHOICE="
set /p "W_CHOICE=Select [0-4]: "
if "!W_CHOICE!"=="1" goto DO_WS_PREVIEW
if "!W_CHOICE!"=="2" goto DO_WS_LOCAL
if "!W_CHOICE!"=="3" goto DO_WS_DEPLOY
if "!W_CHOICE!"=="4" goto DO_WS_OPEN
if "!W_CHOICE!"=="0" goto MENU
goto WEBSITE_MENU

:DO_WS_PREVIEW
echo.
echo Select Target Language for Staging Preview:
echo   [1] English (Root /)
echo   [2] Khmer (/km/)
echo   [3] Both (Unified Site - Recommended)
echo.
set "W_LANG=3"
set /p "W_LANG=Select [1-3] (default 3): "
set "W_FLAG=--all"
set "W_URL=http://localhost:8080/"
if "!W_LANG!"=="1" (set "W_FLAG=--en" & set "W_URL=http://localhost:8080/")
if "!W_LANG!"=="2" (set "W_FLAG=--km" & set "W_URL=http://localhost:8080/km/")
echo.
echo Building staging content (!W_FLAG!)...
set NOLHEIM_FORCE_BUILD=1
call node "%~dp0build-content.cjs" !W_FLAG!
if errorlevel 1 (
    echo.
    echo [ERROR] Content generation failed.
    pause
    goto WEBSITE_MENU
)
echo.
echo Starting Staging Preview server on :8080...
echo Opening !W_URL!
start "" "!W_URL!"
call npx quartz build --serve
goto WEBSITE_MENU

:DO_WS_LOCAL
echo.
echo Select Target Language for Local Preview:
echo   [1] English (Root /)
echo   [2] Khmer (/km/)
echo   [3] Both (Unified Site - Recommended)
echo.
set "W_LANG=3"
set /p "W_LANG=Select [1-3] (default 3): "
set "W_FLAG=--all"
set "W_URL=http://localhost:8080/"
if "!W_LANG!"=="1" (set "W_FLAG=--en" & set "W_URL=http://localhost:8080/")
if "!W_LANG!"=="2" (set "W_FLAG=--km" & set "W_URL=http://localhost:8080/km/")
echo.
echo Building content (!W_FLAG!)...
call node "%~dp0build-content.cjs" !W_FLAG!
if errorlevel 1 (
    echo.
    echo [ERROR] Content generation failed. Existing content preserved.
    pause
    goto WEBSITE_MENU
)
echo.
echo Starting Local Preview server on :8080...
echo Opening !W_URL!
start "" "!W_URL!"
call npx quartz build --serve
goto WEBSITE_MENU

:DO_WS_DEPLOY
echo.
echo ================================================================
echo   DEPLOY NOLHEIM WIKI TO GITHUB PAGES
echo ================================================================
echo.
echo Select Target Language to Deploy:
echo   [1] English (Root /)
echo   [2] Khmer (/km/)
echo   [3] Both (Unified Site - Recommended)
echo.
set "W_LANG=3"
set /p "W_LANG=Select [1-3] (default 3): "
set "W_FLAG=--all"
if "!W_LANG!"=="1" set "W_FLAG=--en"
if "!W_LANG!"=="2" set "W_FLAG=--km"
echo.
echo [1/4] Building content from vault (!W_FLAG!)...
call node "%~dp0build-content.cjs" !W_FLAG!
if errorlevel 1 (
    echo [ERROR] Build failed. Check output above.
    pause
    goto WEBSITE_MENU
)
echo.
echo [2/4] Fixing git case-sensitivity for assets...
git config core.ignorecase false
if exist "%~dp0content\assets" (
    git rm -r --cached content/assets >nul 2>nul
    git add content/assets
)
echo.
echo [3/4] Committing and pushing to GitHub Pages...
git add -A
call npx quartz sync
if errorlevel 1 (
    echo [ERROR] Push failed. Check internet or git credentials.
    pause
    goto WEBSITE_MENU
)
echo.
echo [4/4] Deployment complete!
echo Live URLs:
echo   English: !WEBSITE!
echo   Khmer:   !WEBSITE_KM!
echo ----------------------------------------------------------------
pause
goto WEBSITE_MENU

:DO_WS_OPEN
echo.
echo Open Live Website:
echo   [1] English (Root /)
echo   [2] Khmer (/km/)
echo   [3] Both
echo.
set "W_OPEN=3"
set /p "W_OPEN=Select [1-3] (default 3): "
if "!W_OPEN!"=="1" start "" "!WEBSITE!"
if "!W_OPEN!"=="2" start "" "!WEBSITE_KM!"
if "!W_OPEN!"=="3" (
    start "" "!WEBSITE!"
    start "" "!WEBSITE_KM!"
)
goto WEBSITE_MENU

:DO_BRIDGE
start "Nolheim Bridge" cmd /k "%BRIDGE_BAT%"
goto MENU

:DO_PROMOTE
echo.
if not exist "%~dp0Promote-Request.json" goto PROMOTE_PICK
echo   A publish package prepared by the agent is already waiting.
set "USEREQ="
set /p "USEREQ=  Use it? (Y = use it, N = choose pages yourself): "
if /i "!USEREQ!"=="Y" goto PROMOTE_RUN

:PROMOTE_PICK
node "%~dp0publish-picker.cjs" prepare
if errorlevel 1 goto PROMOTE_STOP
start "" /wait notepad "%~dp0private\Publish-Picker.txt"
node "%~dp0publish-picker.cjs" finish
if errorlevel 1 goto PROMOTE_STOP

:PROMOTE_RUN
echo.
call "%~dp0Promote.bat"
if errorlevel 1 goto PROMOTE_STOP
echo.
set "DODEPLOY="
set /p "DODEPLOY=  Publish to the website now? (Y/N): "
if /i "!DODEPLOY!"=="Y" (
    echo.
    call "%~dp0Update-Wiki.bat"
)
echo.
echo ----------------------------------------------------------------
echo   Done. Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:PROMOTE_STOP
echo.
echo ----------------------------------------------------------------
echo   Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:DO_DRIFT
echo.
call node "%~dp0drift-check.cjs"
echo.
echo ----------------------------------------------------------------
echo   Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:DO_BUNDLE
echo.
echo ================================================================
echo   BUNDLE AI VAULT (NotebookLM / Claude / Gemini / ChatGPT)
echo ================================================================
echo.
echo    [1] English Vault (default)      -^> vault.md ^& vault_en.md
echo    [2] Khmer Vault                   -^> vault_km.md
echo    [3] Bilingual Master Vault        -^> vault_bilingual.md
echo    [4] All bundles (EN + KM + Both)
echo.
echo    [0] Back to Main Menu
echo.
set "B_CHOICE=1"
set /p "B_CHOICE=Select target [0-4] (default 1): "
if "!B_CHOICE!"=="0" goto MENU
set "B_FLAG=--en"
if "!B_CHOICE!"=="2" set "B_FLAG=--km"
if "!B_CHOICE!"=="3" set "B_FLAG=--bilingual"
if "!B_CHOICE!"=="4" set "B_FLAG=--all"
echo.
call "%BUNDLE_BAT%" !B_FLAG! --no-pause
echo.
echo ----------------------------------------------------------------
echo   Vault bundled and highlighted in File Explorer.
echo   Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:DO_BILINGUAL_DRIFT
echo.
call node "%BILINGUAL_TOOL%" drift
echo.
echo ----------------------------------------------------------------
echo   Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:DO_KHMER_POLISH
cls
color 0E
echo.
echo ================================================================
echo   NOLHEIM KHMER BULK POLISHER
echo ================================================================
echo.
echo   Target Vault: !KM_VAULT_DIR!
echo.
echo   Deterministic Polish Features:
echo     - Punctuation (colons : -^> ៖, proper spacing)
echo     - Markdown formatting (spaced bold/italics, ^<figure^> tags)
echo     - Master term dictionary (50+ official faction/character terms)
echo     - Section headings (Pure Native Khmer)
echo     - Updates metadata: review_status: script-polished
echo.
echo   * Safety: Creates individual companion '.bak' backups automatically.
echo.
echo    [1] Interactive Polish   (Inspect proposed changes ^& approve per file)
echo    [2] Dry-Run Preview      (View all detected improvements - 0 files changed)
echo    [3] Auto-Polish All      (Apply all improvements with safety .bak backups)
echo    [4] Undo / Restore .bak  (Roll back files to their pre-polish state)
echo    [5] Clean .bak Backups   (Permanently remove backup files when satisfied)
echo.
echo    [0] Back to Main Menu
echo.
set "KP_CHOICE="
set /p "KP_CHOICE=Select [0-5]: "
if "!KP_CHOICE!"=="1" (
    echo.
    call node "%QUARTZ_DIR%\polish-khmer.cjs"
    echo.
    pause
    goto DO_KHMER_POLISH
)
if "!KP_CHOICE!"=="2" (
    echo.
    call node "%QUARTZ_DIR%\polish-khmer.cjs" --dry-run
    echo.
    pause
    goto DO_KHMER_POLISH
)
if "!KP_CHOICE!"=="3" (
    echo.
    call node "%QUARTZ_DIR%\polish-khmer.cjs" --yes
    echo.
    pause
    goto DO_KHMER_POLISH
)
if "!KP_CHOICE!"=="4" (
    echo.
    call node "%QUARTZ_DIR%\polish-khmer.cjs" --restore-bak
    echo.
    pause
    goto DO_KHMER_POLISH
)
if "!KP_CHOICE!"=="5" (
    echo.
    call node "%QUARTZ_DIR%\polish-khmer.cjs" --clean-bak
    echo.
    pause
    goto DO_KHMER_POLISH
)
if "!KP_CHOICE!"=="0" goto MENU
goto DO_KHMER_POLISH

:DO_SYNTAX_CHECK
cls
color 0B
echo.
echo ================================================================
echo   MARKDOWN SYNTAX ^& FORMAT LINTER
echo ================================================================
echo.
echo   Detects spaced bold (** text **), italics (* text *),
echo   and unescaped Khmer figure tags (^<រូប^>).
echo.
echo    [1] Lint Content Staging  (interactive check ^& fix on quartz-site\content)
echo    [2] Lint Khmer Vault      (interactive check ^& fix on Nolheim-Khmer)
echo    [3] Dry-Run Check Only    (view syntax issues without modifying files)
echo.
echo    [0] Back to Main Menu
echo.
set "SC_CHOICE="
set /p "SC_CHOICE=Select [0-3]: "
if "!SC_CHOICE!"=="1" (
    echo.
    call node "%QUARTZ_DIR%\lint-autocorrect.cjs" "%QUARTZ_DIR%\content"
    echo.
    pause
    goto DO_SYNTAX_CHECK
)
if "!SC_CHOICE!"=="2" (
    echo.
    call node "%QUARTZ_DIR%\lint-autocorrect.cjs" "!KM_VAULT_DIR!"
    echo.
    pause
    goto DO_SYNTAX_CHECK
)
if "!SC_CHOICE!"=="3" (
    echo.
    call node "%QUARTZ_DIR%\lint-autocorrect.cjs" "!KM_VAULT_DIR!" --dry-run
    echo.
    pause
    goto DO_SYNTAX_CHECK
)
if "!SC_CHOICE!"=="0" goto MENU
goto DO_SYNTAX_CHECK

:DO_TRANSLATE_DRAFT
echo.
echo ================================================================
echo   TRANSLATE ENGLISH CANON TO KHMER DRAFT
echo ================================================================
echo.
echo    [1] Single Note    (e.g. Tanishito, Noradus, LENDERMAIRE)
echo    [2] Faction Group  (e.g. LENDERMAIRE, Anajak Forces)
echo    [3] All Pending Notes
echo.
echo    [0] Back to Main Menu
echo.
set "T_CHOICE=1"
set /p "T_CHOICE=Select [0-3] (default 1): "
if "!T_CHOICE!"=="0" goto MENU
if "!T_CHOICE!"=="1" (
    set "T_NOTE="
    set /p "T_NOTE=Enter note name: "
    if not "!T_NOTE!"=="" call node "%BILINGUAL_TOOL%" translate "!T_NOTE!" --force
)
if "!T_CHOICE!"=="2" (
    set "T_GROUP="
    set /p "T_GROUP=Enter group/faction name: "
    if not "!T_GROUP!"=="" call node "%BILINGUAL_TOOL%" translate --group "!T_GROUP!"
)
if "!T_CHOICE!"=="3" (
    call node "%BILINGUAL_TOOL%" translate --all
)
echo.
echo ----------------------------------------------------------------
echo   Press any key to return to the menu.
echo ----------------------------------------------------------------
pause
goto MENU

:DO_POLISH_PROMPT
echo.
echo ================================================================
echo   COPY AI POLISH PROMPT TO CLIPBOARD
echo ================================================================
echo.
echo   Press Enter without typing to cancel.
echo.
set "P_NOTE="
set /p "P_NOTE=Enter note name (e.g. Andrew, Samsara Lykor): "
if not "!P_NOTE!"=="" (
    call node "%BILINGUAL_TOOL%" polish-prompt "!P_NOTE!" --copy
    echo.
    echo ----------------------------------------------------------------
    echo   Prompt copied! You can paste (Ctrl+V) into Claude / ChatGPT.
    echo ----------------------------------------------------------------
)
pause
goto MENU

:DO_SCAFFOLD
echo.
echo ================================================================
echo   SCAFFOLD KHMER NOTE FROM ENGLISH CANON
echo ================================================================
echo.
echo   Press Enter without typing to cancel.
echo.
set "NOTE_NAME="
set /p "NOTE_NAME=Enter note name or UID (e.g. Tanishito, LENDERMAIRE, Pocheasang): "
if not "!NOTE_NAME!"=="" (
    call node "%BILINGUAL_TOOL%" scaffold "!NOTE_NAME!"
    echo.
)
pause
goto MENU

:DO_VAULT
start "" "%VAULT_DIR%"
goto MENU

:DO_KM_VAULT
start "" "%KM_VAULT_DIR%"
goto MENU

:DO_QUARTZ
start "" "%QUARTZ_DIR%"
goto MENU

:EXIT
endlocal
exit /b 0