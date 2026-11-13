import { intro, outro, select, confirm, text, spinner, note, isCancel, cancel } from '@clack/prompts';
import { styleText } from 'node:util';
import { execSync, spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const LIVE_EN = 'https://northradeus.github.io/Parialfare-Reimagined/';
const LIVE_KM = 'https://northradeus.github.io/Parialfare-Reimagined/km/';
const BUNDLE_BAT = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\bundle_vault.bat';

function run(cmd, opts = {}) {
    return execSync(cmd, { cwd: ROOT_DIR, stdio: 'inherit', ...opts });
}

function runSilent(cmd, opts = {}) {
    try {
        return execSync(cmd, { cwd: ROOT_DIR, stdio: 'pipe', encoding: 'utf-8', ...opts }).trim();
    } catch {
        return '';
    }
}

async function doPreview() {
    const s = spinner();
    s.start('Compiling unified content (English + Khmer)...');
    try {
        execSync('node build-content.cjs --all', { cwd: ROOT_DIR, stdio: 'pipe' });
        s.stop(styleText('green', 'Content compiled successfully.'));
    } catch (e) {
        s.stop(styleText('red', 'Content build failed.'));
        console.error(e.stdout ? e.stdout.toString() : e.message);
        return;
    }

    const openUrl = 'http://localhost:8080/';
    console.log(styleText('cyan', `\nStarting local server on ${openUrl} ...\n`));
    
    // Open browser on Windows
    try {
        spawn('cmd.exe', ['/c', 'start', openUrl], { detached: true, stdio: 'ignore' });
    } catch {}

    run('npx quartz build --serve --port 8080');
}

async function doPublish() {
    const s = spinner();
    s.start('Building unified content from vault...');
    try {
        execSync('node build-content.cjs --all', { cwd: ROOT_DIR, stdio: 'pipe' });
        s.stop(styleText('green', 'Content build complete.'));
    } catch (e) {
        s.stop(styleText('red', 'Content build failed.'));
        console.error(e.stdout ? e.stdout.toString() : e.message);
        return;
    }

    const rawStatus = runSilent('git status --short');
    if (!rawStatus) {
        note('Working tree is clean. No changes detected to publish.', 'Publish');
        return;
    }

    const lines = rawStatus.split('\n').filter(Boolean);
    const added = lines.filter(l => l.startsWith('??') || l.startsWith('A ')).length;
    const modified = lines.filter(l => l.startsWith(' M') || l.startsWith('M ')).length;
    const deleted = lines.filter(l => l.startsWith(' D') || l.startsWith('D ')).length;

    const summaryText = `${lines.length} file(s) changed:\n  + ${added} new\n  ~ ${modified} modified\n  - ${deleted} deleted\n\nPreview:\n${lines.slice(0, 10).map(l => '  ' + l).join('\n')}${lines.length > 10 ? `\n  ... and ${lines.length - 10} more` : ''}`;
    note(summaryText, 'Pending Publication');

    const defaultMsg = `publish: ${added ? `${added} new, ` : ''}${modified} modified`;
    const commitMsg = await text({
        message: 'Enter commit message:',
        placeholder: defaultMsg,
        defaultValue: defaultMsg,
    });
    if (isCancel(commitMsg)) {
        cancel('Publication cancelled.');
        return;
    }

    const shouldPublish = await confirm({
        message: 'Deploy and push to GitHub Pages now?',
        initialValue: true,
    });
    if (isCancel(shouldPublish) || !shouldPublish) {
        cancel('Publication cancelled.');
        return;
    }

    const deploySpinner = spinner();
    deploySpinner.start('Staging, committing, and syncing to GitHub...');
    try {
        // Fix asset case sensitivity on Windows
        runSilent('git config core.ignorecase false');
        const assetsDir = path.join(ROOT_DIR, 'content', 'assets');
        if (fs.existsSync(assetsDir)) {
            runSilent('git add content/assets');
        }

        runSilent('git add -A');
        runSilent(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);
        run('npx quartz sync');
        deploySpinner.stop(styleText('green', 'Deployment complete!'));

        note(`Live URLs:\n  English: ${LIVE_EN}\n  Khmer:   ${LIVE_KM}`, 'Success');
    } catch (e) {
        deploySpinner.stop(styleText('red', 'Push failed.'));
        console.error(e.message);
    }
}

async function doStatus() {
    const gitHead = runSilent('git log -1 --oneline');
    const branch = runSilent('git branch --show-current');
    const statusOut = runSilent('git status --short');
    const lines = statusOut ? statusOut.split('\n').filter(Boolean) : [];

    let statusBody = `Branch:  ${branch || 'v5'}\nLatest:  ${gitHead || 'unknown'}\nChanges: ${lines.length} uncommitted file(s)\n`;
    if (lines.length > 0) {
        statusBody += '\n' + lines.slice(0, 12).map(l => '  ' + l).join('\n');
        if (lines.length > 12) statusBody += `\n  ... and ${lines.length - 12} more`;
    } else {
        statusBody += '\n  Working tree is completely clean.';
    }

    statusBody += `\n\nLive Sites:\n  English: ${LIVE_EN}\n  Khmer:   ${LIVE_KM}`;
    note(statusBody, 'Nolheim Status');
}

async function doStudio() {
    console.log(styleText('cyan', '\nLaunching Nolheim Studio Suite on http://localhost:3333 ...'));
    const studioBat = path.join(ROOT_DIR, 'Studio.bat');
    if (fs.existsSync(studioBat)) {
        spawn('cmd.exe', ['/c', 'start', '""', studioBat], { detached: true, stdio: 'ignore' });
        note('Studio opened in background at http://localhost:3333', 'Studio');
    } else {
        console.error('Studio.bat not found.');
    }
}

async function doUtilities() {
    while (true) {
        const utilAction = await select({
            message: 'Select Utility / Batch Tool:',
            options: [
                { value: 'bundle', label: 'Bundle AI Vault (concatenates notes for NotebookLM/LLMs)' },
                { value: 'polish_km', label: 'Bulk Polish Khmer (grammar, formatting, term dictionary)' },
                { value: 'lint_syntax', label: 'Markdown Syntax Linter (detects spaced bold/italics)' },
                { value: 'back', label: '← Back to Main Menu' },
            ],
        });

        if (isCancel(utilAction) || utilAction === 'back') return;

        if (utilAction === 'bundle') {
            const bundleTarget = await select({
                message: 'Select Vault Bundle Target:',
                options: [
                    { value: '--en', label: 'English Vault (vault.md & vault_en.md)' },
                    { value: '--km', label: 'Khmer Vault (vault_km.md)' },
                    { value: '--bilingual', label: 'Bilingual Master Vault (vault_bilingual.md)' },
                    { value: '--all', label: 'All Bundles (EN + KM + Bilingual)' },
                ],
            });
            if (!isCancel(bundleTarget)) {
                if (fs.existsSync(BUNDLE_BAT)) {
                    run(`call "${BUNDLE_BAT}" ${bundleTarget} --no-pause`);
                } else {
                    console.error('bundle_vault.bat not found at ' + BUNDLE_BAT);
                }
            }
        } else if (utilAction === 'polish_km') {
            const polishMode = await select({
                message: 'Khmer Bulk Polisher Action:',
                options: [
                    { value: '--yes', label: 'Auto-Polish All (apply changes with .bak backups)' },
                    { value: '--dry-run', label: 'Dry-Run Preview (inspect detected issues without saving)' },
                    { value: '', label: 'Interactive Inspection (approve file-by-file)' },
                    { value: '--restore-bak', label: 'Restore / Undo from .bak backups' },
                    { value: '--clean-bak', label: 'Delete .bak backup files' },
                ],
            });
            if (!isCancel(polishMode)) {
                run(`node "${path.join(ROOT_DIR, 'polish-khmer.cjs')}" ${polishMode}`);
            }
        } else if (utilAction === 'lint_syntax') {
            const lintTarget = await select({
                message: 'Select Lint Target:',
                options: [
                    { value: 'content', label: 'Staged Content (quartz-site/content)' },
                    { value: 'km', label: 'Khmer Vault (Nolheim-Khmer)' },
                    { value: 'dry', label: 'Dry-Run Check Only' },
                ],
            });
            if (!isCancel(lintTarget)) {
                if (lintTarget === 'content') {
                    run(`node "${path.join(ROOT_DIR, 'lint-autocorrect.cjs')}" "${path.join(ROOT_DIR, 'content')}"`);
                } else if (lintTarget === 'km') {
                    run(`node "${path.join(ROOT_DIR, 'lint-autocorrect.cjs')}" "C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim-Khmer"`);
                } else if (lintTarget === 'dry') {
                    run(`node "${path.join(ROOT_DIR, 'lint-autocorrect.cjs')}" --dry-run`);
                }
            }
        }
    }
}

async function main() {
    // Process command line flags for direct execution (e.g. node cli/nolheim.mjs preview)
    const cliArg = process.argv[2];
    if (cliArg === 'preview') return doPreview();
    if (cliArg === 'publish') return doPublish();
    if (cliArg === 'status') return doStatus();
    if (cliArg === 'studio') return doStudio();
    if (cliArg === 'bundle') return doUtilities();

    intro(styleText('bold', 'Nolheim Control Center'));

    while (true) {
        const action = await select({
            message: 'What would you like to do?',
            options: [
                { value: 'preview', label: 'Preview (build unified + local server on :8080)' },
                { value: 'publish', label: 'Publish (build + commit + push to GitHub Pages)' },
                { value: 'status', label: 'Status (git branch, pending changes, live links)' },
                { value: 'studio', label: 'Open Studio (:3333 local suite)' },
                { value: 'utilities', label: 'Utilities (AI bundler, Khmer polisher, linter)' },
                { value: 'exit', label: 'Exit' },
            ],
        });

        if (isCancel(action) || action === 'exit') {
            outro(styleText('cyan', 'Nolheim Control Center closed.'));
            process.exit(0);
        }

        if (action === 'preview') await doPreview();
        else if (action === 'publish') await doPublish();
        else if (action === 'status') await doStatus();
        else if (action === 'studio') await doStudio();
        else if (action === 'utilities') await doUtilities();
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
