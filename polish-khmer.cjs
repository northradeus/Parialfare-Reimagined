/**
 * polish-khmer.cjs
 * 
 * Bulk deterministic polish script for Nolheim-Khmer dossiers.
 * 
 * Features:
 * 1. Punctuation: Normalizes colons (: -> ៖) and eliminates awkward spaces around Khmer punctuation.
 * 2. Markdown formatting: Fixes spaced bold (** text **), spaced italics (* text *), and <រូប> tags.
 * 3. Term dictionary: Substitutes known English / mistranslated terms with canonical Khmer terms.
 * 4. Headings: Localizes English section headings (# Characters -> # តួអង្គ, etc.).
 * 5. Metadata: Updates review_status from needs-ai-polish to script-polished.
 * 6. Safety: Creates individual companion '.bak' files before modifying any file, supports rollback (--restore-bak).
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_TARGET_DIR = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim-Khmer';
const DICTIONARY_PATH = path.join(__dirname, 'khmer-dictionary.json');

// Load dictionary
function loadDictionary() {
    if (!fs.existsSync(DICTIONARY_PATH)) {
        console.warn(`[polish] Warning: Dictionary not found at ${DICTIONARY_PATH}. Using empty dictionary.`);
        return { terms: {}, mistranslations: {}, headings: {} };
    }
    try {
        return JSON.parse(fs.readFileSync(DICTIONARY_PATH, 'utf-8'));
    } catch (e) {
        console.error(`[polish] Error parsing dictionary at ${DICTIONARY_PATH}: ${e.message}`);
        return { terms: {}, mistranslations: {}, headings: {} };
    }
}

/**
 * Normalizes spaced bold syntax in text.
 */
function cleanSpacedBold(text) {
    return text.replace(/(?<!\*)\*\*(?!\*)(\s*[^\*\n]+?\s*)\*\*(?!\*)/g, (match, inner) => {
        if (/^\s/.test(inner) || /\s$/.test(inner)) {
            return '**' + inner.trim() + '**';
        }
        return match;
    });
}

/**
 * Normalizes spaced italics syntax in text.
 */
function cleanSpacedItalics(text) {
    return text.replace(/(?<![\*\w])\*([^\*\n]+?)\*(?![\*\w])/g, (match, inner) => {
        if (/^\s/.test(inner) || /\s$/.test(inner)) {
            if (inner.trim().length > 0 && !/^[\s\*]+$/.test(inner)) {
                return '*' + inner.trim() + '*';
            }
        }
        return match;
    });
}

/**
 * Normalizes Khmer colons and spacing.
 */
function cleanKhmerPunctuation(text) {
    // 1. Khmer text or number followed by English colon -> replace with Khmer colon ៖
    let res = text.replace(/([\u1780-\u17FF\u17E0-\u17E9]):(?=\s|$)/g, '$1៖');

    // 2. Remove whitespace immediately before Khmer colon: " ៖" -> "៖"
    res = res.replace(/[ \t]+៖/g, '៖');

    // 3. Spaced colon inside bold: "** text ៖ **" -> "**text៖** "
    res = res.replace(/(?<!\*)\*\*\s*([^\*\n]+?)\s*៖\s*\*\*/g, '**$1៖**');

    // 4. Ensure single space after Khmer colon when followed by non-space, non-asterisk, non-punctuation
    res = res.replace(/៖(?=[^\s\*\)\}\]\n៖"'\”\’])/g, '៖ ');

    return res;
}

/**
 * Normalizes HTML figure tags.
 */
function cleanFigureTags(text) {
    return text.replace(/<រូប>/g, '<figure>').replace(/<\/រូប>/g, '</figure>');
}

/**
 * Normalizes markdown headings based on dictionary.
 */
function cleanHeadings(line, headingsDict) {
    const trimmed = line.trim();
    if (headingsDict[trimmed]) {
        return headingsDict[trimmed];
    }
    return line;
}

/**
 * Applies dictionary term replacements to markdown prose, avoiding YAML, code, and image filenames.
 */
function applyTermsToProse(text, termsDict, mistranslationsDict) {
    // Merge and sort terms by length descending so longer phrases match first
    const allReplacements = [];

    for (const [k, v] of Object.entries(mistranslationsDict || {})) {
        allReplacements.push({ find: k, replace: v, isRegex: false });
    }
    for (const [k, v] of Object.entries(termsDict || {})) {
        allReplacements.push({ find: k, replace: v, isRegex: false });
    }

    allReplacements.sort((a, b) => b.find.length - a.find.length);

    let res = text;

    for (const item of allReplacements) {
        if (!item.find) continue;

        // If English word, use word boundaries
        if (/^[a-zA-Z0-9_\s'\-]+$/.test(item.find)) {
            const escaped = item.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            // Avoid matching inside image wikilinks like ![[Konish Breaching.jpg]] or urls
            const regex = new RegExp(`(?<!\\[\\[[^\\]]*|!|\/|assets\/)\\b${escaped}\\b(?![^\\[]*\\]\\])`, 'g');
            res = res.replace(regex, item.replace);
        } else {
            // Khmer or punctuation-based replacement
            const escaped = item.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, 'g');
            res = res.replace(regex, item.replace);
        }
    }

    return res;
}

/**
 * Polishes a full markdown document.
 */
function polishDocument(content, dict) {
    const changes = [];
    let fmStr = '';
    let body = content;

    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (fmMatch) {
        fmStr = fmMatch[1];
        body = content.slice(fmMatch[0].length);
    }

    // 1. Polish Frontmatter
    let cleanedFm = fmStr;
    if (fmStr) {
        // Update review_status if present
        if (/review_status:\s*(needs-ai-polish|blank-scaffold)/.test(cleanedFm)) {
            cleanedFm = cleanedFm.replace(/review_status:\s*(needs-ai-polish|blank-scaffold)/, 'review_status: script-polished');
            changes.push({
                type: 'frontmatter',
                line: 1,
                oldText: 'review_status: needs-ai-polish',
                newText: 'review_status: script-polished'
            });
        }
    }

    // 2. Polish Body line by line
    const bodyLines = body.split('\n');
    const cleanedBodyLines = [];
    let inCodeBlock = false;

    for (let i = 0; i < bodyLines.length; i++) {
        let line = bodyLines[i];
        const originalLine = line;

        if (line.trim().startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            cleanedBodyLines.push(line);
            continue;
        }
        if (inCodeBlock) {
            cleanedBodyLines.push(line);
            continue;
        }

        // A. Heading replacement
        if (line.startsWith('#')) {
            line = cleanHeadings(line, dict.headings || {});
        }

        // B. Figure tags
        line = cleanFigureTags(line);

        // C. Khmer colons & punctuation
        line = cleanKhmerPunctuation(line);

        // D. Spaced bold & italics
        line = cleanSpacedBold(line);
        line = cleanSpacedItalics(line);

        // E. Terms & mistranslations
        line = applyTermsToProse(line, dict.terms || {}, dict.mistranslations || {});

        if (line !== originalLine) {
            changes.push({
                type: 'prose',
                line: (fmStr ? fmStr.split('\n').length + 2 : 0) + i + 1,
                oldText: originalLine.trim(),
                newText: line.trim()
            });
        }

        cleanedBodyLines.push(line);
    }

    let finalContent = '';
    if (fmStr) {
        finalContent = `---\n${cleanedFm}\n---\n${cleanedBodyLines.join('\n')}`;
    } else {
        finalContent = cleanedBodyLines.join('\n');
    }

    return {
        cleanedContent: finalContent,
        hasChanges: changes.length > 0,
        changes
    };
}

/**
 * Recursively scans directory and compiles polish plan.
 */
function scanAndPlanPolish(targetDir, dict) {
    const affectedFiles = [];
    let totalChanges = 0;

    function walk(d) {
        if (!fs.existsSync(d)) return;
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== 'public') {
                    walk(fullPath);
                }
            } else if (entry.name.endsWith('.md')) {
                const raw = fs.readFileSync(fullPath, 'utf-8');
                const result = polishDocument(raw, dict);
                if (result.hasChanges) {
                    totalChanges += result.changes.length;
                    affectedFiles.push({
                        filePath: fullPath,
                        relPath: path.relative(targetDir, fullPath).replace(/\\/g, '/'),
                        changes: result.changes,
                        cleanedContent: result.cleanedContent
                    });
                }
            }
        }
    }

    walk(targetDir);
    return { targetDir, totalChanges, affectedFiles };
}

/**
 * Creates companion .bak files and applies polished content.
 */
function applyPolishWithBackups(plan) {
    let written = 0;
    for (const f of plan.affectedFiles) {
        const bakPath = f.filePath + '.bak';
        // Always save .bak backup of original file
        fs.copyFileSync(f.filePath, bakPath);
        fs.writeFileSync(f.filePath, f.cleanedContent, 'utf-8');
        written++;
    }
    return written;
}

/**
 * Rollback: restores all .md.bak files to .md
 */
function restoreBackups(targetDir) {
    let restored = 0;
    function walk(d) {
        if (!fs.existsSync(d)) return;
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith('.md.bak')) {
                const targetMd = fullPath.slice(0, -4); // remove .bak
                fs.copyFileSync(fullPath, targetMd);
                fs.unlinkSync(fullPath);
                restored++;
                console.log(`  restored: ${path.relative(targetDir, targetMd)}`);
            }
        }
    }
    walk(targetDir);
    console.log(`\n[restore] Restored ${restored} file(s) from .bak companions.`);
    return restored;
}

/**
 * Clean backups: deletes all .md.bak files
 */
function cleanBackups(targetDir) {
    let cleaned = 0;
    function walk(d) {
        if (!fs.existsSync(d)) return;
        const entries = fs.readdirSync(d, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(d, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            } else if (entry.name.endsWith('.md.bak')) {
                fs.unlinkSync(fullPath);
                cleaned++;
            }
        }
    }
    walk(targetDir);
    console.log(`\n[clean-bak] Deleted ${cleaned} .bak file(s).`);
    return cleaned;
}

/**
 * Interactive CLI prompt for approval.
 */
async function promptApproval(plan, isAutoApprove = false) {
    console.log('');
    console.log('============================================================');
    console.log('           NOLHEIM KHMER BULK POLISH ENGINE                 ');
    console.log('============================================================');
    console.log(`Target: ${plan.targetDir}`);
    console.log(`Detected: ${plan.totalChanges} improvement(s) across ${plan.affectedFiles.length} file(s).`);
    console.log('');
    console.log('Sample previews:');

    let shown = 0;
    for (const f of plan.affectedFiles) {
        for (const c of f.changes) {
            if (shown < 5) {
                console.log(`  [${f.relPath}:${c.line}] (${c.type})`);
                console.log(`    - ${c.oldText}`);
                console.log(`    + ${c.newText}`);
                shown++;
            }
        }
        if (shown >= 5) break;
    }
    console.log('============================================================');

    if (isAutoApprove) {
        console.log('[polish] Auto-approving (--yes flag set).');
        return true;
    }

    if (!process.stdin.isTTY) {
        console.warn('[polish] Non-interactive environment: aborting to protect source vault.');
        return false;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

    try {
        let answer = await askQuestion('Apply bulk polish and create .bak backups? [Y/n/d] (d: show all diffs): ');
        answer = (answer || '').trim().toLowerCase();

        while (answer === 'd' || answer === 'details') {
            console.log('\n--- ALL PROPOSED IMPROVEMENTS ---');
            for (const f of plan.affectedFiles) {
                console.log(`\nFile: ${f.relPath}`);
                for (const c of f.changes) {
                    console.log(`  Line ${c.line} (${c.type}):`);
                    console.log(`    - ${c.oldText}`);
                    console.log(`    + ${c.newText}`);
                }
            }
            console.log('---------------------------------\n');
            answer = await askQuestion('Apply bulk polish and create .bak backups? [Y/n]: ');
            answer = (answer || '').trim().toLowerCase();
        }

        rl.close();

        if (answer === '' || answer === 'y' || answer === 'yes') {
            return true;
        } else {
            console.log('[polish] Polish cancelled by user. No files modified.');
            return false;
        }
    } catch (e) {
        rl.close();
        console.error('[polish] Error during prompt:', e);
        return false;
    }
}

// Main execution
(async () => {
    const args = process.argv.slice(2);
    const targetDir = args.find(a => !a.startsWith('-')) || DEFAULT_TARGET_DIR;

    if (args.includes('--help') || args.includes('-h')) {
        console.log(`
Usage: node polish-khmer.cjs [options] [targetDir]

Options:
  --dry-run       Preview changes without writing files or creating .bak backups
  --yes, -y       Auto-approve and apply changes immediately
  --restore-bak   Restore all original files from .bak companions
  --clean-bak     Delete all .bak companion files
  --help, -h      Show this help message
        `);
        process.exit(0);
    }

    if (args.includes('--restore-bak')) {
        restoreBackups(targetDir);
        process.exit(0);
    }

    if (args.includes('--clean-bak')) {
        cleanBackups(targetDir);
        process.exit(0);
    }

    console.log(`[polish] Scanning ${targetDir}...`);
    const dict = loadDictionary();
    const plan = scanAndPlanPolish(targetDir, dict);

    if (plan.totalChanges === 0) {
        console.log('[polish] All files in Nolheim-Khmer are already fully polished! Zero issues found.');
        process.exit(0);
    }

    if (args.includes('--dry-run')) {
        console.log(`\n[polish:dry-run] Found ${plan.totalChanges} improvements across ${plan.affectedFiles.length} file(s).`);
        for (const f of plan.affectedFiles) {
            console.log(`\nFile: ${f.relPath}`);
            f.changes.forEach(c => {
                console.log(`  Line ${c.line}:`);
                console.log(`    - ${c.oldText}`);
                console.log(`    + ${c.newText}`);
            });
        }
        console.log('\n[polish:dry-run] Dry-run complete. No files were modified.');
        process.exit(0);
    }

    const autoApprove = args.includes('--yes') || args.includes('-y') || process.env.NOLHEIM_AUTO_POLISH === '1';
    const approved = await promptApproval(plan, autoApprove);

    if (!approved) {
        process.exit(1);
    }

    const count = applyPolishWithBackups(plan);
    console.log(`\n[polish] SUCCESS: Polished ${count} file(s) with ${plan.totalChanges} improvement(s).`);
    console.log(`[polish] Companion '.bak' files were created for each modified file.`);
    console.log(`[polish] You can undo anytime with: node polish-khmer.cjs --restore-bak\n`);
    process.exit(0);
})();
