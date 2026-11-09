const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_ROOT = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim';
const CONTINUITIES_DIR = path.join(VAULT_ROOT, 'Continuities', 'Parialfare - Reimagined');
const PUBLISH_DIR = path.join(VAULT_ROOT, 'Publish', 'Parialfare - Reimagined');

function hashFile(filePath) {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(buf).digest('hex');
}

function isSystemEntity(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fm) return false;
        return /^entity-type:\s*['"]?system['"]?\s*$/m.test(fm[1]);
    } catch (e) {
        return false;
    }
}

function walkDir(dir) {
    const result = new Map();
    if (!fs.existsSync(dir)) return result;
    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        const full = path.join(dir, rel);
        let entries;
        try { entries = fs.readdirSync(full); } catch (e) { continue; }
        for (const entry of entries) {
            const entryFull = path.join(full, entry);
            const entryRel = rel ? rel + '/' + entry : entry;
            const stat = fs.statSync(entryFull);
            if (stat.isDirectory()) {
                stack.push(entryRel);
            } else if (entry.endsWith('.md')) {
                result.set(entryRel, {
                    fullPath: entryFull,
                    size: stat.size,
                    hash: hashFile(entryFull)
                });
            }
        }
    }
    return result;
}

function main() {
    const summaryMode = process.argv.includes('--summary');
    const upstream = walkDir(CONTINUITIES_DIR);
    const published = walkDir(PUBLISH_DIR);

    const modified = [];
    const newUpstream = [];
    const publishOnly = [];

    for (const [rel, upInfo] of upstream.entries()) {
        if (!published.has(rel)) {
            newUpstream.push(rel);
        } else {
            const pubInfo = published.get(rel);
            if (upInfo.hash !== pubInfo.hash) {
                modified.push(rel);
            }
        }
    }

    for (const [rel, pubInfo] of published.entries()) {
        if (!upstream.has(rel)) {
            if (!isSystemEntity(pubInfo.fullPath)) {
                publishOnly.push(rel);
            }
        }
    }

    modified.sort();
    newUpstream.sort();
    publishOnly.sort();

    if (summaryMode) {
        if (modified.length === 0 && newUpstream.length === 0 && publishOnly.length === 0) {
            console.log('in sync (0 unpromoted changes)');
        } else {
            const parts = [];
            if (modified.length > 0) parts.push(modified.length + ' modified');
            if (newUpstream.length > 0) parts.push(newUpstream.length + ' new');
            if (publishOnly.length > 0) parts.push(publishOnly.length + ' drift');
            console.log(parts.join(', '));
        }
        return;
    }

    console.log('================================================================');
    console.log('  NOLHEIM DRIFT CHECK (Writing Room vs Published Showroom)');
    console.log('================================================================');
    console.log('');

    console.log('1. MODIFIED ARTICLES IN CONTINUITIES (' + modified.length + '):');
    if (modified.length === 0) {
        console.log('   (None - all published articles match your writing room)');
    } else {
        for (const f of modified) console.log('   * ' + f);
    }
    console.log('');

    console.log('2. NEW UNPUBLISHED ARTICLES IN CONTINUITIES (' + newUpstream.length + '):');
    if (newUpstream.length === 0) {
        console.log('   (None - every article in Continuities has been published)');
    } else {
        for (const f of newUpstream) console.log('   + ' + f);
    }
    console.log('');

    if (publishOnly.length > 0) {
        console.log('3. WARNING - FILES ONLY IN PUBLISH (' + publishOnly.length + '):');
        for (const f of publishOnly) console.log('   ! ' + f);
        console.log('');
    }
}

main();
