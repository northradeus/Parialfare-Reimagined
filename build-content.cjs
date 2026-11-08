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
            vaultImages.set(file.toLowerCase(), outName);
            fs.copyFileSync(srcPath, path.join(destAssets, outName));
        }
    }
}

const ignoreKeys = ['tags', 'entity-type', 'character-type', 'faction-type', 'location-type', 'concept-type', 'country-type', 'UID', 'continuity', 'subject', 'status', 'image', 'layout', 'aliases', 'alias'];

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

                        val = val.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '$2');
                        val = val.replace(/\[\[([^\]]+)\]\]/g, '$1');
                        val = val.replace(/^['"]|['"]$/g, '');
                        
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
                        let relPath = path.relative(outDir, destAssets).replace(/\\/g, '/');
                        if (!relPath.startsWith('.')) relPath = './' + relPath;
                        infobox += `<img src="${relPath}/${mappedName}" alt="${title}" />\n`;
                    }
                    if (infoRows) infobox += `<table>\n${infoRows}</table>\n`;
                    infobox += `</aside>\n`;
                }

                let relAssetsPath = path.relative(outDir, destAssets).replace(/\\/g, '/');
                if (!relAssetsPath.startsWith('.')) relAssetsPath = './' + relAssetsPath;

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

                let firstP = true;
                body = body.replace(/^(?!\s*#)(\s*)([^\n\r]+)/m, (match, spaces, text) => {
                    if (firstP && text.trim().length > 0) {
                        firstP = false;
                        return spaces + `<p class="lead">` + text + `</p>`;
                    }
                    return match;
                });

                content = infobox + body;
            }
            fs.writeFileSync(outPath, content, 'utf-8');
        }
    }
}
processDir(sourceDir, destDir);

function featuredMedia(fileName, altText) {
    const mappedName = vaultImages.get(fileName.toLowerCase());
    if (!mappedName) {
        const initial = altText.charAt(0).toUpperCase();
        return `<span class="card-image placeholder"><span class="placeholder-initial">${initial}</span></span>`;
    }
    return `<span class="card-image"><img src="assets/${mappedName}" alt="${altText}" loading="lazy"></span>`;
}

const indexContent = `---\ntitle: Nolheim\n---\n<div class="home-hero"><h1 class="hero-title">NOLHEIM</h1><p class="hero-subtitle">The Independent Encyclopedia of Parialfare: Reimagined</p><p class="hero-lead">The year is 2008. The world is dominated by a technology race and an information war, fought through covert operations, contractors, and black-site facilities rather than open conventional war. The most powerful figures in the region are not states, but warlords, intelligence agencies, and private military companies.</p></div><h2 class="home-section-title">Featured Records</h2><div class="featured-grid"><a href="characters/lendermaire/konish-kimbotin-(reimagined)" class="featured-card">${featuredMedia("konish.jpg", "Konish Kimbotin")}<span class="card-content"><span class="card-title">Konish Kimbotin</span><span class="card-subtitle">Supreme Warlord of the Cladish insurgency.</span></span></a><a href="characters/lendermaire/samsara-lykor" class="featured-card">${featuredMedia("samsara.jpg", "Samsara Lykor")}<span class="card-content"><span class="card-title">Samsara Lykor</span><span class="card-subtitle">The concealed thirteenth member of LENDERMAIRE.</span></span></a><a href="events/2008-pocheasang-palace-raid" class="featured-card">${featuredMedia("nighttime-gendarmerie-assault.png", "Event")}<span class="card-content"><span class="card-title">2008 Pocheasang Palace Raid</span><span class="card-subtitle">The foundational act of the modern insurgency.</span></span></a></div><h2 class="home-section-title">Explore the Archive</h2><div class="portal-grid"><a href="portal---characters" class="portal-button">01. Personnel</a><a href="portal---factions" class="portal-button">02. Organizations</a><a href="portal---locations" class="portal-button">03. Geography</a><a href="portal---events" class="portal-button">04. Historical Log</a><a href="portal---lore" class="portal-button">05. Systems & Lore</a></div>`;
fs.writeFileSync(path.join(destDir, 'index.md'), indexContent);

function generateIndices(srcDir, outDir, isRoot = false) {
    const items = fs.readdirSync(srcDir);
    let cardsHtml = '<div class="category-grid">';
    let hasFiles = false;

    for (const item of items) {
        const srcPath = path.join(srcDir, item);
        const outPath = path.join(outDir, item);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
            if (!fs.existsSync(outPath)) fs.mkdirSync(outPath, { recursive: true });
            generateIndices(srcPath, outPath);
        } else if (item.endsWith('.md') && item !== 'index.md') {
            hasFiles = true;
            const content = fs.readFileSync(srcPath, 'utf-8');
            const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            let title = item.replace('.md', '');
            let subtitle = '';
            let image = '';

            if (fmMatch) {
                const lines = fmMatch[1].split('\n');
                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith('title:')) title = line.substring(6).trim().replace(/['"]/g, '');
                    if (line.startsWith('subtitle:')) subtitle = line.substring(9).trim().replace(/['"]/g, '');
                    if (line.startsWith('image:')) image = parseImageField(line.substring(6));
                }
            }

            const urlPath = './' + item.replace('.md', '').toLowerCase().replace(/ /g, '-');
            let imgHtml = '';
            const mappedName = image ? vaultImages.get(image.toLowerCase()) : null;
            if (image && !mappedName) console.warn(`[image] not found in vault: "${image}" (${item})`);

            if (mappedName) {
                let relPath = path.relative(outDir, destAssets).replace(/\\/g, '/');
                if (!relPath.startsWith('.')) relPath = './' + relPath;
                imgHtml = `<span class="card-image"><img src="${relPath}/${mappedName}" alt="${title}" loading="lazy"></span>`;
            } else {
                const initial = title.charAt(0).toUpperCase();
                imgHtml = `<span class="card-image placeholder"><span class="placeholder-initial">${initial}</span></span>`;
            }
            cardsHtml += `<a href="${urlPath}" class="featured-card">${imgHtml}<span class="card-content"><span class="card-title">${title}</span><span class="card-subtitle">${subtitle}</span></span></a>`;
        }
    }

    if (!isRoot && hasFiles) {
        cardsHtml += '</div>';
        const folderTitle = path.basename(srcDir);
        const indexContent = `---\ntitle: ${folderTitle}\n---\n\n${cardsHtml}`;
        fs.writeFileSync(path.join(outDir, 'index.md'), indexContent);
    }
}

generateIndices(sourceDir, destDir, true);

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
