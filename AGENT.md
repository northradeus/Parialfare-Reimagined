# Nolheim Agent Context & Workflow

This document defines the operational rules, directory structure, and promotion workflow for the AI agent managing the Nolheim worldbuilding vault and Quartz site deployment.

## Workspace Roots
The agent is restricted to these directories:
- Vault: `C:/Users/Administrator/Documents/Worldbuild & IP/Nolheim`
- Site: `C:/Users/Administrator/Documents/quartz-site`
- Bridge: `C:/Users/Administrator/anybridge`

## Core Promotion Workflow (The Golden Path)
1. **Edit**: Make changes to source files in `Nolheim/Continuities/`. Do not manually copy or edit files in `Nolheim/Publish/`.
2. **Request**: Create `quartz-site/Promote-Request.json` with the file list, `log_summary`, and `site_log`. (The Creator can also do this without an agent via [4] Publish Pages in `Nolheim.bat`, which runs `publish-picker.cjs`.)
3. **Promote**: Run `Promote.bat` (or select [4] in `Nolheim.bat`). This copies the files from `Continuities/` to `Publish/`, creates a new snapshot in `Archives/Publish snapshots/`, and appends to the logs.
4. **Deploy**: Run `Update-Wiki.bat` (or select [5] in `Nolheim.bat`) to build the `content/` directory and push to GitHub.

## Critical Rules
- **NEVER manually edit** `Publish/LOG.md` or `Publish/Parialfare - Reimagined/Update Log.md`. These are append-only and strictly managed by `promote.cjs`. Manual edits cause versioning drift and integrity failures.
- **If a promotion is wrong**: Delete the newly created snapshot folder, revert the `Publish/` files to the previous snapshot, and remove the top log entry. Do not attempt to overwrite or patch old log entries.
- **Staging Preview**: Use `Preview.bat` (or [3] in `Nolheim.bat`) to test changes locally. It sets `NOLHEIM_FORCE_BUILD=1` to bypass the integrity check without consuming a version number or altering logs.
- **Path Formatting**: Always use forward slashes (`C:/path/to/file`) in tool calls. Never use backslashes or double backslashes.
- **Read Before Write**: The bridge enforces reading a file before editing or overwriting it. Always `read` before `edit`, `replace_lines`, or `write`.

## Key File Locations
- Source Truth: `Nolheim/Continuities/Parialfare - Reimagined/`
- Publication Vault: `Nolheim/Publish/Parialfare - Reimagined/`
- Snapshots: `Nolheim/Archives/Publish snapshots/vNNN-YYYY-MM-DD/`
- Build Script: `quartz-site/build-content.cjs`
- Promotion Script: `quartz-site/promote.cjs`

## Troubleshooting Integrity Errors
If `build-content.cjs` throws `[integrity] ERROR: Publish/ differs from latest snapshot`:
1. Check if files were manually edited in `Publish/` after the last promotion.
2. If testing, use `Preview.bat` to bypass.
3. If broken, delete the latest snapshot folder, restore `Publish/` from the previous valid snapshot, and re-run `Promote.bat` with a corrected `Promote-Request.json`.
