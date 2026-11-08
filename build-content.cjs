const fs = require('fs');
const path = require('path');

const sourceDir = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Continuities\\Parialfare - Reimagined';
const sourceAssets = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim\\Assets';
const destDir = path.join(__dirname, 'content');
const destAssets = path.join(destDir, 'Assets');

if (fs.existsSync(destDir)) { fs.rmSync(destDir, { recursive: true, force: true }); }
fs.mkdirSync(destDir, { recursive: true });
fs.mkdirSync(destAssets, { recursive: true });
fs.cpSync(sourceAssets, destAssets, { recursive: true });

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

            // Safely strip entire Wikipedia artifact line
            content = content.replace(/^\*?From Wikipedia, the free encyclopedia\*?\s*$/gm, '');

            // Remove layout block
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
                        if (key === 'image') {
                            const imgMatch = val.match(/(?:\[\[)?([^\]\n,]+)/);
                            if (imgMatch) imgName = imgMatch[1].trim();
                        }

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
                    if (imgName) infobox += `<img src="Assets/${imgName}" alt="${title}" />\n`;
                    if (infoRows) infobox += `<table>\n${infoRows}</table>\n`;
                    infobox += `</aside>\n`;
                }

                body = body.replace(/(<img[^>]+src=")(?!\/|http|Assets\/)([^"]+)(")/g, '$1/Assets/$2$3');
                body = body.replace(/!\[\[([^|\]]+)\|[^\]]+\]\]/g, '![](/Assets/$1)');
                body = body.replace(/!\[\[([^\]]+)\]\]/g, '![](/Assets/$1)');

                // Add lead class to the first non-header paragraph
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

const indexContent = `\n<div class="home-hero">\n  <h1 class="hero-title">NOLHEIM</h1>\n  <p class="hero-subtitle">The Independent Encyclopedia of Parialfare: Reimagined</p>\n  <p class="hero-lead">The year is 2008. The world is dominated by a technology race and an information war, fought through covert operations, contractors, and black-site facilities rather than open conventional war. The most powerful figures in the region are not states, but warlords, intelligence agencies, and private military companies.</p>\n</div>\n\n<h2 class="home-section-title">Featured Records</h2>\n<div class="featured-grid">\n  <a href="/Parialfare-Reimagined/characters/lendermaire/konish-kimbotin-(reimagined)" class="featured-card">\n    <div class="card-image" style="background-image: url('/Parialfare-Reimagined/assets/68a441a82ac7f894ccefbe4a6f0d42f4.jpg')"></div>\n    <div class="card-content">\n      <h3>Konish Kimbotin</h3>\n      <p>Supreme Warlord of the Cladish insurgency.</p>\n    </div>\n  </a>\n  <a href="/Parialfare-Reimagined/characters/lendermaire/samsara-lykor" class="featured-card">\n    <div class="card-image" style="background-image: url('/Parialfare-Reimagined/assets/Samsara.jpg')"></div>\n    <div class="card-content">\n      <h3>Samsara Lykor</h3>\n      <p>The concealed thirteenth member of LENDERMAIRE.</p>\n    </div>\n  </a>\n  <a href="/Parialfare-Reimagined/events/2008-pocheasang-palace-raid" class="featured-card">\n    <div class="card-image event-placeholder">\n      <span>EVENT LOG</span>\n    </div>\n    <div class="card-content">\n      <h3>2008 Pocheasang Palace Raid</h3>\n      <p>The foundational act of the modern insurgency.</p>\n    </div>\n  </a>\n</div>\n\n<h2 class="home-section-title">Explore the Archive</h2>\n<div class="portal-grid">\n  <a href="/Parialfare-Reimagined/portal---characters" class="portal-button">01. Personnel</a>\n  <a href="/Parialfare-Reimagined/portal---factions" class="portal-button">02. Organizations</a>\n  <a href="/Parialfare-Reimagined/portal---locations" class="portal-button">03. Geography</a>\n  <a href="/Parialfare-Reimagined/portal---events" class="portal-button">04. Historical Log</a>\n  <a href="/Parialfare-Reimagined/portal---lore" class="portal-button">05. Systems & Lore</a>\n</div>\n`;
fs.writeFileSync(path.join(destDir, 'index.md'), indexContent);

const directories = ['Characters', 'Factions', 'Locations', 'Events', 'Lore'];
for (const d of directories) {
    let files = [];
    function scanForMd(dir) {
        if (!fs.existsSync(dir)) return;
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            if (fs.statSync(fullPath).isDirectory()) {
                scanForMd(fullPath);
            } else if (item.endsWith('.md')) {
                files.push(item.replace('.md', ''));
            }
        }
    }
    scanForMd(path.join(destDir, d));
    let listContent = `# ${d}\n\n`;
    for (const f of files) {
        listContent += `- [[${f}]]\n`;
    }
    fs.writeFileSync(path.join(destDir, `${d}.md`), listContent);
}
console.log('Content built successfully with refined infoboxes, lead paragraphs, and missing value classes.');
