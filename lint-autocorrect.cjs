/**
 * lint-autocorrect.cjs
 * 
 * Detects and autocorrects common Markdown syntax defects, including:
 * 1. Spaced bold delimiters: `** text **`, `** text**`, `**text **` -> `**text**`
 * 2. Spaced italics delimiters: `* text *`, `* text*`, `*text *` -> `*text*`
 * 3. Khmer LLM translation figure tags: `<រូប>` / `</រូប>` -> `<figure>` / `</figure>`
 * 4. Punctuation/colon spacing inside bold: `** ឈ្មោះ៖ **` -> `**ឈ្មោះ៖**`
 *
 * Can be run standalone or imported into build-content.cjs / promote.cjs.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

/**
 * Normalizes spaced bold syntax in text.
 * e.g., "** text **" -> "**text**"
 */
function cleanSpacedBold(text) {
    return text.replace(/(?<!\*)\*\*(?!\*)(\s*[^\*\n]+?\s*)\*\*(?!\*)/g, (match, inner) => {
        if (/^\s/.test(inner) || /\s$/.test(inner)) {
            // Trim inner spaces while preserving the enclosed text
            return '**' + inner.trim() + '**';
        }
        return match;
    });
}

/**
 * Normalizes spaced italics syntax in text.
 * Avoids bullet points (- * item) and math multiplication (2 * 3).
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
 * Replaces Khmer-translated <រូប> tags with proper HTML <figure> tags.
 */
function cleanKhmerTags(text) {
    return text.replace(/<រូប>/g, '<figure>').replace(/<\/រូប>/g, '</figure>');
}

/**
 * Cleans a markdown string and returns the cleaned text along with detailed change logs.
 */
function lintMarkdownText(rawText, filePath = '') {
    const changes = [];
    const rawLines = rawText.split('\n');
    const cleanLines = [];
    let hasChanges = false;

    for (let i = 0; i < rawLines.length; i++) {
        let line = rawLines[i];
        let originalLine = line;

        // 1. Tag corrections
        if (line.includes('<រូប>') || line.includes('</រូប>')) {
            const afterTag = cleanKhmerTags(line);
            if (afterTag !== line) {
                changes.push({
                    type: 'tag',
                    line: i + 1,
                    oldText: line.trim(),
                    newText: afterTag.trim()
                });
                line = afterTag;
                hasChanges = true;
            }
        }

        // 2. Bold corrections
        const afterBold = cleanSpacedBold(line);
        if (afterBold !== line) {
            changes.push({
                type: 'bold',
                line: i + 1,
                oldText: line.trim(),
                newText: afterBold.trim()
            });
            line = afterBold;
            hasChanges = true;
        }

        // 3. Italics corrections
        const afterItalics = cleanSpacedItalics(line);
        if (afterItalics !== line) {
            changes.push({
                type: 'italics',
                line: i + 1,
                oldText: line.trim(),
                newText: afterItalics.trim()
            });
            line = afterItalics;
            hasChanges = true;
        }

        cleanLines.push(line);
    }

    return {
        cleanedText: cleanLines.join('\n'),
        hasChanges,
        changes
    };
}

/**
 * Recursively scans a directory for Markdown files and detects syntax issues.
 */
function scanDirectory(dir) {
    const affectedFiles = [];
    let totalIssues = 0;
    const categories = { bold: 0, italics: 0, tag: 0 };

    function walk(currentDir) {
        if (!fs.existsSync(currentDir)) return;
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== 'public') {
                    walk(fullPath);
                }
            } else if (entry.name.endsWith('.md')) {
                const raw = fs.readFileSync(fullPath, 'utf-8');
                const result = lintMarkdownText(raw, fullPath);
                if (result.hasChanges) {
                    result.changes.forEach(c => {
                        totalIssues++;
                        if (categories[c.type] !== undefined) categories[c.type]++;
                        else categories[c.type] = 1;
                    });
                    affectedFiles.push({
                        filePath: fullPath,
                        relPath: path.relative(dir, fullPath).replace(/\\/g, '/'),
                        changes: result.changes,
                        cleanedText: result.cleanedText
                    });
                }
            }
        }
    }

    walk(dir);
    return {
        targetDir: dir,
        totalIssues,
        categories,
        affectedFiles
    };
}

/**
 * Interactively prompts the user for approval to apply autocorrects.
 * Returns a Promise that resolves to true (approved) or false (declined).
 */
async function promptApproval(scanResult, options = {}) {
    if (!scanResult || scanResult.totalIssues === 0) {
        return true;
    }

    const isAutoApprove = options.autoApprove ||
        process.argv.includes('--yes') ||
        process.argv.includes('-y') ||
        process.env.NOLHEIM_AUTO_CORRECT === '1';

    console.log('');
    console.log('============================================================');
    console.log('         MARKDOWN SYNTAX LINT & AUTOCORRECT DETECTOR        ');
    console.log('============================================================');
    console.log(`Detected ${scanResult.totalIssues} issue(s) in ${scanResult.affectedFiles.length} file(s):`);
    if (scanResult.categories.bold) console.log(`  - Spaced bold (** text **): ${scanResult.categories.bold}`);
    if (scanResult.categories.italics) console.log(`  - Spaced italics (* text *): ${scanResult.categories.italics}`);
    if (scanResult.categories.tag) console.log(`  - Translation figure tags (<រូប>): ${scanResult.categories.tag}`);
    console.log('');
    console.log('Sample previews:');

    let previewCount = 0;
    for (const file of scanResult.affectedFiles) {
        for (const c of file.changes) {
            if (previewCount < 4) {
                console.log(`  [${file.relPath}:${c.line}] (${c.type})`);
                console.log(`    - ${c.oldText}`);
                console.log(`    + ${c.newText}`);
                previewCount++;
            }
        }
        if (previewCount >= 4) break;
    }
    console.log('============================================================');

    if (isAutoApprove) {
        console.log('[lint] Auto-approving autocorrects (--yes / NOLHEIM_AUTO_CORRECT=1).');
        return true;
    }

    // Check if terminal is non-interactive
    if (!process.stdin.isTTY) {
        if (process.env.NOLHEIM_FORCE_BUILD === '1') {
            console.warn('[lint] Non-interactive environment: auto-approving because NOLHEIM_FORCE_BUILD=1.');
            return true;
        }
        console.warn('[lint] Non-interactive terminal: autocorrect prompt cannot ask for input. Aborting.');
        return false;
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

    try {
        let answer = await askQuestion('Apply autocorrects to staging? [Y/n/d] (d: show all diffs): ');
        answer = (answer || '').trim().toLowerCase();

        while (answer === 'd' || answer === 'details') {
            console.log('\n--- ALL DETECTED DIFFS ---');
            for (const file of scanResult.affectedFiles) {
                console.log(`\nFile: ${file.relPath}`);
                for (const c of file.changes) {
                    console.log(`  Line ${c.line} (${c.type}):`);
                    console.log(`    - ${c.oldText}`);
                    console.log(`    + ${c.newText}`);
                }
            }
            console.log('--------------------------\n');
            answer = await askQuestion('Apply autocorrects to staging? [Y/n]: ');
            answer = (answer || '').trim().toLowerCase();
        }

        rl.close();

        if (answer === '' || answer === 'y' || answer === 'yes') {
            return true;
        } else {
            console.log('[lint] Autocorrect declined by user.');
            return false;
        }
    } catch (e) {
        rl.close();
        console.error('[lint] Error during approval prompt:', e);
        return false;
    }
}

/**
 * Writes cleaned content to files in the scanned directory.
 */
function applyAutocorrects(scanResult) {
    if (!scanResult || scanResult.affectedFiles.length === 0) return 0;
    let written = 0;
    for (const file of scanResult.affectedFiles) {
        fs.writeFileSync(file.filePath, file.cleanedText, 'utf-8');
        written++;
    }
    return written;
}

// Standalone execution
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const targetArg = args.find(a => !a.startsWith('-'));
        const defaultDir = targetArg || path.join(__dirname, 'content');
        
        console.log(`[lint] Scanning directory: ${defaultDir}...`);
        const result = scanDirectory(defaultDir);

        if (result.totalIssues === 0) {
            console.log('[lint] All clean! No Markdown syntax defects detected.');
            process.exit(0);
        }

        const approved = await promptApproval(result);
        if (!approved) {
            console.log('[lint] Aborted.');
            process.exit(1);
        }

        if (args.includes('--dry-run')) {
            console.log('[lint] Dry run complete. No files modified.');
            process.exit(0);
        }

        const count = applyAutocorrects(result);
        console.log(`[lint] Successfully autocorrected ${result.totalIssues} issue(s) across ${count} file(s).`);
        process.exit(0);
    })();
}

module.exports = {
    cleanSpacedBold,
    cleanSpacedItalics,
    cleanKhmerTags,
    lintMarkdownText,
    scanDirectory,
    promptApproval,
    applyAutocorrects
};
