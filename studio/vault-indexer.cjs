/**
 * Nolheim Studio - Vault Indexer & Safe I/O Engine
 * 
 * Provides:
 * 1. Fast in-memory semantic indexing of all vault dossiers
 * 2. Real-time backlinks & broken links extraction with sentence context
 * 3. Atomic writes & rotating snapshots (studio/.snapshots/)
 * 4. Mtime conflict detection against desktop Chronicler
 * 5. Surgical round-trip safe frontmatter editing
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class VaultIndexer {
    constructor(options = {}) {
        this.enVaultDir = options.enVaultDir;
        this.kmVaultDir = options.kmVaultDir;
        this.continuitiesDir = options.continuitiesDir;
        this.sandboxDir = options.sandboxDir;
        this.snapshotsDir = options.snapshotsDir;

        // Ensure snapshots directory exists
        if (!fs.existsSync(this.snapshotsDir)) {
            fs.mkdirSync(this.snapshotsDir, { recursive: true });
        }

        // In-memory index structures
        this.dossiers = new Map(); // fullPath -> dossier
        this.byBaseName = new Map(); // baseName.toLowerCase() -> dossier
        this.byUID = new Map(); // uid -> dossier
        this.backlinks = new Map(); // targetBaseName.toLowerCase() -> [ { sourcePath, sourceBaseName, sourceTitle, sourceUnit, snippet } ]
        this.unresolvedLinks = []; // [ { sourceBaseName, targetName } ]
        this.sectors = new Set();
        this.factions = new Set();
        this.lastBuildTime = null;
        this.watcher = null;
    }

    // Hash helper for conflict checking
    computeHash(str) {
        return crypto.createHash('md5').update(str).digest('hex');
    }

    // Parse Frontmatter cleanly
    parseFrontmatter(content) {
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) return { yaml: {}, rawYaml: '', body: content.trim() };

        const rawYaml = match[1];
        const body = content.slice(match[0].length).trim();
        const yaml = {};

        const lines = rawYaml.split(/\r?\n/);
        let currentKey = null;
        let isMultiline = false;
        let multilineVal = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Ignore pure comment lines if not in multiline
            if (line.trim().startsWith('#') && !isMultiline) continue;

            const colonIdx = line.indexOf(':');
            if (!isMultiline && colonIdx > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
                const key = line.slice(0, colonIdx).trim();
                let val = line.slice(colonIdx + 1).trim();

                // Multiline indicator
                if (val === '|' || val === '>') {
                    currentKey = key;
                    isMultiline = true;
                    multilineVal = [];
                    continue;
                }

                // Inline array: [a, b, c]
                if (val.startsWith('[') && val.endsWith(']')) {
                    val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                } else if (val.startsWith('"') && val.endsWith('"')) {
                    val = val.slice(1, -1);
                } else if (val.startsWith("'") && val.endsWith("'")) {
                    val = val.slice(1, -1);
                }
                yaml[key] = val;
                currentKey = key;
            } else if (isMultiline) {
                if (line.startsWith(' ') || line.startsWith('\t') || line.trim() === '') {
                    multilineVal.push(line);
                } else {
                    yaml[currentKey] = multilineVal.join('\n');
                    isMultiline = false;
                    i--; // re-process line as normal key
                }
            }
        }
        if (isMultiline && currentKey) {
            yaml[currentKey] = multilineVal.join('\n');
        }

        // Layout parsing for Chronicler
        let layoutRules = [];
        const layoutIdx = lines.findIndex(l => l.trim().startsWith('layout:'));
        if (layoutIdx !== -1) {
            let currentItem = null;
            for (let j = layoutIdx + 1; j < lines.length; j++) {
                const l = lines[j];
                if (!l.startsWith(' ') && !l.startsWith('\t') && l.includes(':')) break;
                const trimmed = l.trim();
                if (trimmed.startsWith('- type:')) {
                    if (currentItem) layoutRules.push(currentItem);
                    currentItem = { type: trimmed.replace('- type:', '').trim() };
                } else if (trimmed.startsWith('- ') && !trimmed.includes(':')) {
                    if (currentItem) layoutRules.push(currentItem);
                    currentItem = null;
                    layoutRules.push({ type: 'field', key: trimmed.replace('- ', '').trim() });
                } else if (currentItem && trimmed.includes(':')) {
                    const [k, ...v] = trimmed.split(':');
                    currentItem[k.trim()] = v.join(':').trim().replace(/^['"]|['"]$/g, '');
                }
            }
            if (currentItem) layoutRules.push(currentItem);
        }
        yaml.layoutRules = layoutRules;

        return { yaml, rawYaml, body };
    }

    // Extract all [[wikilinks]] from text
    extractWikilinks(text) {
        const regex = /\[\[(.*?)\]\]/g;
        const links = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            let target = match[1];
            let alias = null;
            if (target.includes('|')) {
                const parts = target.split('|');
                target = parts[0].trim();
                alias = parts[1].trim();
            }
            if (target.includes('#')) {
                target = target.split('#')[0].trim();
            }
            if (target && !links.includes(target)) {
                links.push({ raw: match[0], target, alias });
            }
        }
        return links;
    }

    // Extract image thumbnail from yaml or body
    extractImageThumbnail(yaml, body, baseName) {
        let img = yaml.image;
        if (Array.isArray(img) && img.length > 0) img = img[0];
        if (typeof img === 'string') {
            // Can be "[[File.png, caption]]" or "[File.png]" or "File.png"
            const m = img.match(/\[*([^,\]\s]+\.(?:png|jpg|jpeg|webp|svg))/i);
            if (m) return m[1].trim();
            return img.replace(/[\[\]'"]/g, '').trim();
        }
        // Try finding first embedded image in body ![[Image.png]]
        const bodyMatch = body.match(/!\[\[([^,\]\s]+\.(?:png|jpg|jpeg|webp|svg))/i);
        if (bodyMatch) return bodyMatch[1].trim();
        return null;
    }

    extractGalleryImages(yaml, body) {
        const list = [];
        const rawGal = yaml.gallery || yaml.images;
        if (Array.isArray(rawGal)) {
            for (const item of rawGal) {
                if (typeof item === 'string') {
                    const clean = item.replace(/[\[\]'"]/g, '').trim();
                    if (clean && !list.includes(clean)) list.push(clean);
                }
            }
        } else if (typeof rawGal === 'string') {
            const clean = rawGal.replace(/[\[\]'"]/g, '').trim();
            if (clean && !list.includes(clean)) list.push(clean);
        }

        // Also collect embedded body images ![[Image.png]]
        const bodyMatches = body.matchAll(/!\[\[([^,\]\s]+\.(?:png|jpg|jpeg|webp|svg))/gi);
        for (const m of bodyMatches) {
            const clean = m[1].replace(/[\[\]'"]/g, '').trim();
            if (clean && !list.includes(clean)) list.push(clean);
        }

        return list;
    }

    // Clean bracketed names e.g. "[[LENDERMAIRE]]" -> "LENDERMAIRE"
    cleanLinkName(val) {
        if (!val) return '';
        if (typeof val !== 'string') return String(val);
        return val.replace(/\[\[(.*?)\]\]/g, '$1').replace(/^['"]|['"]$/g, '').trim();
    }

    // Build or Rebuild the entire vault index
    buildIndex() {
        this.dossiers.clear();
        this.byBaseName.clear();
        this.byUID.clear();
        this.backlinks.clear();
        this.unresolvedLinks = [];
        this.sectors.clear();
        this.factions.clear();

        const targets = [
            { dir: this.continuitiesDir, scope: 'canon' },
            { dir: this.sandboxDir, scope: 'sandbox' }
        ];

        for (const target of targets) {
            if (!fs.existsSync(target.dir)) continue;
            const files = this.walk(target.dir);

            for (const f of files) {
                try {
                    const content = fs.readFileSync(f, 'utf8');
                    const stat = fs.statSync(f);
                    const { yaml, rawYaml, body } = this.parseFrontmatter(content);
                    const baseName = path.basename(f, '.md');
                    const relPath = path.relative(target.dir, f).replace(/\\/g, '/');

                    // Semantic Field Extraction
                    const tags = Array.isArray(yaml.tags) ? yaml.tags.map(t => String(t).toLowerCase()) : (yaml.tags ? [String(yaml.tags).toLowerCase()] : []);
                    let entityType = yaml['entity-type'] || '';
                    if (!entityType) {
                        if (tags.includes('incident') || relPath.toLowerCase().includes('incidents/')) {
                            entityType = 'incident';
                        } else {
                            entityType = 'concept';
                        }
                    }
                    let unit = this.cleanLinkName(yaml.unit || (Array.isArray(yaml.factions) ? yaml.factions[0] : yaml.factions) || '');
                    const normalizedRel = relPath.replace(/\\/g, '/');
                    if (!unit && normalizedRel.includes('/')) {
                        const parts = normalizedRel.split('/');
                        const segment = parts.length > 1 ? parts[0] : parts[0];
                        if (segment === 'Incidents' || entityType.toLowerCase() === 'incident') {
                            unit = 'Declassified Incidents';
                        } else if (segment !== 'Characters' && segment !== 'Factions' && segment !== 'Events' && segment !== 'Locations') {
                            unit = segment;
                        }
                    }
                    if (entityType.toLowerCase() === 'incident' && (!unit || unit.endsWith('.md'))) {
                        unit = 'Declassified Incidents';
                    }

                    const editorialStatus = yaml.status || (target.scope === 'sandbox' ? 'Draft' : 'Canon');
                    
                    // In-universe status: Active, Exiled, KIA, Dormant, Under Cover
                    let inUniverseStatus = yaml.in_universe_status || '';
                    if (!inUniverseStatus) {
                        const tags = Array.isArray(yaml.tags) ? yaml.tags.map(t => t.toLowerCase()) : [];
                        if (tags.includes('exiled')) inUniverseStatus = 'Exiled';
                        else if (tags.includes('kia') || tags.includes('deceased')) inUniverseStatus = 'KIA';
                        else if (tags.includes('undercover') || tags.includes('dormant')) inUniverseStatus = 'Under Cover';
                        else inUniverseStatus = 'Active';
                    }

                    const location = this.cleanLinkName(yaml.location || yaml.assigned_base || yaml.headquarters || '');
                    if (location) this.sectors.add(location);
                    if (unit) this.factions.add(unit);

                    const role = yaml.subtitle || yaml.rank || yaml.specialty || yaml.unit_role || yaml.purpose || '';
                    const image = this.extractImageThumbnail(yaml, body, baseName);
                    const links = this.extractWikilinks(content);
                    const uid = yaml.UID || yaml.uid || `dossier.${baseName.toLowerCase().replace(/[^a-z0-9]/g, '-')}.parialfare-reimagined`;

                    const dossier = {
                        fullPath: f,
                        relPath,
                        baseName,
                        scope: target.scope,
                        title: yaml.title || baseName,
                        subtitle: yaml.subtitle || '',
                        uid,
                        entityType,
                        unit: unit || 'Independent / Unassigned',
                        editorialStatus,
                        inUniverseStatus,
                        role,
                        location: location || 'Unspecified Sector',
                        image,
                        imageStatus: yaml.image_status || (yaml.is_concept ? 'concept' : (image ? 'canon' : null)),
                        gallery: this.extractGalleryImages(yaml, body),
                        tags: Array.isArray(yaml.tags) ? yaml.tags : (yaml.tags ? [yaml.tags] : []),
                        links,
                        headings: this.extractHeadings(body),
                        excerpt: body.slice(0, 300).replace(/\r?\n/g, ' ').trim(),
                        rawYaml,
                        yaml,
                        body,
                        mtime: stat.mtimeMs,
                        mtimeIso: stat.mtime.toISOString(),
                        hash: this.computeHash(content),
                        wordCount: (body.match(/\b\S+\b/g) || []).length
                    };

                    this.dossiers.set(f, dossier);
                    this.byBaseName.set(baseName.toLowerCase(), dossier);
                    this.byUID.set(uid.toLowerCase(), dossier);

                } catch (e) {
                    console.error(`[vault-indexer] Error indexing file ${f}:`, e.message);
                }
            }
        }

        // Build Backlinks & Broken Link Graph
        for (const [f, dossier] of this.dossiers.entries()) {
            for (const l of dossier.links) {
                const targetKey = l.target.toLowerCase();
                const targetDossier = this.byBaseName.get(targetKey);

                if (!targetDossier) {
                    // Check if it's an alias or heading
                    this.unresolvedLinks.push({
                        sourceBaseName: dossier.baseName,
                        sourcePath: dossier.fullPath,
                        sourceTitle: dossier.title,
                        targetName: l.target
                    });
                } else {
                    if (!this.backlinks.has(targetKey)) {
                        this.backlinks.set(targetKey, []);
                    }
                    // Extract sentence context around link
                    const snippet = this.extractSentenceContext(dossier.body, l.target);
                    this.backlinks.get(targetKey).push({
                        sourceBaseName: dossier.baseName,
                        sourcePath: dossier.fullPath,
                        sourceTitle: dossier.title,
                        sourceUnit: dossier.unit,
                        snippet
                    });
                }
            }
        }

        this.lastBuildTime = Date.now();
        console.log(`[vault-indexer] Index complete: ${this.dossiers.size} dossiers indexed, ${this.unresolvedLinks.length} unresolved wikilinks.`);
        return this.getSummary();
    }

    extractHeadings(body) {
        const lines = body.split(/\r?\n/);
        const headings = [];
        for (const l of lines) {
            const m = l.match(/^(#{1,4})\s+(.+)$/);
            if (m) {
                headings.push({
                    level: m[1].length,
                    text: m[2].trim(),
                    anchor: m[2].toLowerCase().replace(/[^a-z0-9]+/g, '-')
                });
            }
        }
        return headings;
    }

    extractSentenceContext(body, term) {
        const regex = new RegExp(`([^.!?\\r\\n]*\\[\\[[^\\]]*${term}[^\\]]*\\]\\][^.!?\\r\\n]*[.!?])`, 'i');
        const match = body.match(regex);
        if (match) {
            return match[1].replace(/\[\[(.*?)\]\]/g, '$1').trim();
        }
        return `Referenced in contextual operational notes.`;
    }

    walk(dir, results = []) {
        if (!fs.existsSync(dir)) return results;
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== '.git' && entry.name !== 'node_modules') {
                    this.walk(full, results);
                }
            } else if (entry.isFile() && entry.name.endsWith('.md')) {
                results.push(full);
            }
        }
        return results;
    }

    // Quick Search (Ctrl+K)
    search(query, limit = 15) {
        if (!query || !query.trim()) return [];
        const q = query.toLowerCase().trim();
        const matches = [];

        for (const [path, d] of this.dossiers.entries()) {
            let score = 0;
            const baseLower = d.baseName.toLowerCase();
            const titleLower = d.title.toLowerCase();

            if (baseLower === q || titleLower === q) score += 100;
            else if (baseLower.startsWith(q) || titleLower.startsWith(q)) score += 50;
            else if (baseLower.includes(q) || titleLower.includes(q)) score += 25;
            else if (d.unit.toLowerCase().includes(q)) score += 15;
            else if (d.role.toLowerCase().includes(q)) score += 10;
            else if (d.excerpt.toLowerCase().includes(q)) score += 5;

            if (score > 0) {
                matches.push({ score, dossier: this.toSummaryCard(d) });
            }
        }

        matches.sort((a, b) => b.score - a.score);
        return matches.slice(0, limit).map(m => m.dossier);
    }

    // Card representation for Roster Strips
    toSummaryCard(d) {
        return {
            fullPath: d.fullPath,
            baseName: d.baseName,
            title: d.title,
            subtitle: d.subtitle || d.role,
            uid: d.uid,
            entityType: d.entityType,
            unit: d.unit,
            editorialStatus: d.editorialStatus,
            inUniverseStatus: d.inUniverseStatus,
            role: d.role,
            location: d.location,
            image: d.image,
            hasImage: !!d.image,
            initials: d.title ? d.title.charAt(0).toUpperCase() : '?',
            wordCount: d.wordCount,
            scope: d.scope,
            mtime: d.mtime
        };
    }

    // Get Structured Roster Groups
    getRosters(category = 'all', sector = 'all', searchQuery = '') {
        const result = {
            total: 0,
            rosters: {}, // unitName -> [ card, card ]
            categories: { character: 0, faction: 0, event: 0, location: 0, concept: 0, incident: 0 }
        };

        const q = searchQuery ? searchQuery.toLowerCase().trim() : '';

        for (const [path, d] of this.dossiers.entries()) {
            // Category filter
            if (category !== 'all' && d.entityType.toLowerCase() !== category.toLowerCase()) {
                continue;
            }

            // Sector filter
            if (sector !== 'all') {
                const sLower = sector.toLowerCase();
                const dLocLower = d.location.toLowerCase();
                if (!dLocLower.includes(sLower) && !d.unit.toLowerCase().includes(sLower)) {
                    continue;
                }
            }

            // Search filter
            if (q) {
                const match = d.title.toLowerCase().includes(q) ||
                              d.baseName.toLowerCase().includes(q) ||
                              d.role.toLowerCase().includes(q) ||
                              d.unit.toLowerCase().includes(q);
                if (!match) continue;
            }

            result.total++;
            const eType = d.entityType.toLowerCase();
            if (result.categories[eType] !== undefined) result.categories[eType]++;

            const unitKey = d.unit || 'Independent / General';
            if (!result.rosters[unitKey]) {
                result.rosters[unitKey] = [];
            }
            result.rosters[unitKey].push(this.toSummaryCard(d));
        }

        // Sort operatives alphabetically in each unit
        for (const u of Object.keys(result.rosters)) {
            result.rosters[u].sort((a, b) => a.title.localeCompare(b.title));
        }

        return result;
    }

    // Single Dossier View (Read & Backlinks)
    getDossier(filePath) {
        const dossier = this.dossiers.get(filePath);
        if (!dossier) return null;

        const baseKey = dossier.baseName.toLowerCase();
        const backlinks = this.backlinks.get(baseKey) || [];

        // Check snapshots count
        const safeId = dossier.uid.replace(/[^a-z0-9_-]/gi, '_');
        let snapshotCount = 0;
        try {
            const snaps = fs.readdirSync(this.snapshotsDir).filter(f => f.startsWith(safeId));
            snapshotCount = snaps.length;
        } catch (e) {}

        return {
            ...dossier,
            backlinks,
            snapshotCount
        };
    }

    // Helper alias
    safeSave(fullPath, content) {
        return this.saveDossierSafely({ fullPath, content });
    }

    // Safe File Writing with Snapshots & Mtime Conflict Checking
    saveDossierSafely({ fullPath, content, expectedMtime, proseOnly, newBody }) {
        if (!fs.existsSync(fullPath)) {
            return { error: 'Target file not found', code: 404 };
        }

        const currentStat = fs.statSync(fullPath);
        // Conflict Check (allow 1.5s clock tolerance)
        if (expectedMtime && currentStat.mtimeMs > (expectedMtime + 1500)) {
            return {
                conflict: true,
                message: 'File was modified externally (e.g. by Chronicler) since last opened.',
                serverMtime: currentStat.mtimeMs,
                serverContent: fs.readFileSync(fullPath, 'utf8')
            };
        }

        const currentContent = fs.readFileSync(fullPath, 'utf8');
        let finalContent = content;

        // If proseOnly is set, surgical replacement preserving frontmatter 100%
        if (proseOnly && newBody !== undefined) {
            const fmMatch = currentContent.match(/^---\r?\n[\s\S]*?\r?\n---/);
            if (fmMatch) {
                finalContent = fmMatch[0] + '\r\n\r\n' + newBody.replace(/\r?\n/g, '\r\n');
            } else {
                finalContent = newBody.replace(/\r?\n/g, '\r\n');
            }
        } else {
            finalContent = finalContent.replace(/\r?\n/g, '\r\n');
        }

        // 1. Create rotating snapshot in studio/.snapshots/
        const baseName = path.basename(fullPath, '.md');
        const dossier = this.dossiers.get(fullPath);
        const safeUid = (dossier?.uid || baseName).replace(/[^a-z0-9_-]/gi, '_');
        const snapTimestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const snapPath = path.join(this.snapshotsDir, `${safeUid}_${snapTimestamp}.md`);

        try {
            fs.writeFileSync(snapPath, currentContent, 'utf8');

            // Rotate snapshots: keep last 10
            const existingSnaps = fs.readdirSync(this.snapshotsDir)
                .filter(f => f.startsWith(safeUid + '_') && f.endsWith('.md'))
                .sort();
            if (existingSnaps.length > 10) {
                const toDelete = existingSnaps.slice(0, existingSnaps.length - 10);
                for (const d of toDelete) {
                    fs.unlinkSync(path.join(this.snapshotsDir, d));
                }
            }
        } catch (e) {
            console.error('[vault-indexer] Warning: Snapshot creation failed:', e.message);
        }

        // 2. Atomic Write
        const tempPath = `${fullPath}.tmp_${Date.now()}`;
        try {
            fs.writeFileSync(tempPath, finalContent, 'utf8');
            const tmpStat = fs.statSync(tempPath);
            if (tmpStat.size === 0) {
                throw new Error('Temp file is empty; aborting atomic replace');
            }
            fs.renameSync(tempPath, fullPath);
        } catch (e) {
            if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
            return { error: `Atomic write failed: ${e.message}`, code: 500 };
        }

        // 3. Update in-memory index immediately
        this.buildIndex();

        const updatedStat = fs.statSync(fullPath);
        return {
            success: true,
            path: fullPath,
            mtime: updatedStat.mtimeMs,
            hash: this.computeHash(finalContent)
        };
    }

    // List Snapshots for Diff / History
    listSnapshots(filePath) {
        const dossier = this.dossiers.get(filePath);
        if (!dossier) return [];
        const safeUid = dossier.uid.replace(/[^a-z0-9_-]/gi, '_');
        try {
            const files = fs.readdirSync(this.snapshotsDir)
                .filter(f => f.startsWith(safeUid + '_') && f.endsWith('.md'))
                .sort().reverse();
            return files.map(f => ({
                fileName: f,
                timestamp: f.replace(`${safeUid}_`, '').replace('.md', '').replace(/-/g, ':')
            }));
        } catch (e) {
            return [];
        }
    }

    // Backlink Impact Audit for Deletion / Archival
    getImpactAudit(filePaths = []) {
        const targetSets = new Map(); // targetLower -> filePath
        const targetsSummary = [];

        for (const fp of filePaths) {
            const d = this.dossiers.get(fp);
            if (!d) continue;
            const names = [d.title, path.basename(fp, '.md')];
            if (Array.isArray(d.alias)) names.push(...d.alias);
            else if (d.alias) names.push(d.alias);

            for (const n of names) {
                if (n) targetSets.set(n.trim().toLowerCase(), fp);
            }
            targetsSummary.push({ path: fp, title: d.title, unit: d.unit });
        }

        const referencingFiles = [];
        let totalIncomingReferences = 0;

        for (const [otherPath, otherDossier] of this.dossiers.entries()) {
            if (filePaths.includes(otherPath)) continue;
            let matchCount = 0;
            const matchedTargets = new Set();

            for (const linkObj of (otherDossier.links || [])) {
                const targetStr = typeof linkObj === 'string' ? linkObj : linkObj.target;
                if (!targetStr) continue;
                const linkLower = targetStr.toLowerCase();
                if (targetSets.has(linkLower)) {
                    matchCount++;
                    matchedTargets.add(targetStr);
                }
            }

            if (matchCount > 0) {
                totalIncomingReferences += matchCount;
                referencingFiles.push({
                    title: otherDossier.title,
                    unit: otherDossier.unit,
                    path: otherPath,
                    matchCount,
                    matchedTargets: Array.from(matchedTargets)
                });
            }
        }

        return {
            targetCount: targetsSummary.length,
            targets: targetsSummary,
            totalIncomingReferences,
            referencingFiles: referencingFiles.sort((a, b) => b.matchCount - a.matchCount)
        };
    }

    // Safe File Archival (Staging to .archive/) or Permanent Deletion
    archiveFiles(filePaths = [], permanent = false) {
        const rootDir = this.enVaultDir || this.continuitiesDir;
        const archiveDir = path.join(rootDir, '.archive');
        if (!fs.existsSync(archiveDir)) {
            fs.mkdirSync(archiveDir, { recursive: true });
        }

        const results = [];
        for (const fp of filePaths) {
            if (!fs.existsSync(fp)) continue;
            const baseName = path.basename(fp);

            // 1. Take safety snapshot in .snapshots before any removal
            try {
                const content = fs.readFileSync(fp, 'utf8');
                const d = this.dossiers.get(fp);
                const safeUid = d ? d.uid.replace(/[^a-z0-9_-]/gi, '_') : baseName.replace(/[^a-z0-9_-]/gi, '_');
                const snapName = `${safeUid}_prearchive_${Date.now()}.md`;
                fs.writeFileSync(path.join(this.snapshotsDir, snapName), content, 'utf8');
            } catch (e) {}

            if (permanent) {
                fs.unlinkSync(fp);
                results.push({ path: fp, status: 'deleted' });
            } else {
                let destPath = path.join(archiveDir, baseName);
                if (fs.existsSync(destPath)) {
                    destPath = path.join(archiveDir, `${Date.now()}_${baseName}`);
                }
                fs.renameSync(fp, destPath);
                results.push({ path: fp, dest: destPath, status: 'archived' });
            }
        }

        // Rebuild index
        this.buildIndex();
        return { success: true, processedCount: results.length, results };
    }

    // Batch Reassign Unit / Faction
    batchReassignUnit(filePaths = [], newUnit = '') {
        if (!newUnit) return { error: 'No unit provided' };
        let modified = 0;

        for (const fp of filePaths) {
            if (!fs.existsSync(fp)) continue;
            try {
                let content = fs.readFileSync(fp, 'utf8');
                const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                if (!fmMatch) continue;

                let oldFm = fmMatch[1];
                let newFm;
                if (/^unit:\s*.*$/m.test(oldFm)) {
                    newFm = oldFm.replace(/^unit:\s*.*$/m, `unit: "${newUnit}"`);
                } else {
                    newFm = `unit: "${newUnit}"\n${oldFm}`;
                }
                const updatedContent = content.replace(fmMatch[0], `---\n${newFm}\n---`);
                this.safeSave(fp, updatedContent);
                modified++;
            } catch (e) {
                console.error(`[vault-indexer] Failed to reassign unit for ${fp}:`, e.message);
            }
        }

        this.buildIndex();
        return { success: true, modified };
    }

    // Batch Set Status (Editorial or In-Universe)
    batchSetStatus(filePaths = [], { editorialStatus, inUniverseStatus } = {}) {
        let modified = 0;

        for (const fp of filePaths) {
            if (!fs.existsSync(fp)) continue;
            try {
                let content = fs.readFileSync(fp, 'utf8');
                const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
                if (!fmMatch) continue;

                let fm = fmMatch[1];
                if (editorialStatus) {
                    if (/^editorial_status:\s*.*$/m.test(fm)) {
                        fm = fm.replace(/^editorial_status:\s*.*$/m, `editorial_status: "${editorialStatus}"`);
                    } else {
                        fm = `editorial_status: "${editorialStatus}"\n${fm}`;
                    }
                }
                if (inUniverseStatus) {
                    if (/^in_universe_status:\s*.*$/m.test(fm)) {
                        fm = fm.replace(/^in_universe_status:\s*.*$/m, `in_universe_status: "${inUniverseStatus}"`);
                    } else {
                        fm = `in_universe_status: "${inUniverseStatus}"\n${fm}`;
                    }
                }
                const updatedContent = content.replace(fmMatch[0], `---\n${fm}\n---`);
                this.safeSave(fp, updatedContent);
                modified++;
            } catch (e) {
                console.error(`[vault-indexer] Failed to update status for ${fp}:`, e.message);
            }
        }

        this.buildIndex();
        return { success: true, modified };
    }

    // Attach Image (Primary Portrait or Gallery Asset)
    attachImage({ filePath, buffer, filename, slot = 'primary', caption = '', isConcept = true }) {
        if (!fs.existsSync(filePath)) throw new Error('Dossier file not found: ' + filePath);
        
        // 1. Target asset directories: English Vault Assets & Quartz content assets
        const rootAssets = path.join(this.enVaultDir || this.continuitiesDir, 'Assets', 'Images');
        const quartzAssets = path.join(path.resolve(this.continuitiesDir, '../../../../quartz-site/content/assets'));
        
        if (!fs.existsSync(rootAssets)) fs.mkdirSync(rootAssets, { recursive: true });
        if (fs.existsSync(path.dirname(quartzAssets)) && !fs.existsSync(quartzAssets)) {
            try { fs.mkdirSync(quartzAssets, { recursive: true }); } catch (e) {}
        }

        // 2. Save binary image file
        const finalPathRoot = path.join(rootAssets, filename);
        fs.writeFileSync(finalPathRoot, buffer);
        if (fs.existsSync(quartzAssets)) {
            try { fs.writeFileSync(path.join(quartzAssets, filename), buffer); } catch(e) {}
        }

        // 3. Update Markdown Frontmatter non-destructively
        let content = fs.readFileSync(filePath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) throw new Error('Markdown missing YAML frontmatter');

        let fm = fmMatch[1];
        if (slot === 'primary') {
            const formattedImage = caption ? `[[${filename}, "${caption}"]]` : `[[${filename}]]`;
            if (/^image:\s*.*$/m.test(fm)) {
                fm = fm.replace(/^image:\s*.*$/m, `image: '${formattedImage}'`);
            } else {
                fm = `image: '${formattedImage}'\n${fm}`;
            }
            const statusVal = isConcept ? 'concept' : 'canon';
            if (/^image_status:\s*.*$/m.test(fm)) {
                fm = fm.replace(/^image_status:\s*.*$/m, `image_status: "${statusVal}"`);
            } else {
                fm = `image_status: "${statusVal}"\n${fm}`;
            }
        } else if (slot === 'gallery') {
            const cleanName = filename;
            if (/^gallery:\s*\[(.*?)\]/m.test(fm)) {
                const currentArr = fm.match(/^gallery:\s*\[(.*?)\]/m)[1];
                const items = currentArr.split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
                if (!items.includes(cleanName)) items.push(cleanName);
                fm = fm.replace(/^gallery:\s*\[.*?\]/m, `gallery: [${items.map(i => `"${i}"`).join(', ')}]`);
            } else if (/^gallery:/m.test(fm)) {
                fm += `\n  - "${cleanName}"`;
            } else {
                fm = `gallery: ["${cleanName}"]\n${fm}`;
            }
        }

        const updatedContent = content.replace(fmMatch[0], `---\n${fm}\n---`);
        this.safeSave(filePath, updatedContent);
        this.buildIndex();

        return {
            success: true,
            fileName: filename,
            assetUrl: `/api/assets/${filename}`,
            slot,
            isConcept
        };
    }

    // Toggle between Concept Placeholder & Canon Artwork status
    toggleImageConceptStatus(filePath) {
        if (!fs.existsSync(filePath)) return { error: 'File not found' };
        let content = fs.readFileSync(filePath, 'utf8');
        const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) return { error: 'No frontmatter' };

        let fm = fmMatch[1];
        const isCurrentConcept = /image_status:\s*["']?concept["']?/i.test(fm);
        const newStatus = isCurrentConcept ? 'canon' : 'concept';

        if (/^image_status:\s*.*$/m.test(fm)) {
            fm = fm.replace(/^image_status:\s*.*$/m, `image_status: "${newStatus}"`);
        } else {
            fm = `image_status: "${newStatus}"\n${fm}`;
        }

        const updatedContent = content.replace(fmMatch[0], `---\n${fm}\n---`);
        this.safeSave(filePath, updatedContent);
        this.buildIndex();
        return { success: true, newStatus };
    }

    getSummary() {
        return {
            totalDossiers: this.dossiers.size,
            unresolvedCount: this.unresolvedLinks.length,
            sectorsCount: this.sectors.size,
            factionsCount: this.factions.size,
            lastBuildTime: this.lastBuildTime
        };
    }
}

module.exports = VaultIndexer;
