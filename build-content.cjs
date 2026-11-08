const fs = require('fs');
const path = require('path');

// Override these paths on another machine with:
//   NOLHEIM_SOURCE_DIR="C:/path/to/Parialfare - Reimagined"
//   NOLHEIM_ASSETS_DIR="C:/path/to/Images"
const sourceDir = process.env.NOLHEIM_SOURCE_DIR
    || 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Continuities\\Parialfare - Reimagined';
const sourceAssets = process.env.NOLHEIM_ASSETS_DIR
    || 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Assets\\Images';
const finalDir = path.join(__dirname, 'content');
const destDir = path.join(__dirname, '.content-staging');
const backupDir = path.join(__dirname, '.content-previous');
const destAssets = path.join(destDir, 'assets');

// Validate inputs BEFORE deleting the previous generated site.
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
    console.error(`[content] Source vault directory does not exist: ${sourceDir}`);
    console.error('[content] Set NOLHEIM_SOURCE_DIR to the correct vault directory.');
    process.exit(1);
}

if (!fs.existsSync(sourceAssets) || !fs.statSync(sourceAssets).isDirectory()) {
    console.warn(`[assets] Image directory not found: ${sourceAssets}`);
    console.warn('[assets] Continuing without copied image assets.');
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
    for (const file of fs.readdirSync(sourceAssets)) {
        const srcPath = path.join(sourceAssets, file);
        if (fs.statSync(srcPath).isFile()) {
            const outName = assetName(file);
            // Register under multiple keys so lookups succeed regardless of format
            vaultImages.set(file.toLowerCase(), outName);
            vaultImages.set(outName.toLowerCase(), outName);
            fs.copyFileSync(srcPath, path.join(destAssets, outName));
        }
    }
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
        }
    }
}

preScanRelations(sourceDir);

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

function resolveWikilinks(text) {
    // Handles all three forms: [[Foo]], [[Foo|Bar]], [[Foo\|Bar]]
    // Group 1 = target, Group 2 = optional alias (with or without escaped pipe)
    return text.replace(/\[\[([^\]|\\]+?)(?:\\?\|([^\]]+))?\]\]/g, (match, target, alias) => {
        if (!target) return match;
        const slug = resolvers[normalizeKey(target.trim())];
        const display = (alias || target).trim();
        if (!slug) return display;
        return `[${display}](${slug})`;
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
                        if (val.startsWith('[') && val.endsWith(']')) {
                            val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, '')).join(', ');
                        }
                        val = val.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
                        val = val.replace(/\[\[([^\]]+)\]\]/g, '$1');
                        val = val.replace(/^["']|["']$/g, '');
                        
                        let valClass = '';
                        const lowerVal = val.toLowerCase();
                        if (lowerVal === 'tbd') valClass = 'val-tbd';
                        else if (lowerVal === 'unknown') valClass = 'val-unknown';
                        else if (lowerVal === 'none') valClass = 'val-none';
                        else if (lowerVal === 'undefined') valClass = 'val-undefined';

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

                body = resolveWikilinks(body);

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
processDir(sourceDir, destDir);

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

const indexContent = `---\ntitle: Nolheim\ndescription: "The Independent Encyclopedia of Parialfare: Reimagined — covert operations, warlords, and black-site facilities in the year 2008."\n---\n<div class="home-hero"><h1 class="hero-title">NOLHEIM</h1><p class="hero-subtitle">The Independent Encyclopedia of Parialfare: Reimagined</p><p class="hero-author">Created by <a href="https://northrad.carrd.co/" target="_blank" rel="noopener">CHHUM PICHTHYACHHANAN</a></p><p class="hero-lead">The year is 2008. The world is dominated by a technology race and an information war, fought through covert operations, contractors, and black-site facilities rather than open conventional war. The most powerful figures in the region are not states, but warlords, intelligence agencies, and private military companies.</p></div><h2 class="home-section-title">Featured Records</h2><div class="featured-grid"><a href="characters/lendermaire/konish-kimbotin-(reimagined)" class="featured-card">${featuredMedia("konish.jpg", "Konish Kimbotin")}<span class="card-content"><span class="card-title">Konish Kimbotin</span><span class="card-subtitle">Supreme Warlord of the Cladish insurgency.</span></span></a><a href="characters/lendermaire/samsara-lykor" class="featured-card">${featuredMedia("samsara.jpg", "Samsara Lykor")}<span class="card-content"><span class="card-title">Samsara Lykor</span><span class="card-subtitle">The concealed thirteenth member of LENDERMAIRE.</span></span></a><a href="events/2008-pocheasang-palace-raid" class="featured-card">${featuredMedia("nighttime-gendarmerie-assault.png", "Event")}<span class="card-content"><span class="card-title">2008 Pocheasang Palace Raid</span><span class="card-subtitle">The foundational act of the modern insurgency.</span></span></a></div><h2 class="home-section-title">Explore the Archive</h2><div class="portal-grid"><a href="portal---characters" class="portal-button">01. Personnel</a><a href="portal---factions" class="portal-button">02. Organizations</a><a href="portal---locations" class="portal-button">03. Geography</a><a href="portal---events" class="portal-button">04. Historical Log</a><a href="portal---lore" class="portal-button">05. Systems & Lore</a></div><h2 class="home-section-title">Not sure where to start?</h2><div class="portal-grid"><a href="start-here" class="portal-button">Start Here</a><a href="#" class="portal-button" onclick="const h=JSON.parse(sessionStorage.getItem('randomHistory')||'[]');fetch('random-index.json').then(r=>r.json()).then(idx=>{let pool=idx.filter(u=>!h.includes(u));if(!pool.length){h.length=0;pool=idx;}const p=pool[Math.floor(Math.random()*pool.length)];h.push(p);if(h.length>10)h.shift();sessionStorage.setItem('randomHistory',JSON.stringify(h));window.location.href=p;});return false;">Random Article</a></div>`;
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
            if (line.startsWith('subtitle:')) subtitle = line.substring(9).trim().replace(/['"]/g, '');
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
            articles.push(data);
        }
    }
    return articles;
}

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
    const draftBadge = (article.status.toLowerCase() === 'draft') ? '<span class="draft-badge">Draft</span>' : '';
    return `<a href="${article.relPath}" class="featured-card">${imgHtml}<span class="card-content"><span class="card-title">${article.title}${draftBadge}</span><span class="card-subtitle">${article.subtitle}</span></span></a>`;
}

function generateIndices(srcDir, outDir, isRoot = false) {
    const items = fs.readdirSync(srcDir);

    // First, recursively generate sub-folder indexes so their own pages exist
    for (const item of items) {
        const srcPath = path.join(srcDir, item);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
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
        const folderTitle = path.basename(srcDir);
        const indexContent = `---\ntitle: ${folderTitle}\n---\n\n${cardsHtml}`;
        fs.writeFileSync(path.join(outDir, 'index.md'), indexContent);
    }
}

generateIndices(sourceDir, destDir, true);

// --- Collect Events for Events Directory ---
const allArticles = collectArticles(sourceDir, '');
for (const a of allArticles) {
    if (a.entityType.toLowerCase() === 'event') {
        eventData.push({ title: a.title, url: './' + a.relPath, date: a.date, dateEnd: a.dateEnd, subtitle: a.subtitle });
    }
}

// --- Events Directory ---
function renderEventsDirectory() {
    const dated = eventData.filter(e => e.date);
    const undated = eventData.filter(e => !e.date);

    dated.sort((a, b) => a.date.localeCompare(b.date));
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
if (fs.existsSync(backupDir)) {
    fs.rmSync(backupDir, { recursive: true, force: true });
}
if (fs.existsSync(finalDir)) {
    fs.renameSync(finalDir, backupDir);
}
try {
    fs.renameSync(destDir, finalDir);
    if (fs.existsSync(backupDir)) {
        fs.rmSync(backupDir, { recursive: true, force: true });
    }
} catch (error) {
    if (!fs.existsSync(finalDir) && fs.existsSync(backupDir)) {
        fs.renameSync(backupDir, finalDir);
    }
    throw error;
}

console.log('Content built successfully with normalized assets and grid layouts.');
