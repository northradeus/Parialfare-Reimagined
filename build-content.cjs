const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const cliArgs = process.argv.slice(2);
const targetMode = cliArgs.includes('--km') ? 'km' : (cliArgs.includes('--en') ? 'en' : 'all');

// Override these paths on another machine with:
//   NOLHEIM_SOURCE_DIR="C:/path/to/Parialfare - Reimagined"
//   NOLHEIM_ASSETS_DIR="C:/path/to/Images"
//   NOLHEIM_KM_DIR="C:/path/to/Nolheim-Khmer"
let sourceDir = process.env.NOLHEIM_SOURCE_DIR
    || 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Publish\\Parialfare - Reimagined';
const sourceAssets = process.env.NOLHEIM_ASSETS_DIR
    || 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Assets\\Images';
const kmSourceDir = process.env.NOLHEIM_KM_DIR
    || 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim-Khmer';

const finalDir = path.join(__dirname, 'content');
const destDir = path.join(__dirname, '.content-staging');
const backupDir = path.join(__dirname, '.content-previous');
const destAssets = path.join(destDir, 'assets');

// Validate inputs BEFORE deleting the previous generated site.
if (targetMode !== 'km' && (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory())) {
    console.error(`[content] Source vault directory does not exist: ${sourceDir}`);
    console.error('[content] Set NOLHEIM_SOURCE_DIR to the correct vault directory.');
    process.exit(1);
}

if (!fs.existsSync(sourceAssets) || !fs.statSync(sourceAssets).isDirectory()) {
    console.warn(`[assets] Image directory not found: ${sourceAssets}`);
    console.warn('[assets] Continuing without copied image assets.');
}

// Integrity check: Publish/ must match the latest snapshot.
function validatePublishIntegrity() {
    if (targetMode === 'km') return;
    const publishRoot = path.dirname(sourceDir);
    const vaultRoot = path.dirname(publishRoot);
    const snapshotsDir = path.join(vaultRoot, 'Archives', 'Publish snapshots');
    if (!fs.existsSync(snapshotsDir)) return;
    const snaps = fs.readdirSync(snapshotsDir).filter(e => /^v\d{3}-/.test(e)).sort().reverse();
    if (snaps.length === 0) return;
    const latestSnapName = snaps[0];
    const latestSnapDir = path.join(snapshotsDir, latestSnapName);
    function walk(dir) {
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
                if (stat.isDirectory()) stack.push(entryRel);
                else result.set(entryRel, crypto.createHash('sha256').update(fs.readFileSync(entryFull)).digest('hex'));
            }
        }
        return result;
    }
    const current = walk(publishRoot);
    const snapshot = walk(latestSnapDir);
    const diffs = [];
    for (const [rel, hash] of current) {
        if (!snapshot.has(rel)) diffs.push(rel + ' (added since snapshot)');
        else if (snapshot.get(rel) !== hash) diffs.push(rel + ' (changed since snapshot)');
    }
    for (const rel of snapshot.keys()) if (!current.has(rel)) diffs.push(rel + ' (removed since snapshot)');
    if (diffs.length === 0) return;
    if (process.env.NOLHEIM_FORCE_BUILD === '1') {
        console.warn('[integrity] WARNING: Publish/ differs from ' + latestSnapName + '. Bypassing (NOLHEIM_FORCE_BUILD=1).');
        for (const d of diffs) console.warn('  ' + d);
        return;
    }
    console.error('[integrity] ERROR: Publish/ differs from latest snapshot ' + latestSnapName + ':');
    for (const d of diffs) console.error('  ' + d);
    console.error('[integrity] Use Promote.bat, or set NOLHEIM_FORCE_BUILD=1 to bypass.');
    process.exit(1);
}

validatePublishIntegrity();

const previewOverlayDir = path.join(__dirname, '.publish-preview');
if (fs.existsSync(previewOverlayDir)) {
    fs.rmSync(previewOverlayDir, { recursive: true, force: true });
}
const promoteReqPath = path.join(__dirname, 'Promote-Request.json');
if (process.env.NOLHEIM_FORCE_BUILD === '1' && fs.existsSync(promoteReqPath)) {
    try {
        const req = JSON.parse(fs.readFileSync(promoteReqPath, 'utf-8'));
        const continuitiesDir = path.join(path.dirname(path.dirname(sourceDir)), 'Continuities', path.basename(sourceDir));
        if (Array.isArray(req.files) && req.files.length > 0 && fs.existsSync(continuitiesDir)) {
            fs.cpSync(sourceDir, previewOverlayDir, { recursive: true });
            for (const rel of req.files) {
                const srcFile = path.join(continuitiesDir, rel);
                const dstFile = path.join(previewOverlayDir, rel);
                if (fs.existsSync(srcFile)) {
                    fs.mkdirSync(path.dirname(dstFile), { recursive: true });
                    fs.copyFileSync(srcFile, dstFile);
                }
            }
            console.log(`[preview] Overlaying ${req.files.length} pending promotion file(s) from Continuities.`);
            sourceDir = previewOverlayDir;
        }
    } catch (e) {
        console.warn('[preview] Could not apply Promote-Request.json overlay: ' + e.message);
    }
}

if (fs.existsSync(destDir)) {
    fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(destAssets, { recursive: true });
fs.writeFileSync(path.join(destDir, '.nojekyll'), '');

const assetName = (name) => {
    const ext = path.extname(name).toLowerCase();
    const base = path.basename(name, path.extname(name))
        .normalize('NFKD')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9_-]/g, '');
    return base + ext;
};

function parseImageField(raw) {
    const m = raw.match(/\[\[([^\]|,]+)/)
           || raw.match(/^\s*["']?([^"'\n,]+)/);
    return m ? path.basename(m[1].trim()) : '';
}

const vaultImages = new Map();
if (fs.existsSync(sourceAssets) && fs.statSync(sourceAssets).isDirectory()) {
    const walkAssets = (dir) => {
        for (const file of fs.readdirSync(dir)) {
            const srcPath = path.join(dir, file);
            if (fs.statSync(srcPath).isDirectory()) {
                walkAssets(srcPath);
            } else {
                const outName = assetName(file);
                // Register under multiple keys so lookups succeed regardless of format
                vaultImages.set(file.toLowerCase(), outName);
                vaultImages.set(outName.toLowerCase(), outName);
                if (!fs.existsSync(path.join(destAssets, outName))) {
                    fs.copyFileSync(srcPath, path.join(destAssets, outName));
                }
            }
        }
    };
    walkAssets(sourceAssets);
}

const ignoreKeys = ['tags', 'entity-type', 'character-type', 'faction-type', 'location-type', 'concept-type', 'country-type', 'UID', 'continuity', 'subject', 'status', 'image', 'layout', 'aliases', 'alias'];

const articlePaths = [];

// --- Stage 3: Related Entities Pre-Scan ---
const resolvers = {};
const articlesForRelations = [];
const reverseLinks = {};

function normalizeKey(str) {
    return str.toLowerCase().replace(/['']/g, "'").replace(/\s+/g, ' ').trim();
}

function extractWikilinkTargets(val) {
    const targets = [];
    const regex = /\[\[([^\]|]+)/g;
    let match;
    while ((match = regex.exec(val)) !== null) {
        targets.push(match[1].trim());
    }
    return targets;
}

function preScanRelations(dir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            preScanRelations(fullPath);
        } else if (item.endsWith('.md') && item !== 'index.md') {
            const content = fs.readFileSync(fullPath, 'utf-8');
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!fmMatch) continue;
            const relOutPath = path.relative(sourceDir, fullPath).replace(/\\/g, '/').replace('.md', '').toLowerCase().replace(/ /g, '-');
            let title = item.replace('.md', '');
            const fields = { factions: [], part_of: [], location: [] };
            for (const line of fmMatch[1].split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('title:')) {
                    title = trimmed.substring(6).trim().replace(/^['"]|['"]$/g, '');
                }
                for (const field of ['factions', 'part_of', 'location']) {
                    if (trimmed.startsWith(field + ':')) {
                        const val = trimmed.substring(field.length + 1).trim();
                        fields[field] = extractWikilinkTargets(val);
                    }
                }
            }
            articlesForRelations.push({ slug: relOutPath, title, fields });
            const titleKey = normalizeKey(title);
            const fileNameKey = normalizeKey(item.replace('.md', ''));
            if (titleKey && !resolvers[titleKey]) resolvers[titleKey] = relOutPath;
            if (fileNameKey && !resolvers[fileNameKey]) resolvers[fileNameKey] = relOutPath;

            // Also register aliases in resolvers
            for (const line of fmMatch[1].split('\n')) {
                const trimmed = line.trim();
                if (trimmed.startsWith('aliases:') || trimmed.startsWith('alias:')) {
                    const m = trimmed.match(/\[(.*?)\]/);
                    if (m) {
                        const list = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                        for (const a of list) {
                            const aKey = normalizeKey(a);
                            if (aKey && !resolvers[aKey]) resolvers[aKey] = relOutPath;
                        }
                    }
                }
            }
        }
    }
}

if (targetMode !== 'km' && fs.existsSync(sourceDir)) {
    preScanRelations(sourceDir);
}

function preScanKhmerRelations(kmDir) {
    if (!fs.existsSync(kmDir)) return;
    function walk(currentDir) {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name === 'System' || entry.name === 'Assets' || entry.name.startsWith('.')) continue;
                walk(full);
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                let rel = path.relative(kmDir, full).replace(/\\/g, '/');
                let relOutPath = '';
                if (entry.name === 'index.md' && currentDir === kmDir) {
                    relOutPath = 'km';
                } else {
                    rel = rel.replace(/\.md$/, '').replace(/^dossiers\//i, '').toLowerCase().replace(/\s+/g, '-');
                    relOutPath = `km/${rel}`;
                }
                const content = fs.readFileSync(full, 'utf8');
                const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                let title = entry.name.replace('.md', '');
                if (fmMatch) {
                    for (const line of fmMatch[1].split('\n')) {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('title:')) {
                            title = trimmed.slice(6).trim().replace(/^['"]|['"]$/g, '');
                        }
                        if (trimmed.startsWith('aliases:') || trimmed.startsWith('alias:')) {
                            const m = trimmed.match(/\[(.*?)\]/);
                            if (m) {
                                const list = m[1].split(',').map(s => s.trim().replace(/^['"]|['"]$/g, ''));
                                for (const a of list) {
                                    const aKey = normalizeKey(a);
                                    if (aKey) resolvers[aKey] = relOutPath;
                                }
                            }
                        }
                    }
                }
                const titleKey = normalizeKey(title);
                if (titleKey) resolvers[titleKey] = relOutPath;
                const baseKey = normalizeKey(entry.name.replace('.md', ''));
                if (baseKey && !resolvers[baseKey]) resolvers[baseKey] = relOutPath;
            }
        }
    }
    walk(kmDir);
}

if (targetMode !== 'en' && fs.existsSync(kmSourceDir)) {
    preScanKhmerRelations(kmSourceDir);
}

for (const article of articlesForRelations) {
    for (const field of ['factions', 'part_of', 'location']) {
        for (const target of article.fields[field]) {
            const targetSlug = resolvers[normalizeKey(target)];
            if (!targetSlug || targetSlug === article.slug) continue;
            if (!reverseLinks[targetSlug]) reverseLinks[targetSlug] = [];
            if (reverseLinks[targetSlug].some(r => r.slug === article.slug && r.field === field)) continue;
            reverseLinks[targetSlug].push({ title: article.title, slug: article.slug, field });
        }
    }
}

console.log(`[relations] Indexed ${articlesForRelations.length} articles, built reverse links for ${Object.keys(reverseLinks).length} targets.`);

function renderRelatedEntities(currentSlug, rels) {
    const grouped = { factions: [], part_of: [], location: [] };
    for (const r of rels) { if (grouped[r.field]) grouped[r.field].push(r); }
    const labels = { factions: 'Associated Characters', part_of: 'Sub-Organizations', location: 'Related Events' };
    let html = '\n\n<section class="related-entities">\n<h2>Related Entities</h2>\n';
    for (const field of ['factions', 'part_of', 'location']) {
        if (grouped[field].length === 0) continue;
        html += `<div class="rel-group">\n<h3>${labels[field]}</h3>\n<ul>\n`;
        for (const r of grouped[field]) {
            html += `<li><a href="/${r.slug}">${r.title}</a></li>\n`;
        }
        html += '</ul>\n</div>\n';
    }
    html += '</section>\n';
    return html;
}

function resolveWikilinks(text, contextFile = '') {
    // Handles all three forms: [[Foo]], [[Foo|Bar]], [[Foo\|Bar]]
    // Group 1 = target, Group 2 = optional alias (with or without escaped pipe)
    // Uses negative lookbehind (?<!\!) to ignore markdown image embeds like ![[Foo]]
    return text.replace(/(?<!\!)\[\[([^\]|\\]+?)(?:\\?\|([^\]]+))?\]\]/g, (match, target, alias) => {
        if (!target) return match;
        const slug = resolvers[normalizeKey(target.trim())];
        const display = (alias || target).trim();
        if (!slug) {
            if (contextFile) console.warn(`[wikilink] unresolved target "${target.trim()}" in ${contextFile}`);
            return display;
        }
        const cleanSlug = slug.startsWith('/') ? slug : '/' + slug;
        return `[${display}](${cleanSlug})`;
    });
}

function resolveInfoboxWikilinks(text, contextFile = '') {
    return text.replace(/(?<!\!)\[\[([^\]|\\]+?)(?:\\?\|([^\]]+))?\]\]/g, (match, target, alias) => {
        if (!target) return match;
        const slug = resolvers[normalizeKey(target.trim())];
        const display = (alias || target).trim();
        if (!slug) {
            if (contextFile) console.warn(`[wikilink] unresolved target "${target.trim()}" in ${contextFile} (infobox)`);
            return display;
        }
        const cleanSlug = slug.startsWith('/') ? slug : '/' + slug;
        return `<a href="${cleanSlug}">${display}</a>`;
    });
}

function processDir(dir, outDir) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        const outPath = path.join(outDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
            fs.mkdirSync(outPath, { recursive: true });
            processDir(fullPath, outPath);
        } else if (item.endsWith('.md')) {
            // Record article path for Random Article
            const relPath = path.relative(destDir, outPath).replace(/\\/g, '/').replace('.md', '').toLowerCase().replace(/ /g, '-');
            articlePaths.push(relPath);

            let content = fs.readFileSync(fullPath, 'utf-8');
            
            content = content.replace(/â€“/g, '–').replace(/â€”/g, '—').replace(/â€™/g, "'").replace(/â€œ/g, '"').replace(/â€\x9d/g, '"');
            content = content.replace(/^\*?From Wikipedia, the free encyclopedia\*?\s*$/gm, '');
            content = content.replace(/\n# Chronicler Infobox Layout Rules\nlayout:[\s\S]*?\n---\n/g, '\n---\n');
            
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
            if (fmMatch) {
                let yaml = fmMatch[1];
                let body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
                
                let title = '';
                let entityType = 'concept';
                let imgName = '';
                let infoRows = '';

                const lines = yaml.split('\n');
                let inMultiline = false;

                for (let line of lines) {
                    line = line.trimEnd();
                    if (!line || line.startsWith('#')) continue;

                    if (inMultiline) {
                        if (line.startsWith('  - ')) continue;
                        else inMultiline = false;
                    }

                    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)/);
                    if (match) {
                        const key = match[1];
                        let val = match[2].trim();

                        if (key === 'title') title = val.replace(/"/g, '');
                        if (key === 'entity-type') entityType = val.toLowerCase().replace(/['"]/g, '');
                        if (key === 'image') imgName = parseImageField(val);

                        if (ignoreKeys.includes(key)) continue;

                        if (val === '|') {
                            inMultiline = true;
                            continue;
                        }

                        // Handle YAML array syntax first: ["a", "b"] -> a, b
                        if (val.startsWith('[') && !val.startsWith('[[') && val.endsWith(']')) {
                            val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).join(', ');
                        }
                        val = val.replace(/^["']|["']$/g, '');
                        
                        let valClass = '';
                        const lowerVal = val.toLowerCase();
                        if (lowerVal === 'tbd') valClass = 'val-tbd';
                        else if (lowerVal === 'unknown') valClass = 'val-unknown';
                        else if (lowerVal === 'none') valClass = 'val-none';
                        else if (lowerVal === 'undefined') valClass = 'val-undefined';

                        val = resolveInfoboxWikilinks(val, item);

                        if (val) {
                            const displayKey = key.replace(/-/g, ' ').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                            const valSpan = valClass ? `<span class="${valClass}">${val}</span>` : val;
                            infoRows += `<tr><th>${displayKey}</th><td>${valSpan}</td></tr>\n`;
                        }
                    }
                }

                let infobox = '';
                if (infoRows || imgName) {
                    infobox = `<aside class="custom-infobox infobox-${entityType}">\n`;
                    if (title) infobox += `<h3>${title}</h3>\n`;
                    if (imgName) {
                        const mappedName = vaultImages.get(imgName.toLowerCase()) || assetName(imgName);
                        infobox += `<img src="assets/${mappedName}" alt="${title}" />\n`;
                    }
                    if (infoRows) infobox += `<table>\n${infoRows}</table>\n`;
                    infobox += `</aside>\n`;
                }

                const relAssetsPath = 'assets';

                body = body.replace(/(<div\s+class="[^"]*\b(?:gallery|carousel)\b[^"]*"[^>]*>[\s\S]*?<\/div>|<figure\b[^>]*>[\s\S]*?<\/figure>)/g, (block) => {
                    return block.replace(/!\[\[([^\]]+)\]\]/g, (match, rawInner) => {
                        const imgName = rawInner.split('|')[0].trim();
                        const mapped = vaultImages.get(imgName.toLowerCase());
                        if (mapped) return `<img src="${relAssetsPath}/${mapped}" alt="${imgName}" loading="lazy" />`;
                        return match;
                    });
                });

                body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, rawInner) => {
                    const imgName = rawInner.split('|')[0].trim();
                    const mapped = vaultImages.get(imgName.toLowerCase());
                    if (mapped) return `![${imgName}](${relAssetsPath}/${mapped})`;
                    return match;
                });

                body = body.replace(/(<img[^>]+src=")(?!\/|http|data:)([^"]+)(")/g, (match, p1, srcAttr, p3) => {
                    const imgName = srcAttr.split('/').pop().trim();
                    const mapped = vaultImages.get(imgName.toLowerCase());
                    if (mapped) return `${p1}${relAssetsPath}/${mapped}${p3}`;
                    return match;
                });

                body = resolveWikilinks(body, item);

                // Lead paragraph styling is now handled via CSS (article p:first-of-type)
                // instead of HTML wrapping, which was breaking markdown processing.

                content = infobox + '\n' + body;
            }
            const rels = reverseLinks[relPath];
            if (rels && rels.length > 0) {
                content += renderRelatedEntities(relPath, rels);
            }
            fs.writeFileSync(outPath, content, 'utf-8');
        }
    }
}

function processKhmerDir(kmDir, kmOutDir) {
    if (!fs.existsSync(kmDir)) return;
    let count = 0;

    function walk(curDir, curOutDir) {
        const items = fs.readdirSync(curDir);
        for (const item of items) {
            const fullPath = path.join(curDir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                if (item === 'System' || item === 'Assets' || item.startsWith('.')) continue;
                const nextOutDir = path.join(curOutDir, item === 'Dossiers' ? '' : item);
                fs.mkdirSync(nextOutDir, { recursive: true });
                walk(fullPath, nextOutDir);
            } else if (item.endsWith('.md')) {
                let content = fs.readFileSync(fullPath, 'utf-8');
                let outPath = path.join(curOutDir, item);
                if (item === 'index.md' && curDir === kmDir) {
                    outPath = path.join(kmOutDir, 'index.md');
                }

                const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
                if (fmMatch) {
                    const yamlStr = fmMatch[1];
                    let body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

                    const yaml = {};
                    for (const line of yamlStr.split('\n')) {
                        const colon = line.indexOf(':');
                        if (colon !== -1) {
                            const k = line.slice(0, colon).trim();
                            const v = line.slice(colon + 1).trim().replace(/^['"]|['"]$/g, '');
                            yaml[k] = v;
                        }
                    }

                    const title = yaml.title || item.replace('.md', '');
                    const imgName = yaml.image ? parseImageField(yaml.image) : '';
                    const isDraft = (yaml.status === 'Draft' || yaml.review_status === 'needs-ai-polish' || yaml.review_status === 'blank-scaffold');

                    let draftBanner = '';
                    if (isDraft) {
                        draftBanner = `<div class="km-draft-badge"><span class="tag">សេចក្តីព្រាង (Draft)</span> <span>ឯកសារនេះជាសេចក្តីព្រាងបឋមដែលកំពុងស្ថិតក្នុងការកែសម្រួលផ្នែកអក្សរសាស្ត្រ។</span></div>\n\n`;
                    }

                    let infobox = '';
                    let infoRows = '';
                    if (yaml.subtitle) infoRows += `<tr><th>ចំណងជើងរង</th><td>${yaml.subtitle}</td></tr>\n`;
                    if (yaml.role) infoRows += `<tr><th>តួនាទី</th><td>${resolveInfoboxWikilinks(yaml.role, item)}</td></tr>\n`;
                    if (yaml.grade) infoRows += `<tr><th>ចំណាត់ថ្នាក់</th><td>${yaml.grade}</td></tr>\n`;
                    if (yaml.living_status) infoRows += `<tr><th>ស្ថានភាពជីវិត</th><td>${yaml.living_status}</td></tr>\n`;
                    if (yaml.unit) infoRows += `<tr><th>អង្គភាព</th><td>${resolveInfoboxWikilinks(yaml.unit, item)}</td></tr>\n`;
                    if (yaml.en_title) infoRows += `<tr><th>English</th><td><em>${yaml.en_title}</em></td></tr>\n`;

                    if (infoRows || imgName) {
                        infobox = `<aside class="custom-infobox infobox-character">\n`;
                        if (title) infobox += `<h3>${title}</h3>\n`;
                        if (imgName) {
                            const mappedName = vaultImages.get(imgName.toLowerCase()) || assetName(imgName);
                            infobox += `<img src="assets/${mappedName}" alt="${title}" />\n`;
                        }
                        if (infoRows) infobox += `<table>\n${infoRows}</table>\n`;
                        infobox += `</aside>\n\n`;
                    }

                    // Sanitize any Khmer-translated <រូប> tags to <figure>
                    body = body.replace(/<\/?រូប>/g, (m) => m === '<រូប>' ? '<figure>' : '</figure>');

                    // 1. Convert wikilink images inside galleries and figures to <img> tags
                    body = body.replace(/(<div\s+class="[^"]*\b(?:gallery|carousel)\b[^"]*"[^>]*>[\s\S]*?<\/div>|<figure\b[^>]*>[\s\S]*?<\/figure>)/g, (block) => {
                        return block.replace(/!\[\[([^\]]+)\]\]/g, (match, rawInner) => {
                            const imgName = rawInner.split('|')[0].trim();
                            const mapped = vaultImages.get(imgName.toLowerCase());
                            if (mapped) return `<img src="assets/${mapped}" alt="${imgName}" loading="lazy" />`;
                            return match;
                        });
                    });

                    // 2. Convert standard wikilink images to standard markdown images
                    body = body.replace(/!\[\[([^\]]+)\]\]/g, (match, rawInner) => {
                        const iName = rawInner.split('|')[0].trim();
                        const mapped = vaultImages.get(iName.toLowerCase());
                        if (mapped) return `![${iName}](assets/${mapped})`;
                        return match;
                    });

                    // 3. Normalize any relative img src attributes to assets/
                    body = body.replace(/(<img[^>]+src=")(?!\/|http|data:)([^"]+)(")/g, (match, p1, srcAttr, p3) => {
                        const imgName = srcAttr.split('/').pop().trim();
                        const mapped = vaultImages.get(imgName.toLowerCase());
                        if (mapped) return `${p1}assets/${mapped}${p3}`;
                        return match;
                    });

                    // 4. Resolve remaining wikilinks
                    body = resolveWikilinks(body, item);

                    // Auto-prefix relative links to km/ if they point to content folders or portals
                    body = body.replace(/href="(characters|locations|factions|events|lore|portal---)([^"]*)"/g, 'href="km/$1$2"');

                    if (item === 'index.md') {
                        infobox = '';
                        draftBanner = '';
                    }

                    const cleanFm = `---\ntitle: "${title.replace(/"/g, '\\"')}"\nlanguage: km\n---\n\n`;
                    content = cleanFm + infobox + draftBanner + body;
                }

                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, content, 'utf-8');
                count++;
            }
        }
    }

    fs.mkdirSync(kmOutDir, { recursive: true });
    walk(kmDir, kmOutDir);

    // Ensure assets are also accessible under /km/assets/ for clean relative pathing
    const kmAssetsOut = path.join(kmOutDir, 'assets');
    const sourceAssets = path.join(destDir, 'assets');
    if (fs.existsSync(sourceAssets) && !fs.existsSync(kmAssetsOut)) {
        try {
            fs.symlinkSync(sourceAssets, kmAssetsOut, 'junction');
        } catch (e) {
            copyAssets(sourceAssets, kmAssetsOut);
        }
    }

    console.log(`[khmer] Staged ${count} Khmer note(s) into /km/ with Kantumruy Pro styling and draft badges.`);
}

if (targetMode !== 'km' && fs.existsSync(sourceDir)) {
    processDir(sourceDir, destDir);
}
if (targetMode !== 'en' && fs.existsSync(kmSourceDir)) {
    processKhmerDir(kmSourceDir, path.join(destDir, 'km'));
}

// --- Random Article Index ---
fs.writeFileSync(path.join(destDir, 'random-index.json'), JSON.stringify(articlePaths, null, 2));

// --- Start Here Page ---
const startHereContent = `---
title: Start Here
---

# Start Here

Welcome to Nolheim. If you are new to this world, the amount of information can be overwhelming. This page is designed to guide you through the most important concepts and conflicts, starting from the broadest picture and narrowing down to specific people and organizations.

## 1. Understand the World

Before diving into the politics, it helps to understand the geography and the forces that shaped it.

*   **[[Ironland|Kingdom of the Ai'ron Land]]**: The established, constitutional monarchy that serves as the anchor of the region.
*   **[[Ironclad]]**: The ungoverned frontier. This is not a state, but a demilitarized zone ruled by competing warlords.
*   **[[VISTA]]**: The intergovernmental military organization that binds the region together, though often through deadlock.

## 2. Understand the Conflict

The year is 2008, and the region is on the brink of war. At the heart of the conflict is a clash between an institutional order and a decentralized insurgency.

*   **[[Konish Kimbotin (Reimagined)|Konish Kimbotin]]**: The Cladish warlord who leads the insurgency.
*   **[[Konish's Group]]**: The coalition of autonomous militias that Kimbotin has united.
*   **[[LENDERMAIRE]]**: The black operations unit that serves as Kimbotin's most dangerous weapon.

## 3. Explore the People

Once you understand the factions, you can explore the individuals who drive the story forward.

*   **[[Samsara Lykor]]**: The concealed thirteenth member of LENDERMAIRE, a man torn between his past and his loyalty.
*   **[[Noradus|Northrad]]**: The President of VISTA and the architect of the institutions that oppose Kimbotin.
*   **[[2008 Pocheasang Palace raid]]**: The event that sparked the modern conflict.

---

<div class="portal-grid"><a href="#" class="portal-button" onclick="const h=JSON.parse(sessionStorage.getItem('randomHistory')||'[]');fetch('random-index.json').then(r=>r.json()).then(idx=>{let pool=idx.filter(u=>!h.includes(u));if(!pool.length){h.length=0;pool=idx;}const p=pool[Math.floor(Math.random()*pool.length)];h.push(p);if(h.length>10)h.shift();sessionStorage.setItem('randomHistory',JSON.stringify(h));window.location.href=p;});return false;">Surprise Me</a></div>
`;
fs.writeFileSync(path.join(destDir, 'Start-Here.md'), resolveWikilinks(startHereContent));

function featuredMedia(fileName, altText) {
    const mappedName = vaultImages.get(fileName.toLowerCase());
    if (!mappedName) {
        const initial = altText.charAt(0).toUpperCase();
        return `<span class="card-image placeholder"><span class="placeholder-initial">${initial}</span></span>`;
    }
    return `<span class="card-image"><img src="assets/${mappedName}" alt="${altText}" loading="lazy"></span>`;
}

const sideSelectorHtml = `<h2 class="home-section-title">Choose Your Side</h2>
<p class="home-section-subtitle">Two opposing doctrines dominate the 2008 southern continent. Select a faction to inspect their commanders, citadels, and frontline operators.</p>

<div class="side-selector">
  <input type="radio" id="side-insurgency" name="side-choice" checked />
  <input type="radio" id="side-order" name="side-choice" />

  <div class="side-tabs">
    <label for="side-insurgency" class="side-tab-btn tab-insurgency">
      <span class="tab-badge">FACTION // 01</span>
      <span class="tab-title">The Insurgency</span>
      <span class="tab-sub">Konish's Group & LENDERMAIRE</span>
    </label>
    <label for="side-order" class="side-tab-btn tab-order">
      <span class="tab-badge">FACTION // 02</span>
      <span class="tab-title">The Order</span>
      <span class="tab-sub">VISTA, New Aester & ITF</span>
    </label>
  </div>

  <div class="side-panel panel-insurgency">
    <div class="side-motto">"Let them taste steel." &mdash; The Cladish warlord coalition defending an unmapped interior.</div>
    <div class="featured-grid">
      <a href="characters/lendermaire/konish-kimbotin-(reimagined)" class="featured-card">
        ${featuredMedia("konish.jpg", "Konish Kimbotin")}
        <span class="card-content">
          <span class="card-badge badge-insurgent">COMMANDER</span>
          <span class="card-title">Konish Kimbotin</span>
          <span class="card-subtitle">Cladish-Jen warlord shielding the undocumented southern society.</span>
        </span>
      </a>
      <a href="locations/area-31" class="featured-card">
        ${featuredMedia("area-31.jpg", "Area-31 Citadel")}
        <span class="card-content">
          <span class="card-badge badge-insurgent">CITADEL</span>
          <span class="card-title">Area-31 (Shaiken)</span>
          <span class="card-subtitle">Brutalist mountain fortress and base for supersonic "Sun" interceptors.</span>
        </span>
      </a>
      <a href="characters/lendermaire/samsara-lykor" class="featured-card">
        ${featuredMedia("samsara.jpg", "Samsara Lykor")}
        <span class="card-content">
          <span class="card-badge badge-insurgent">SPECIAL OPERATOR</span>
          <span class="card-title">Samsara Lykor</span>
          <span class="card-subtitle">The concealed thirteenth member erased from all public records.</span>
        </span>
      </a>
    </div>
  </div>

  <div class="side-panel panel-order">
    <div class="side-motto">"Progress Through Innovation." &mdash; Corporate technocracy backed by private military contractor power.</div>
    <div class="featured-grid">
      <a href="characters/vista/noradus" class="featured-card">
        ${featuredMedia("naradus.png", "Noradus 'Northrad'")}
        <span class="card-content">
          <span class="card-badge badge-order">ARCHITECT</span>
          <span class="card-title">Noradus "Northrad"</span>
          <span class="card-subtitle">Billionaire VISTA President and founder of New Aester.</span>
        </span>
      </a>
      <a href="locations/countries/new-aester" class="featured-card">
        ${featuredMedia("newaester.png", "New Aester")}
        <span class="card-content">
          <span class="card-badge badge-order">CORPORATE STATE</span>
          <span class="card-title">New Aester</span>
          <span class="card-subtitle">Corporate proving ground city-state locked behind a brutalist defensive wall.</span>
        </span>
      </a>
      <a href="characters/anajak-forces/takahashi" class="featured-card">
        ${featuredMedia("sahara.jpg", "Takahashi 'Sahara'")}
        <span class="card-content">
          <span class="card-badge badge-order">STRIKE PILOT</span>
          <span class="card-title">Takahashi ("Sahara")</span>
          <span class="card-subtitle">Thaiphonese strike aviator who inflicted LENDERMAIRE's first casualty.</span>
        </span>
      </a>
    </div>
  </div>
</div>`;

const indexContent = `---
title: Nolheim
description: "The Independent Encyclopedia of Parialfare: Reimagined — covert operations, warlords, and black-site facilities in the year 2008."
socialImage: og-image.png
---
<div class="home-hero"><h1 class="hero-title">NOLHEIM</h1><p class="hero-subtitle">The Independent Encyclopedia of Parialfare: Reimagined</p><p class="hero-author">Created by <a href="https://northrad.carrd.co/" target="_blank" rel="noopener">CHHUM PICHTHYACHHANAN</a></p><p class="hero-lead">The year is 2008. The world is dominated by a technology race and an information war, fought through covert operations, contractors, and black-site facilities rather than open conventional war. The most powerful figures in the region are not states, but warlords, intelligence agencies, and private military companies.</p></div>

<h2 class="home-section-title">Explore the Archive</h2>
<div class="portal-grid"><a href="portal---characters" class="portal-button">01. Personnel</a><a href="portal---factions" class="portal-button">02. Organizations</a><a href="portal---locations" class="portal-button">03. Geography</a><a href="portal---events" class="portal-button">04. Historical Log</a><a href="portal---lore" class="portal-button">05. Systems & Lore</a></div>

${sideSelectorHtml}

<h2 class="home-section-title">Not sure where to start?</h2>
<div class="portal-grid"><a href="start-here" class="portal-button">Start Here</a><a href="#" class="portal-button" onclick="const h=JSON.parse(sessionStorage.getItem('randomHistory')||'[]');fetch('random-index.json').then(r=>r.json()).then(idx=>{let pool=idx.filter(u=>!h.includes(u));if(!pool.length){h.length=0;pool=idx;}const p=pool[Math.floor(Math.random()*pool.length)];h.push(p);if(h.length>10)h.shift();sessionStorage.setItem('randomHistory',JSON.stringify(h));window.location.href=p;});return false;">Random Article</a></div>
`;

fs.writeFileSync(path.join(destDir, 'index.md'), indexContent);

const eventData = [];

function parseFile(filePath, fileName) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    let title = fileName.replace('.md', '');
    let subtitle = '';
    let image = '';
    let status = '';
    let date = '';
    let dateEnd = '';
    let entityType = '';
    if (fmMatch) {
        for (const rawLine of fmMatch[1].split('\n')) {
            const line = rawLine.trim();
            if (line.startsWith('title:')) title = line.substring(6).trim().replace(/['"]/g, '');
            if (line.startsWith('subtitle:')) subtitle = line.substring(9).trim().replace(/['"]/g, '').replace(/\[\[(?:[^|\]]*\|)?([^\]]+)\]\]/g, '$1');
            if (line.startsWith('image:')) image = parseImageField(line.substring(6));
            if (line.startsWith('status:')) status = line.substring(7).trim().replace(/['"]/g, '');
            if (line.startsWith('date:')) date = line.substring(5).trim().replace(/['"]/g, '');
            if (line.startsWith('date-end:')) dateEnd = line.substring(9).trim().replace(/['"]/g, '');
            if (line.startsWith('entity-type:')) entityType = line.substring(12).trim().replace(/['"]/g, '');
        }
    }
    return { title, subtitle, image, status, date, dateEnd, entityType, fileName };
}

function collectArticles(dir, relPrefix) {
    const entries = fs.readdirSync(dir);
    let articles = [];
    for (const entry of entries) {
        const entryPath = path.join(dir, entry);
        const stat = fs.statSync(entryPath);
        if (stat.isDirectory()) {
            articles = articles.concat(collectArticles(entryPath, relPrefix + entry.toLowerCase().replace(/ /g, '-') + '/'));
        } else if (entry.endsWith('.md') && entry !== 'index.md') {
            const data = parseFile(entryPath, entry);
            data.relPath = relPrefix + entry.replace('.md', '').toLowerCase().replace(/ /g, '-');
            data.group = path.basename(dir);
            articles.push(data);
        }
    }
    return articles;
}

const kmFolderTitles = {
    'characters': 'តួអង្គ',
    'events': 'ព្រឹត្តិការណ៍',
    'factions': 'បក្សសម្ព័ន្ធ',
    'locations': 'ទីតាំង',
    'lore': 'ឯកសារ',
    'anajak-forces': 'កងកម្លាំងអាណាចក្រ',
    'anajak forces': 'កងកម្លាំងអាណាចក្រ',
    'lendermaire': 'ឡង់ឌែរម៉ែរ',
    'vista': 'វីស្តា',
    "maire-o'mare": "ម៉ែរ អូម៉ែរ",
    "maire o'mare": "ម៉ែរ អូម៉ែរ",
    "maire-o-mare": "ម៉ែរ អូម៉ែរ",
    "maire-o’mare": "ម៉ែរ អូម៉ែរ",
    'countries': 'ប្រទេស និងដែនដី'
};

const kmBadgeMap = {
    'lendermaire': 'ឡង់ឌែរម៉ែរ',
    'anajak-forces': 'កងកម្លាំងអាណាចក្រ',
    'anajak forces': 'កងកម្លាំងអាណាចក្រ',
    'vista': 'វីស្តា',
    "maire-o'mare": "ម៉ែរ អូម៉ែរ",
    "maire o'mare": "ម៉ែរ អូម៉ែរ",
    "maire-o-mare": "ម៉ែរ អូម៉ែរ",
    "maire-o’mare": "ម៉ែរ អូម៉ែរ",
    'characters': 'តួអង្គ',
    'events': 'ព្រឹត្តិការណ៍',
    'factions': 'បក្សសម្ព័ន្ធ',
    'locations': 'ទីតាំង',
    'lore': 'ឯកសារ',
};

function renderCard(article, outDir) {
    let imgHtml = '';
    const mappedName = article.image ? vaultImages.get(article.image.toLowerCase()) : null;
    if (article.image && !mappedName) console.warn(`[image] not found in vault: "${article.image}" (${article.fileName})`);
    if (mappedName) {
        imgHtml = `<span class="card-image"><img src="assets/${mappedName}" alt="${article.title}" loading="lazy"></span>`;
    } else {
        const initial = article.title.charAt(0).toUpperCase();
        imgHtml = `<span class="card-image placeholder"><span class="placeholder-initial">${initial}</span></span>`;
    }
    const isKm = (article.relPath || '').startsWith('km/') || (outDir && outDir.replace(/\\/g, '/').includes('/km'));
    let draftBadge = '';
    if (article.status && article.status.toLowerCase() === 'draft') {
        draftBadge = isKm ? '<span class="draft-badge">សេចក្តីព្រាង</span>' : '<span class="draft-badge">Draft</span>';
    }
    let badgeLabel = 'ENTRY';
    if (isKm) {
        const groupKey = (article.group || '').toLowerCase().replace(/ /g, '-');
        const entityKey = (article.entityType || '').toLowerCase().replace(/ /g, '-');
        badgeLabel = kmBadgeMap[groupKey] || kmBadgeMap[entityKey] || (article.group ? article.group.toUpperCase() : 'ឯកសារ');
    } else {
        badgeLabel = article.group ? article.group.toUpperCase() : (article.entityType ? article.entityType.toUpperCase() : 'ENTRY');
    }
    return `<a href="${article.relPath}" class="featured-card">${imgHtml}<span class="card-content"><span class="card-badge">${badgeLabel}${draftBadge}</span><span class="card-title">${article.title}</span><span class="card-subtitle">${article.subtitle}</span></span></a>`;
}

function generateIndices(srcDir, outDir, isRoot = false) {
    if (!fs.existsSync(srcDir)) return;
    const items = fs.readdirSync(srcDir);

    // First, recursively generate sub-folder indexes so their own pages exist
    for (const item of items) {
        const srcPath = path.join(srcDir, item);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            if (item === 'System' || item === 'Assets' || item.startsWith('.')) continue;
            const outPath = path.join(outDir, item);
            if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
            generateIndices(srcPath, outPath);
        }
    }

    // Then collect all articles under this folder recursively for a flat grid
    // Prefix must be content-root-relative so card links resolve correctly under absolute mode
    const relPrefix = path.relative(destDir, outDir).replace(/\\/g, '/');
    const articles = collectArticles(srcDir, relPrefix ? relPrefix + '/' : '');

    if (!isRoot && articles.length > 0) {
        let cardsHtml = '<div class="category-grid">';
        for (const a of articles) {
            cardsHtml += renderCard(a, outDir);
        }
        cardsHtml += '</div>';
        const isKm = outDir.replace(/\\/g, '/').includes('/km') || outDir.replace(/\\/g, '/').endsWith('/km');
        const baseKey = path.basename(srcDir).toLowerCase().replace(/ /g, '-');
        const folderTitle = isKm ? (kmFolderTitles[baseKey] || path.basename(srcDir)) : path.basename(srcDir);
        const langFm = isKm ? '\nlanguage: km' : '';
        const indexContent = `---\ntitle: "${folderTitle}"${langFm}\n---\n\n${cardsHtml}`;
        fs.writeFileSync(path.join(outDir, 'index.md'), indexContent);
    }
}

if (targetMode !== 'km' && fs.existsSync(sourceDir)) {
    generateIndices(sourceDir, destDir, true);
}
const kmDossiersDir = path.join(kmSourceDir, 'Dossiers');
if (targetMode !== 'en' && fs.existsSync(kmDossiersDir)) {
    generateIndices(kmDossiersDir, path.join(destDir, 'km'), true);
}

// --- Collect Events for Events Directory ---
const allArticles = collectArticles(sourceDir, '');
for (const a of allArticles) {
    if (a.entityType.toLowerCase() === 'event') {
        eventData.push({ title: a.title, url: './' + a.relPath, date: a.date, dateEnd: a.dateEnd, subtitle: a.subtitle });
    }
}

// --- Events Directory ---
function parseChronologicalDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const iso = s.match(/^(-?\d{1,4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?$/);
    if (iso) {
        return [parseInt(iso[1], 10), iso[2] ? parseInt(iso[2], 10) : 1, iso[3] ? parseInt(iso[3], 10) : 1];
    }
    const cent = s.match(/(\d{1,2})(?:st|nd|rd|th)\s*(?:[–-]\s*\d{1,2}(?:st|nd|rd|th)\s*)?centur/i);
    if (cent) {
        return [(parseInt(cent[1], 10) - 1) * 100, 1, 1];
    }
    const months = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const yearMatch = s.match(/\b(\d{3,4})\b/);
    if (yearMatch) {
        const year = parseInt(yearMatch[1], 10);
        let month = 1;
        for (const [mKey, mVal] of Object.entries(months)) {
            if (new RegExp('\\b' + mKey, 'i').test(s)) { month = mVal; break; }
        }
        const dayMatch = s.replace(yearMatch[0], '').match(/\b([12]?\d|3[01])\b/);
        const day = dayMatch ? parseInt(dayMatch[1], 10) : 1;
        return [year, month, day];
    }
    return null;
}

function renderEventsDirectory() {
    const dated = eventData.filter(e => e.date);
    const undated = eventData.filter(e => !e.date);

    dated.sort((a, b) => {
        const pa = parseChronologicalDate(a.date);
        const pb = parseChronologicalDate(b.date);
        if (pa && pb) {
            if (pa[0] !== pb[0]) return pa[0] - pb[0];
            if (pa[1] !== pb[1]) return pa[1] - pb[1];
            if (pa[2] !== pb[2]) return pa[2] - pb[2];
        }
        return a.date.localeCompare(b.date);
    });
    undated.sort((a, b) => a.title.localeCompare(b.title));

    let html = '---\ntitle: Events Directory\n---\n\n# Events Directory\n\nA chronological listing of all recorded historical events in the Nolheim archive.\n\n';

    html += '## Dated Events\n\n';
    if (dated.length === 0) {
        html += '*No dated events recorded.*\n';
    } else {
        for (const e of dated) {
            let dateDisplay = e.date;
            if (e.dateEnd) dateDisplay += ' – ' + e.dateEnd;
            html += `<div class="event-entry">\n`;
            html += `<div class="event-date">${dateDisplay}</div>\n`;
            html += `<div class="event-info"><a href="${e.url}" class="event-link">${e.title}</a>`;
            if (e.subtitle) html += `<span class="event-subtitle">${e.subtitle}</span>`;
            html += `</div>\n</div>\n\n`;
        }
    }

    html += '\n## Undated Events\n\n';
    if (undated.length === 0) {
        html += '*No undated events recorded.*\n';
    } else {
        for (const e of undated) {
            html += `<div class="event-entry">\n`;
            html += `<div class="event-date">Date not recorded</div>\n`;
            html += `<div class="event-info"><a href="${e.url}" class="event-link">${e.title}</a>`;
            if (e.subtitle) html += `<span class="event-subtitle">${e.subtitle}</span>`;
            html += `</div>\n</div>\n\n`;
        }
    }

    return html;
}

fs.writeFileSync(path.join(destDir, 'Events-Directory.md'), renderEventsDirectory());
console.log(`[events] Generated Events Directory with ${eventData.length} entries.`);

// Replace the published content only after the complete generation succeeds.
try {
    if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
    }
    if (fs.existsSync(finalDir)) {
        fs.renameSync(finalDir, backupDir);
    }
    fs.renameSync(destDir, finalDir);
    if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
    }
} catch (renameErr) {
    // If directory rename fails (common on Windows when a watcher or dev server holds a lock on content),
    // fall back to direct copy.
    console.warn(`[build] Directory rename locked (${renameErr.message}); syncing files directly into content...`);
    fs.cpSync(destDir, finalDir, { recursive: true, force: true });
    fs.rmSync(destDir, { recursive: true, force: true });
}

if (fs.existsSync(previewOverlayDir)) {
    fs.rmSync(previewOverlayDir, { recursive: true, force: true });
}

console.log('Content built successfully with normalized assets and grid layouts.');
