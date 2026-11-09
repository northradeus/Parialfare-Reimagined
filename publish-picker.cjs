// Publish Picker — lets the Creator choose which pages to publish without an agent.
//
//   node publish-picker.cjs prepare   -> writes private/Publish-Picker.txt (the form opened in Notepad)
//   node publish-picker.cjs finish    -> reads the saved form and writes Promote-Request.json
//
// Exit codes: 0 = continue, 2 = nothing to do / cancelled (not an error), 1 = real error.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_ROOT = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim';
const CONTINUITIES_DIR = path.join(VAULT_ROOT, 'Continuities', 'Parialfare - Reimagined');
const PUBLISH_DIR = path.join(VAULT_ROOT, 'Publish', 'Parialfare - Reimagined');
const PRIVATE_DIR = path.join(__dirname, 'private'); // git-ignored, so the form is never deployed
const FORM = path.join(PRIVATE_DIR, 'Publish-Picker.txt');
const REQUEST = path.join(__dirname, 'Promote-Request.json');

const PUBLIC_START = '---- UPDATE NOTE (shown on the website) ----';
const PRIVATE_START = '---- PRIVATE NOTE (your records only, optional) ----';
const END = '---- END ----';
const ALL_LABEL = 'PUBLISH EVERY PAGE LISTED BELOW';

function hashFile(p) {
    return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function walk(dir) {
    const out = new Map();
    if (!fs.existsSync(dir)) return out;
    const stack = [''];
    while (stack.length) {
        const rel = stack.pop();
        let entries;
        try { entries = fs.readdirSync(path.join(dir, rel)); } catch (e) { continue; }
        for (const name of entries) {
            const r = rel ? rel + '/' + name : name;
            const full = path.join(dir, r);
            const st = fs.statSync(full);
            if (st.isDirectory()) stack.push(r);
            else if (name.endsWith('.md')) out.set(r, full);
        }
    }
    return out;
}

function changedPages() {
    const up = walk(CONTINUITIES_DIR);
    const pub = walk(PUBLISH_DIR);
    const list = [];
    for (const [rel, full] of up) {
        if (!pub.has(rel)) list.push({ kind: 'NEW', rel });
        else if (hashFile(full) !== hashFile(pub.get(rel))) list.push({ kind: 'CHANGED', rel });
    }
    list.sort((a, b) => a.rel.localeCompare(b.rel));
    return list;
}

function prepare() {
    const pages = changedPages();
    if (pages.length === 0) {
        console.log('');
        console.log('  Nothing to publish. Every page in your writing room is already live.');
        process.exit(2);
    }

    const L = [];
    L.push('NOLHEIM - PUBLISH PAGES');
    L.push('==================================================================');
    L.push('');
    L.push('STEP 1 - Choose the pages to publish.');
    L.push('  Put an x between the brackets, like this:  [x]');
    L.push('  Leave [ ] empty for pages that are not ready yet.');
    L.push('');
    L.push('[ ] ' + ALL_LABEL);
    L.push('');
    for (const p of pages) {
        L.push('[ ] ' + (p.kind === 'NEW' ? 'NEW      ' : 'CHANGED  ') + p.rel);
    }
    L.push('');
    L.push('STEP 2 - Write the update note for the website\'s Update Log.');
    L.push('  Write between the two lines below. As many lines as you like.');
    L.push('');
    L.push(PUBLIC_START);
    L.push('');
    L.push(END);
    L.push('');
    L.push('STEP 3 - (Optional) A private note for your own publishing log.');
    L.push('');
    L.push(PRIVATE_START);
    L.push('');
    L.push(END);
    L.push('');
    L.push('WHEN YOU ARE DONE: Save (Ctrl+S), then close Notepad.');
    L.push('TO CANCEL: close Notepad without ticking any pages.');
    L.push('');

    fs.mkdirSync(PRIVATE_DIR, { recursive: true });
    fs.writeFileSync(FORM, L.join('\r\n'), 'utf-8');
    console.log('');
    console.log('  ' + pages.length + ' page(s) have changes. Opening the publish form in Notepad...');
}

function between(lines, startMarker) {
    const s = lines.findIndex(l => l.trim() === startMarker);
    if (s === -1) return '';
    const out = [];
    for (let i = s + 1; i < lines.length; i++) {
        if (lines[i].trim() === END) break;
        out.push(lines[i]);
    }
    return out.join('\n').trim();
}

function cancel(msg) {
    console.log('');
    console.log('  ' + msg);
    console.log('  Nothing was published.');
    try { fs.unlinkSync(FORM); } catch (e) {}
    process.exit(2);
}

function finish() {
    if (!fs.existsSync(FORM)) cancel('The publish form was not found.');
    const text = fs.readFileSync(FORM, 'utf-8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/);

    const ticked = (line) => /^\s*\[\s*[^\s\]]+\s*\]/.test(line);
    const allTicked = lines.some(l => ticked(l) && l.includes(ALL_LABEL));

    const valid = new Map(changedPages().map(p => [p.rel, p.kind]));
    const chosen = [];
    for (const line of lines) {
        const m = line.match(/^\s*\[\s*([^\]]*)\s*\]\s+(NEW|CHANGED)\s+(.+?)\s*$/);
        if (!m) continue;
        const rel = m[3];
        if (!valid.has(rel)) continue; // ignore anything edited or no longer changed
        if (allTicked || (m[1] && m[1].trim())) chosen.push({ kind: valid.get(rel), rel });
    }

    if (chosen.length === 0) cancel('No pages were ticked.');

    const publicNote = between(lines, PUBLIC_START);
    const privateNote = between(lines, PRIVATE_START);
    if (!publicNote) cancel('The update note (Step 2) was empty. The website log needs a sentence or two.');

    const summary = chosen.map(p => '- `' + p.rel + '`: ' + (p.kind === 'NEW' ? 'New page.' : 'Updated.')).join('\n')
        + (privateNote ? '\n\n' + privateNote : '');

    const request = {
        files: chosen.map(p => p.rel),
        log_summary: summary,
        site_log: publicNote
    };
    fs.writeFileSync(REQUEST, JSON.stringify(request, null, 2), 'utf-8');
    try { fs.unlinkSync(FORM); } catch (e) {}

    console.log('');
    console.log('  Ready to publish ' + chosen.length + ' page(s):');
    for (const p of chosen) console.log('    ' + (p.kind === 'NEW' ? '+ ' : '* ') + p.rel);
}

const mode = process.argv[2];
try {
    if (mode === 'prepare') prepare();
    else if (mode === 'finish') finish();
    else { console.error('Usage: node publish-picker.cjs prepare|finish'); process.exit(1); }
} catch (e) {
    console.error('');
    console.error('ERROR: ' + e.message);
    process.exit(1);
}
