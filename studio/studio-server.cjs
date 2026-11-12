/**
 * Nolheim Studio Server
 * 
 * Hybrid Gateway providing:
 * 1. Embedded Single-Page Application (SPA) serving
 * 2. REST API for Notes, Lexicon, Sandbox, and System Vitals
 * 3. WebSocket real-time terminal log streaming
 * 4. Multi-Provider LLM Hub (Gemini, Claude, OpenAI, Ollama, anybridge)
 * 5. Quartz Operations (staging, preview, promote, deploy, bundle, lint, polish)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const { WebSocketServer } = require('ws');

// Paths
const STUDIO_DIR = __dirname;
const PUBLIC_DIR = path.join(STUDIO_DIR, 'public');
const CONFIG_FILE = path.join(STUDIO_DIR, 'studio-config.json');
const CHAT_SESSIONS_DIR = path.join(STUDIO_DIR, 'chat_sessions');
const QUARTZ_DIR = path.resolve(STUDIO_DIR, '..');
const ROOT_DOCS = path.resolve(QUARTZ_DIR, '..');
const EN_VAULT = path.join(ROOT_DOCS, 'Worldbuild & IP', 'Nolheim');
const KM_VAULT = path.join(ROOT_DOCS, 'Worldbuild & IP', 'Nolheim-Khmer');
const SANDBOX_DIR = path.join(EN_VAULT, 'Sandbox');
const CONTINUITIES_DIR = path.join(EN_VAULT, 'Continuities', 'Parialfare - Reimagined');
const SNAPSHOTS_DIR = path.join(EN_VAULT, 'Archives', 'Publish snapshots');
const LEXICON_FILE = path.join(KM_VAULT, 'System', 'LEXICON.md');
const DICTIONARY_FILE = path.join(QUARTZ_DIR, 'khmer-dictionary.json');
const SNAPSHOTS_VAULT_DIR = path.join(STUDIO_DIR, '.snapshots');
const VaultIndexer = require('./vault-indexer.cjs');

// Ensure Sandbox, Snapshots, and Chat Sessions exist
if (!fs.existsSync(SANDBOX_DIR)) {
    fs.mkdirSync(SANDBOX_DIR, { recursive: true });
}
if (!fs.existsSync(SNAPSHOTS_VAULT_DIR)) {
    fs.mkdirSync(SNAPSHOTS_VAULT_DIR, { recursive: true });
}
if (!fs.existsSync(CHAT_SESSIONS_DIR)) {
    fs.mkdirSync(CHAT_SESSIONS_DIR, { recursive: true });
}

// In-Memory Vault Index
const vaultIndexer = new VaultIndexer({
    enVaultDir: EN_VAULT,
    kmVaultDir: KM_VAULT,
    continuitiesDir: CONTINUITIES_DIR,
    sandboxDir: SANDBOX_DIR,
    snapshotsDir: SNAPSHOTS_VAULT_DIR
});
vaultIndexer.buildIndex();

// Watch for external file changes (e.g. from desktop Chronicler)
let vaultWatchDebounce = null;
try {
    if (fs.existsSync(CONTINUITIES_DIR)) {
        fs.watch(CONTINUITIES_DIR, { recursive: true }, (evt, filename) => {
            if (filename && filename.endsWith('.md')) {
                clearTimeout(vaultWatchDebounce);
                vaultWatchDebounce = setTimeout(() => {
                    vaultIndexer.buildIndex();
                    broadcastEvent('vault_updated', vaultIndexer.getSummary());
                }, 400);
            }
        });
    }
} catch (e) {
    console.warn('[studio] Vault file watching disabled:', e.message);
}

// Config Loader
function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('[studio] Error loading config:', e.message);
    }
    return {
        port: 3333,
        activeProvider: 'gemini',
        providers: {},
        anybridgeUrl: 'http://localhost:3456'
    };
}

function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
}

let config = loadConfig();
const PORT = config.port || 3333;

// Active Command Processes
let activeProcess = null;
const wsClients = new Set();

function broadcastLog(data, stream = 'stdout') {
    const payload = JSON.stringify({ type: 'log', stream, data: data.toString() });
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(payload);
    }
}

function broadcastEvent(type, payload = {}) {
    const msg = JSON.stringify({ type, ...payload });
    for (const ws of wsClients) {
        if (ws.readyState === 1) ws.send(msg);
    }
}

// MIME types
const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8'
};

// YAML & Frontmatter Helpers
function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!match) return { yaml: {}, rawYaml: '', body: content.trim() };

    const rawYaml = match[1];
    const body = content.slice(match[0].length).trim();
    const yaml = {};

    for (const line of rawYaml.split(/\r?\n/)) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.slice(0, colonIdx).trim();
        let val = line.slice(colonIdx + 1).trim();

        if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
        } else {
            val = val.replace(/^['"]|['"]$/g, '');
        }
        yaml[key] = val;
    }
    return { yaml, rawYaml, body };
}

function serializeFrontmatter(yaml, body) {
    const lines = ['---'];
    for (const [k, v] of Object.entries(yaml)) {
        if (Array.isArray(v)) {
            lines.push(`${k}: [${v.map(i => `"${i}"`).join(', ')}]`);
        } else if (typeof v === 'string' && (v.includes(':') || v.includes('#') || v.includes('"'))) {
            lines.push(`${k}: "${v.replace(/"/g, '\\"')}"`);
        } else {
            lines.push(`${k}: ${v}`);
        }
    }
    lines.push('---');
    return lines.join('\r\n') + '\r\n\r\n' + body.replace(/\r?\n/g, '\r\n');
}

// Markdown File Walker
function walkMarkdown(dir, results = []) {
    if (!fs.existsSync(dir)) return results;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules') {
                walkMarkdown(full, results);
            }
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
            results.push(full);
        }
    }
    return results;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const pathname = urlObj.pathname;

    // CORS for local experimentation
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    // Helper: JSON response
    const sendJSON = (data, statusCode = 200) => {
        res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(data));
    };

    // Helper: Read request body
    const readBody = () => new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve(body);
            }
        });
        req.on('error', reject);
    });

    try {
        // --- API ROUTES ---

        // 1. System Vitals & Parity Status
        if (pathname === '/api/status' && req.method === 'GET') {
            let version = 'v000';
            try {
                const snapDirs = fs.readdirSync(SNAPSHOTS_DIR, { withFileTypes: true })
                    .filter(d => d.isDirectory() && d.name.startsWith('v'))
                    .map(d => d.name)
                    .sort().reverse();
                if (snapDirs.length > 0) version = snapDirs[0].split('-')[0];
            } catch (e) {}

            let bridgeListening = false;
            try {
                const netstat = cp.execSync('netstat -ano 2>nul').toString();
                bridgeListening = /:3456\s+.*LISTENING/i.test(netstat);
            } catch (e) {}

            let unpromoted = 'checking...';
            try {
                unpromoted = cp.execSync(`node "${path.join(QUARTZ_DIR, 'drift-check.cjs')}" --summary 2>nul`).toString().trim();
            } catch (e) {}

            let bilingual = 'checking...';
            try {
                const bTool = path.join(ROOT_DOCS, 'Worldbuild & IP', 'bilingual_tool.cjs');
                bilingual = cp.execSync(`node "${bTool}" drift --summary 2>nul`).toString().trim();
            } catch (e) {}

            const pending = fs.existsSync(path.join(QUARTZ_DIR, 'Promote-Request.json'));
            const bakFiles = walkMarkdown(KM_VAULT).filter(f => fs.existsSync(f + '.bak'));

            sendJSON({
                version,
                bridge: bridgeListening ? 'running on :3456' : 'stopped',
                bridgeOnline: bridgeListening,
                unpromoted,
                bilingual,
                pending,
                bakFilesCount: bakFiles.length,
                timestamp: new Date().toISOString()
            });
            return;
        }

        // --- VAULT INTELLIGENCE & SEMANTIC DOSSIERS API ---

        // 1. Vault Index Summary
        if (pathname === '/api/vault/summary' && req.method === 'GET') {
            sendJSON(vaultIndexer.getSummary());
            return;
        }

        // 2. Tactical Rosters API (Categorized, unit-based cards with density support)
        if (pathname === '/api/vault/rosters' && req.method === 'GET') {
            const category = urlObj.searchParams.get('category') || 'all';
            const sector = urlObj.searchParams.get('sector') || 'all';
            const search = urlObj.searchParams.get('search') || '';
            const rosters = vaultIndexer.getRosters(category, sector, search);
            sendJSON(rosters);
            return;
        }

        // 3. Single Dossier Details (with Chronicler layout & backlinks)
        if (pathname === '/api/vault/dossier' && req.method === 'GET') {
            const filePath = urlObj.searchParams.get('path');
            if (!filePath) {
                sendJSON({ error: 'path parameter required' }, 400);
                return;
            }
            const dossier = vaultIndexer.getDossier(filePath);
            if (!dossier) {
                sendJSON({ error: 'Dossier not found' }, 404);
                return;
            }
            sendJSON(dossier);
            return;
        }

        // 4. Safe Vault Save API (Atomic write, rotating snapshot, mtime conflict check)
        if (pathname === '/api/vault/save' && req.method === 'POST') {
            const payload = await readBody();
            if (!payload.fullPath) {
                sendJSON({ error: 'fullPath required' }, 400);
                return;
            }
            const saveRes = vaultIndexer.saveDossierSafely(payload);
            if (saveRes.conflict) {
                sendJSON(saveRes, 409);
                return;
            }
            if (saveRes.error) {
                sendJSON(saveRes, saveRes.code || 500);
                return;
            }
            broadcastEvent('file_saved', { path: payload.fullPath });
            sendJSON(saveRes);
            return;
        }

        // 5. Rotating Snapshots History
        if (pathname === '/api/vault/snapshots' && req.method === 'GET') {
            const filePath = urlObj.searchParams.get('path');
            sendJSON({ snapshots: vaultIndexer.listSnapshots(filePath) });
            return;
        }

        // 6. Rollback to Snapshot
        if (pathname === '/api/vault/rollback' && req.method === 'POST') {
            const { fullPath, snapshotFileName } = await readBody();
            if (!fullPath || !snapshotFileName) {
                sendJSON({ error: 'fullPath and snapshotFileName required' }, 400);
                return;
            }
            const snapPath = path.join(SNAPSHOTS_VAULT_DIR, snapshotFileName);
            if (!fs.existsSync(snapPath)) {
                sendJSON({ error: 'Snapshot file not found' }, 404);
                return;
            }
            const snapContent = fs.readFileSync(snapPath, 'utf8');
            const resRollback = vaultIndexer.saveDossierSafely({ fullPath, content: snapContent });
            broadcastEvent('file_saved', { path: fullPath });
            sendJSON({ success: true, rollback: resRollback });
            return;
        }

        // 7. Quick Switcher (Ctrl+K Fuzzy Search)
        if (pathname === '/api/vault/search' && req.method === 'GET') {
            const q = urlObj.searchParams.get('q') || '';
            const results = vaultIndexer.search(q);
            sendJSON({ results });
            return;
        }

        // 8. Guided Dossier Creation Wizard
        if (pathname === '/api/vault/create' && req.method === 'POST') {
            const { name, entityType, unit, role, tier, location, scope } = await readBody();
            if (!name || !name.trim()) {
                sendJSON({ error: 'Entity name is required' }, 400);
                return;
            }

            const cleanName = name.trim();
            const kebabTitle = cleanName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const targetScope = scope === 'sandbox' ? SANDBOX_DIR : CONTINUITIES_DIR;
            const typeFolder = (entityType || 'character').charAt(0).toUpperCase() + (entityType || 'character').slice(1) + 's';
            
            let destFolder = path.join(targetScope, typeFolder);
            if (entityType === 'character' && unit && unit !== 'Independent') {
                destFolder = path.join(destFolder, unit.replace(/[/\\?%*:|"<>]/g, ''));
            }
            if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

            const targetFilePath = path.join(destFolder, `${cleanName}.md`);
            if (fs.existsSync(targetFilePath)) {
                sendJSON({ error: `Dossier "${cleanName}" already exists at target location.` }, 409);
                return;
            }

            // Generate Chronicler-compliant template adhering to NOTE_SCHEMA.md
            const eType = (entityType || 'character').toLowerCase();
            const unitClean = unit || 'Independent';
            const roleClean = role || 'Operative descriptor';
            const tierClean = tier || 'Field Operator';
            const uid = `${eType}.${kebabTitle}.parialfare-reimagined`;

            let templateYaml = '';
            let templateBody = '';

            if (eType === 'character') {
                templateYaml = `---
title: ${cleanName}
subtitle: ${roleClean}
tags: [character, reimagined, parialfare, ${unitClean.toLowerCase().replace(/[^a-z0-9]/g, '')}, military]

# Infobox Image
image: [[${cleanName}.png, "${cleanName}"]]

# Mandatory Classifiers
entity-type: character
character-type: ["Military/Operative"]
continuity: '[[Parialfare: Reimagined]]'
UID: ${uid}
subject: ${kebabTitle}

# Identity
alias: ["${cleanName}"]
unit: '[[${unitClean}]]'
tier: ${tierClean}

# Operator
specialty: "Unresolved"
unit_role: ${roleClean}
collaborator: '[[Unassigned]]'

# Chronicler Infobox Layout Rules
layout:
  - type: header
    text: "Identity"
    above: alias
  - alias
  - unit
  - tier

  - type: header
    text: "Operator"
    above: specialty
  - specialty
  - unit_role
  - collaborator

  - type: separator
    above: entity-type
  - type: header
    text: "Classifiers"
    above: entity-type
---`;
                templateBody = `# ${cleanName}\n\n**${cleanName}** is an operative of [[${unitClean}]].\n\n## Background\n\nRecord pending verification.\n\n## Specialisation\n\nOperational assignment pending field deployment.\n\n## Unresolved\n\n- **Origin:** unestablished.\n- **Service Record:** classified.\n\n## See Also\n\n* [[${unitClean}]]\n`;

            } else if (eType === 'faction') {
                templateYaml = `---
title: ${cleanName}
subtitle: ${roleClean}
tags: [faction, military, reimagined, parialfare]

# Mandatory Classifiers
entity-type: faction
faction-type: ["Military/Formation"]
continuity: '[[Parialfare: Reimagined]]'
UID: ${uid}
subject: ${kebabTitle}

# Organization Overview
active: "2008–present"
established_by: "[[VISTA]]"
commander: "[[Unassigned]]"
purpose: "${roleClean}"

# Chronicler Infobox Layout Rules
layout:
  - type: header
    text: "Organization Overview"
    above: active
  - active
  - established_by
  - commander
  - purpose

  - type: separator
    above: entity-type
  - type: header
    text: "Classifiers"
    above: entity-type
---`;
                templateBody = `# ${cleanName}\n\n**${cleanName}** is a military formation operating in the [[Ironclad DMZ]] frontier.\n\n## Operational Doctrine\n\nInstitutional records pending review.\n\n## See Also\n\n* [[Parialfare: Reimagined]]\n`;

            } else {
                templateYaml = `---
title: ${cleanName}
subtitle: ${roleClean}
tags: [${eType}, reimagined, parialfare]

# Mandatory Classifiers
entity-type: ${eType}
${eType}-type: ["General"]
continuity: '[[Parialfare: Reimagined]]'
UID: ${uid}
subject: ${kebabTitle}

# Chronicler Infobox Layout Rules
layout:
  - type: header
    text: "Classifiers"
    above: entity-type
---`;
                templateBody = `# ${cleanName}\n\nDetailed records for ${cleanName}.\n`;
            }

            const initialContent = `${templateYaml}\r\n\r\n${templateBody}`;
            fs.writeFileSync(targetFilePath, initialContent, 'utf8');

            // Refresh Index
            vaultIndexer.buildIndex();
            broadcastEvent('file_saved', { path: targetFilePath });

            sendJSON({
                success: true,
                filePath: targetFilePath,
                dossier: vaultIndexer.getDossier(targetFilePath)
            });
            return;
        }

        // 9. Smart Grounded AI Bundler (Tier 0 + Tier 1 + Tier 2 + Negative Lore Guardrails)
        if (pathname === '/api/vault/bundle' && req.method === 'POST') {
            const { targetUnit, targetPath, targetPaths, temporalAnchor } = await readBody();

            const OVERVIEW_FILE = path.join(CONTINUITIES_DIR, 'Overview.md');
            let tier0Overview = '';
            if (fs.existsSync(OVERVIEW_FILE)) {
                tier0Overview = fs.readFileSync(OVERVIEW_FILE, 'utf8');
            }

            // Tier 1: Unit, Single Dossier, or Multi-selected Dossiers
            const tier1Dossiers = [];
            const tier2LinkedNames = new Set();

            if (targetPaths && Array.isArray(targetPaths)) {
                for (const p of targetPaths) {
                    const full = vaultIndexer.getDossier(p);
                    if (full) {
                        tier1Dossiers.push(full);
                        for (const l of full.links) tier2LinkedNames.add(l.target.toLowerCase());
                    }
                }
            } else if (targetPath) {
                const single = vaultIndexer.getDossier(targetPath);
                if (single) {
                    tier1Dossiers.push(single);
                    for (const l of single.links) tier2LinkedNames.add(l.target.toLowerCase());
                }
            } else if (targetUnit) {
                const rosters = vaultIndexer.getRosters('all', 'all');
                const unitCards = rosters.rosters[targetUnit] || [];
                for (const c of unitCards) {
                    const full = vaultIndexer.getDossier(c.fullPath);
                    if (full) {
                        tier1Dossiers.push(full);
                        for (const l of full.links) tier2LinkedNames.add(l.target.toLowerCase());
                    }
                }
            }

            // Tier 2: 1-hop Linked Summaries
            const tier2Summaries = [];
            for (const nameKey of tier2LinkedNames) {
                const linkedD = vaultIndexer.byBaseName.get(nameKey);
                if (linkedD && !tier1Dossiers.find(d => d.baseName.toLowerCase() === nameKey)) {
                    tier2Summaries.push(`- **[[${linkedD.title}]]** (${linkedD.entityType}, ${linkedD.unit}): ${linkedD.role}. ${linkedD.excerpt.slice(0, 180)}...`);
                }
            }

            // Anti-Hallucination Negative Guardrails
            const anchorDate = temporalAnchor || '2008 (Post-Pocheasang Raid, Pre-GIC Full Campaign)';
            const guardrailsText = `CRITICAL CANON RULES & NEGATIVE LORE (NEVER VIOLATE):
1. TEMPORAL ANCHOR: The world date is strictly anchored to: ${anchorDate}. Do not jump to future dates (2024, 2025).
2. "[[2008 Pocheasang Palace raid]]" is a historical event that occurred on 25–26 August 2008. It is a past EVENT, NEVER an active enemy group or army.
3. "[[Parialfare: Reimagined]]" is the META CONTINUITY NAME, never an in-universe physical item, weapon, or political leverage.
4. [[LENDERMAIRE]] is an anomalous 13-member rural black ops household in the southern Ironclad DMZ on land owned by warlord [[Konish Kimbotin]]. They do NOT oppose Konish. It is NOT a high-tech corporate tower.
5. [[Ironish Task Force (ITF)]] is a private military contractor (PMC) founded in 1998, answering to Northrad, guarding New Aester. It is NOT "Inter-Territorial Forces" and NOT an Anajak sub-unit.
6. [[Anajak Forces]] is the anti-insurgency task force under the GIC led by [[General Ramcher]], utilizing facility-conditioned assassins from [[Site-29]].
7. FORMAT REQUIREMENT: When generating notes or dialogue, maintain detached institutional records, concrete tactical terminology, valid Chronicler YAML frontmatter, and correct [[wikilinks]].`;

            // Assemble Master Bundle
            let bundle = `================================================================================
NOLHEIM CANON INTELLIGENCE BUNDLE: ${targetUnit || (targetPath ? path.basename(targetPath, '.md') : 'CONTINUITY')}
ANCHOR DATE: ${anchorDate}
================================================================================

[SYSTEM DIRECTIVE & ROLE]
You are the lead narrative architect and continuity keeper for the dark military-fiction universe "Nolheim" (Continuity: Parialfare: Reimagined).
Adhere strictly to established institutional records, grounded Cold War atmosphere, and tactical realism.

--------------------------------------------------------------------------------
[NEGATIVE LORE & ANTI-HALLUCINATION GUARDRAILS]
--------------------------------------------------------------------------------
${guardrailsText}

--------------------------------------------------------------------------------
[TIER 0: MASTER GEOPOLITICAL CANON OVERVIEW]
--------------------------------------------------------------------------------
${tier0Overview}

--------------------------------------------------------------------------------
[TIER 1: PRIMARY DOSSIERS (${tier1Dossiers.length} files)]
--------------------------------------------------------------------------------
`;

            for (const d of tier1Dossiers) {
                bundle += `\n### FILE: ${d.baseName}.md (UID: ${d.uid})\n\`\`\`markdown\n---\n${d.rawYaml}\n---\n\n${d.body}\n\`\`\`\n`;
            }

            if (tier2Summaries.length > 0) {
                bundle += `\n--------------------------------------------------------------------------------\n[TIER 2: 1-HOP CONNECTED CANON ENTITIES (${tier2Summaries.length} references)]\n--------------------------------------------------------------------------------\n${tier2Summaries.join('\n')}\n`;
            }

            bundle += `\n================================================================================\nEND OF BUNDLE. Output only canon-compliant responses strictly observing the above ground truth.\n================================================================================\n`;

            // Estimate tokens (~4 chars per token)
            const estimatedTokens = Math.round(bundle.length / 4);

            sendJSON({
                success: true,
                bundle,
                estimatedTokens,
                dossiersCount: tier1Dossiers.length,
                referencesCount: tier2Summaries.length
            });
            return;
        }

        // 10. Ingest & Lint AI Draft Checker
        if (pathname === '/api/vault/ingest-lint' && req.method === 'POST') {
            const { draftText } = await readBody();
            if (!draftText || !draftText.trim()) {
                sendJSON({ error: 'draftText is required' }, 400);
                return;
            }

            const errors = [];
            const warnings = [];

            // 1. YAML frontmatter check
            const fmMatch = draftText.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!fmMatch) {
                errors.push('Missing valid YAML frontmatter delimiters (--- ... ---).');
            } else {
                const fm = fmMatch[1];
                if (!fm.includes('UID:') && !fm.includes('uid:')) errors.push('Missing mandatory UID field.');
                if (!fm.includes('entity-type:')) errors.push('Missing mandatory entity-type classifier.');
                if (!fm.includes('layout:')) warnings.push('Missing Chronicler layout: rules; infobox may not render properly.');
            }

            // 2. Hallucination checks
            if (/inter-territorial forces/i.test(draftText)) {
                errors.push('Hallucination detected: "Inter-Territorial Forces". ITF stands for "Ironish Task Force" (PMC).');
            }
            if (/operations against (the )?\[*2008 Pocheasang Palace raid/i.test(draftText)) {
                errors.push('Hallucination detected: 2008 Pocheasang Palace raid is a past event, not an active enemy group.');
            }
            if (/tower alpha/i.test(draftText)) {
                errors.push('Hallucination detected: "Tower Alpha". LENDERMAIRE is an anomalous rural household in the DMZ, not a corporate skyscraper.');
            }
            if (/\b(202[4-9]|203\d)\b/.test(draftText)) {
                warnings.push('Date past 2008 detected. Nolheim setting is strictly anchored in 2008 Cold War technology.');
            }
            if (/\[*Parialfare:\s*Reimagined\]*\s+(leverage|weapon|asset|device)/i.test(draftText)) {
                errors.push('Hallucination detected: Treating continuity title "Parialfare: Reimagined" as an in-world item or leverage.');
            }

            sendJSON({
                valid: errors.length === 0,
                errors,
                warnings
            });
            return;
        }

        // 11. Backlink Impact Audit API
        if (pathname === '/api/vault/impact' && req.method === 'POST') {
            const { paths } = await readBody();
            const report = vaultIndexer.getImpactAudit(paths || []);
            sendJSON(report);
            return;
        }

        // 12. Safe Archival & Deletion API
        if (pathname === '/api/vault/archive' && req.method === 'POST') {
            const { paths, permanent } = await readBody();
            const res = vaultIndexer.archiveFiles(paths || [], !!permanent);
            sendJSON(res);
            return;
        }

        // 13. Batch Reassign Unit API
        if (pathname === '/api/vault/batch-reassign' && req.method === 'POST') {
            const { paths, newUnit } = await readBody();
            const res = vaultIndexer.batchReassignUnit(paths || [], newUnit);
            sendJSON(res);
            return;
        }

        // 14. Batch Set Status API
        if (pathname === '/api/vault/batch-status' && req.method === 'POST') {
            const { paths, editorialStatus, inUniverseStatus } = await readBody();
            const res = vaultIndexer.batchSetStatus(paths || [], { editorialStatus, inUniverseStatus });
            sendJSON(res);
            return;
        }

        // 15. Attach Image API (Pinterest paste / upload / URL fetch)
        if (pathname === '/api/vault/attach-image' && req.method === 'POST') {
            const body = await readBody();
            const { filePath, base64Data, imageUrl, slot, caption, isConcept } = body;

            if (!filePath) {
                sendJSON({ error: 'filePath is required' }, 400);
                return;
            }

            let buf;
            let ext = 'png';

            if (base64Data) {
                const matches = base64Data.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
                if (matches) {
                    ext = matches[1].replace('jpeg', 'jpg');
                    buf = Buffer.from(matches[2], 'base64');
                } else {
                    buf = Buffer.from(base64Data, 'base64');
                }
            } else if (imageUrl) {
                try {
                    const fetchRes = await fetch(imageUrl);
                    if (!fetchRes.ok) throw new Error(`HTTP ${fetchRes.status} fetching image URL`);
                    const contentType = fetchRes.headers.get('content-type') || '';
                    if (contentType.includes('jpeg') || contentType.includes('jpg')) ext = 'jpg';
                    else if (contentType.includes('webp')) ext = 'webp';
                    else if (contentType.includes('svg')) ext = 'svg';
                    buf = Buffer.from(await fetchRes.arrayBuffer());
                } catch (e) {
                    sendJSON({ error: `Failed to fetch image URL: ${e.message}` }, 400);
                    return;
                }
            } else {
                sendJSON({ error: 'Either base64Data or imageUrl is required' }, 400);
                return;
            }

            // Derive clean Latin filename based on dossier baseName
            const base = path.basename(filePath, '.md').replace(/[^a-zA-Z0-9_-]/g, '_');
            const slotSuffix = slot === 'gallery' ? `_gallery_${Date.now()}` : '';
            const filename = `${base}${slotSuffix}.${ext}`;

            try {
                const res = vaultIndexer.attachImage({
                    filePath,
                    buffer: buf,
                    filename,
                    slot: slot || 'primary',
                    caption: caption || '',
                    isConcept: isConcept !== false
                });
                sendJSON(res);
            } catch (e) {
                sendJSON({ error: e.message }, 500);
            }
            return;
        }

        // 16. Toggle Image Concept Status API
        if (pathname === '/api/vault/toggle-image-status' && req.method === 'POST') {
            const { filePath } = await readBody();
            if (!filePath) {
                sendJSON({ error: 'filePath is required' }, 400);
                return;
            }
            const res = vaultIndexer.toggleImageConceptStatus(filePath);
            sendJSON(res);
            return;
        }

        // 2. Notes List API
        if (pathname === '/api/notes' && req.method === 'GET') {
            const lang = urlObj.searchParams.get('lang') || 'en';
            let targetDir = CONTINUITIES_DIR;
            if (lang === 'km') targetDir = path.join(KM_VAULT, 'Dossiers');
            if (lang === 'sandbox') targetDir = SANDBOX_DIR;

            const files = walkMarkdown(targetDir);
            const notes = [];

            for (const f of files) {
                const content = fs.readFileSync(f, 'utf8');
                const { yaml, body } = parseFrontmatter(content);
                const rel = path.relative(targetDir, f).replace(/\\/g, '/');
                const baseName = path.basename(f, '.md');
                const stat = fs.statSync(f);

                notes.push({
                    baseName,
                    relPath: rel,
                    fullPath: f,
                    title: yaml.title || baseName,
                    subtitle: yaml.subtitle || '',
                    enTitle: yaml.en_title || baseName,
                    category: rel.split('/')[0] || 'General',
                    status: yaml.status || 'Draft',
                    reviewStatus: yaml.review_status || '',
                    wordCount: (body.match(/\b\S+\b/g) || []).length,
                    hasBak: fs.existsSync(f + '.bak'),
                    mtime: stat.mtime.toISOString()
                });
            }

            notes.sort((a, b) => a.title.localeCompare(b.title));
            sendJSON({ lang, notes });
            return;
        }

        // 3. Single Note Read API
        if (pathname === '/api/note' && req.method === 'GET') {
            const notePath = urlObj.searchParams.get('path');
            if (!notePath || !fs.existsSync(notePath)) {
                sendJSON({ error: 'File not found' }, 404);
                return;
            }
            const content = fs.readFileSync(notePath, 'utf8');
            const { yaml, rawYaml, body } = parseFrontmatter(content);
            sendJSON({
                path: notePath,
                fileName: path.basename(notePath),
                yaml,
                rawYaml,
                body,
                content
            });
            return;
        }

        // 4. Note Save API
        if (pathname === '/api/note' && req.method === 'POST') {
            const data = await readBody();
            const { notePath, content, yaml, body } = data;
            if (!notePath) {
                sendJSON({ error: 'notePath required' }, 400);
                return;
            }

            let finalContent = content;
            if (yaml && body !== undefined) {
                finalContent = serializeFrontmatter(yaml, body);
            } else if (finalContent) {
                finalContent = finalContent.replace(/\r?\n/g, '\r\n');
            }

            // Create individual backup if not present
            const bakPath = notePath + '.bak';
            if (!fs.existsSync(bakPath) && fs.existsSync(notePath)) {
                fs.copyFileSync(notePath, bakPath);
            }

            fs.writeFileSync(notePath, finalContent, 'utf8');
            broadcastEvent('file_saved', { path: notePath });
            sendJSON({ success: true, path: notePath });
            return;
        }

        // 5. Lexicon API
        if (pathname === '/api/lexicon' && req.method === 'GET') {
            const terms = [];
            if (fs.existsSync(LEXICON_FILE)) {
                const raw = fs.readFileSync(LEXICON_FILE, 'utf8');
                for (const line of raw.split(/\r?\n/)) {
                    if (!line.startsWith('|')) continue;
                    const cols = line.split('|').map(c => c.trim()).filter((c, i, a) => i > 0 && i < a.length - 1);
                    if (cols.length < 2) continue;
                    if (cols[0].startsWith('---') || cols[0].toLowerCase().includes('english')) continue;
                    terms.push({
                        en: cols[0].replace(/\*\*/g, '').trim(),
                        km: cols[1].replace(/\*\*/g, '').trim(),
                        note: cols[2] ? cols[2].replace(/\*\*/g, '').trim() : ''
                    });
                }
            }
            sendJSON({ terms });
            return;
        }

        if (pathname === '/api/lexicon' && req.method === 'POST') {
            const { en, km, note } = await readBody();
            if (!en || !km) {
                sendJSON({ error: 'English and Khmer terms required' }, 400);
                return;
            }

            // Append to LEXICON.md
            if (fs.existsSync(LEXICON_FILE)) {
                const entry = `| **${en}** | **${km}** | ${note || ''} |\r\n`;
                fs.appendFileSync(LEXICON_FILE, entry, 'utf8');
            }

            // Sync into khmer-dictionary.json
            if (fs.existsSync(DICTIONARY_FILE)) {
                try {
                    const dict = JSON.parse(fs.readFileSync(DICTIONARY_FILE, 'utf8'));
                    dict.terms[en] = km;
                    fs.writeFileSync(DICTIONARY_FILE, JSON.stringify(dict, null, 2), 'utf8');
                } catch (e) {}
            }

            sendJSON({ success: true, term: { en, km, note } });
            return;
        }

        // 6. Sandbox Promote to Canon API
        if (pathname === '/api/sandbox/promote' && req.method === 'POST') {
            const { fileName, category } = await readBody();
            const sourcePath = path.join(SANDBOX_DIR, fileName);
            if (!fs.existsSync(sourcePath)) {
                sendJSON({ error: 'Sandbox note not found' }, 404);
                return;
            }

            const targetCategory = category || 'General';
            const targetDir = path.join(CONTINUITIES_DIR, targetCategory);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const targetPath = path.join(targetDir, fileName);
            const content = fs.readFileSync(sourcePath, 'utf8');
            let { yaml, body } = parseFrontmatter(content);
            yaml.status = 'Canon';
            yaml.continuity = '[[Parialfare: Reimagined]]';

            const updatedContent = serializeFrontmatter(yaml, body);
            fs.writeFileSync(targetPath, updatedContent, 'utf8');
            fs.unlinkSync(sourcePath); // Clean up sandbox

            broadcastEvent('sandbox_promoted', { targetPath });
            sendJSON({ success: true, targetPath });
            return;
        }

        // 7. Operations & CLI Actions Runner
        if (pathname === '/api/action/run' && req.method === 'POST') {
            const { action, payload } = await readBody();

            if (activeProcess) {
                sendJSON({ error: 'A task is already running', pid: activeProcess.pid }, 409);
                return;
            }

            let command = '';
            let cwd = QUARTZ_DIR;

            switch (action) {
                case 'staging-preview':
                    command = `node build-content.cjs --all && npx quartz build --serve`;
                    break;
                case 'build-staging':
                    command = `node build-content.cjs --all`;
                    break;
                case 'deploy':
                    command = `node build-content.cjs --all && git config core.ignorecase false && npx quartz sync`;
                    break;
                case 'promote':
                    command = `node promote.cjs`;
                    break;
                case 'polish-dry-run':
                    command = `node polish-khmer.cjs --dry-run`;
                    break;
                case 'polish-auto':
                    command = `node polish-khmer.cjs --yes`;
                    break;
                case 'restore-bak':
                    command = `node polish-khmer.cjs --restore-bak`;
                    break;
                case 'clean-bak':
                    command = `node polish-khmer.cjs --clean-bak`;
                    break;
                case 'lint-dry-run':
                    command = `node lint-autocorrect.cjs --dry-run`;
                    break;
                case 'lint-fix':
                    command = `node lint-autocorrect.cjs --yes`;
                    break;
                case 'bundle-en':
                    command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT_DOCS, 'Worldbuild & IP', 'bundle_vault.ps1')}" -Target en`;
                    cwd = path.join(ROOT_DOCS, 'Worldbuild & IP');
                    break;
                case 'bundle-km':
                    command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT_DOCS, 'Worldbuild & IP', 'bundle_vault.ps1')}" -Target km`;
                    cwd = path.join(ROOT_DOCS, 'Worldbuild & IP');
                    break;
                case 'bundle-all':
                    command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${path.join(ROOT_DOCS, 'Worldbuild & IP', 'bundle_vault.ps1')}" -Target all`;
                    cwd = path.join(ROOT_DOCS, 'Worldbuild & IP');
                    break;
                case 'translate-note':
                    if (!payload?.noteName) {
                        sendJSON({ error: 'noteName is required' }, 400);
                        return;
                    }
                    command = `node "${path.join(ROOT_DOCS, 'Worldbuild & IP', 'bilingual_tool.cjs')}" translate "${payload.noteName}" --force`;
                    cwd = path.join(ROOT_DOCS, 'Worldbuild & IP');
                    break;
                default:
                    sendJSON({ error: `Unknown action: ${action}` }, 400);
                    return;
            }

            broadcastLog(`\n>>> STARTING: ${action}\n$ ${command}\n\n`);
            broadcastEvent('task_started', { action, command });

            const proc = cp.spawn(command, { cwd, shell: true });
            activeProcess = proc;

            proc.stdout.on('data', chunk => broadcastLog(chunk, 'stdout'));
            proc.stderr.on('data', chunk => broadcastLog(chunk, 'stderr'));

            proc.on('close', code => {
                activeProcess = null;
                broadcastLog(`\n>>> PROCESS FINISHED with exit code: ${code}\n`);
                broadcastEvent('task_finished', { action, code });
            });

            sendJSON({ started: true, action, pid: proc.pid });
            return;
        }

        // 8. Terminate running action
        if (pathname === '/api/action/kill' && req.method === 'POST') {
            if (activeProcess) {
                try {
                    cp.execSync(`taskkill /pid ${activeProcess.pid} /T /F 2>nul`);
                } catch (e) {}
                activeProcess = null;
                broadcastLog(`\n>>> Process killed by user.\n`);
                broadcastEvent('task_finished', { action: 'killed', code: -1 });
                sendJSON({ killed: true });
            } else {
                sendJSON({ killed: false, message: 'No active process' });
            }
            return;
        }

        // 9. Config API
        if (pathname === '/api/config' && req.method === 'GET') {
            const safeConfig = JSON.parse(JSON.stringify(config));
            // Mask API keys for safety
            for (const p of Object.keys(safeConfig.providers || {})) {
                const key = safeConfig.providers[p].apiKey;
                if (key) {
                    safeConfig.providers[p].hasKey = true;
                    safeConfig.providers[p].maskedKey = key.slice(0, 4) + '...' + key.slice(-4);
                    delete safeConfig.providers[p].apiKey;
                } else {
                    safeConfig.providers[p].hasKey = false;
                }
            }
            sendJSON(safeConfig);
            return;
        }

        if (pathname === '/api/config' && req.method === 'POST') {
            const updates = await readBody();
            if (updates.activeProvider) config.activeProvider = updates.activeProvider;
            if (updates.providers) {
                for (const [pName, pData] of Object.entries(updates.providers)) {
                    if (!config.providers[pName]) config.providers[pName] = {};
                    if (pData.apiKey) config.providers[pName].apiKey = pData.apiKey;
                    if (pData.model) config.providers[pName].model = pData.model;
                    if (pData.baseUrl) config.providers[pName].baseUrl = pData.baseUrl;
                }
            }
            saveConfig(config);
            sendJSON({ success: true });
            return;
        }

        // 10. AI Draft Synthesizer & Polisher API
        if (pathname === '/api/ai/synthesize' && req.method === 'POST') {
            const { rawText, title, category, format } = await readBody();
            if (!rawText || !rawText.trim()) {
                sendJSON({ error: 'rawText is required' }, 400);
                return;
            }

            const prompt = `You are the lead narrative architect for the dark military-fiction universe "Nolheim" (Continuity: Parialfare: Reimagined).
Take the following raw notes, discord discussion, or brainstorm thoughts and synthesize them into a canonical Nolheim Markdown dossier note.

Title: ${title || 'Untitled'}
Category: ${category || 'Characters'}
Format target: ${format || 'Character Dossier'}

Required Structure:
1. Valid YAML frontmatter:
---
title: "${title || 'Untitled'}"
subtitle: "Brief military or faction designation"
UID: "unique.identifier.parialfare-reimagined"
continuity: "[[Parialfare: Reimagined]]"
status: Draft
review_status: needs-review
aliases: ["${title || 'Untitled'}"]
tags: [character, reimagined, parialfare]
---

2. Clear markdown prose adhering strictly to Nolheim lore tone: detached institutional records, classified dossier briefings, concrete tactical terminology, and accurate wikilinks ([[VISTA]], [[Anajak Forces]], [[LENDERMAIRE]], [[General Ramcher]], [[Konish Kimbotin]], etc.).

Raw Brainstorm Input:
${rawText}

Output only the complete Markdown content, with no introductory banter or extra backticks outside the note.`;

            const synthesized = await executeAiCompletion(prompt);
            sendJSON({ success: true, result: synthesized });
            return;
        }

        if (pathname === '/api/ai/polish' && req.method === 'POST') {
            const { text, language, tone } = await readBody();
            if (!text || !text.trim()) {
                sendJSON({ error: 'text is required' }, 400);
                return;
            }

            const prompt = `You are the chief bilingual literary editor for Nolheim.
Polish the following ${language === 'km' ? 'Khmer' : 'English'} military lore text for maximum stylistic immersion, precise institutional terminology, correct punctuation, and canonical coherence.

Guidelines:
- Tone: ${tone || 'Authoritative military history / classified institutional dossier'}
- Maintain all existing [[wikilinks]] untouched.
- For Khmer: ensure proper native punctuation (៖), natural institutional prose, and correct syntax (no spaced bold ** text **).

Source Text:
${text}

Output only the polished text:`;

            const polished = await executeAiCompletion(prompt);
            sendJSON({ success: true, result: polished });
            return;
        }

        // 11. Chat Sessions API
        if (pathname === '/api/chat/sessions' && req.method === 'GET') {
            const files = fs.readdirSync(CHAT_SESSIONS_DIR).filter(f => f.endsWith('.json'));
            const sessions = [];
            for (const f of files) {
                try {
                    const data = JSON.parse(fs.readFileSync(path.join(CHAT_SESSIONS_DIR, f), 'utf8'));
                    sessions.push({
                        id: data.id || path.basename(f, '.json'),
                        title: data.title || 'Untitled Session',
                        createdAt: data.createdAt,
                        updatedAt: data.updatedAt,
                        messageCount: (data.messages || []).length,
                        preview: (data.messages && data.messages.length > 0) 
                            ? data.messages[data.messages.length - 1].content.slice(0, 100) 
                            : 'Empty session'
                    });
                } catch (e) {}
            }
            sessions.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            sendJSON({ sessions });
            return;
        }

        if (pathname === '/api/chat/session' && req.method === 'GET') {
            const id = urlObj.searchParams.get('id');
            const filePath = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
            if (id && fs.existsSync(filePath)) {
                sendJSON(JSON.parse(fs.readFileSync(filePath, 'utf8')));
            } else {
                sendJSON({ id: id || `session_${Date.now()}`, title: 'New Conversation', messages: [] });
            }
            return;
        }

        if (pathname === '/api/chat/session' && req.method === 'POST') {
            const data = await readBody();
            const id = data.id || `session_${Date.now()}`;
            const sessionData = {
                id,
                title: data.title || 'Untitled Conversation',
                createdAt: data.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                messages: data.messages || []
            };
            fs.writeFileSync(path.join(CHAT_SESSIONS_DIR, `${id}.json`), JSON.stringify(sessionData, null, 2), 'utf8');
            sendJSON({ success: true, session: sessionData });
            return;
        }

        if (pathname === '/api/chat/session' && req.method === 'DELETE') {
            const id = urlObj.searchParams.get('id');
            const filePath = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
            if (id && fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            sendJSON({ success: true, deleted: id });
            return;
        }

        // Export/Archive session as a Markdown note
        if (pathname === '/api/chat/session/archive' && req.method === 'POST') {
            const { id, targetFolder } = await readBody();
            const sessionPath = path.join(CHAT_SESSIONS_DIR, `${id}.json`);
            if (!fs.existsSync(sessionPath)) {
                sendJSON({ error: 'Session not found' }, 404);
                return;
            }
            const data = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
            const safeTitle = (data.title || 'Chat Archive').replace(/[/\\?%*:|"<>]/g, '-');
            const fileName = `Archive - ${safeTitle}.md`;
            const destDir = targetFolder === 'canon' ? path.join(CONTINUITIES_DIR, 'Archives') : SANDBOX_DIR;
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

            const mdPath = path.join(destDir, fileName);
            let md = `---\ntitle: "Archive: ${data.title}"\nUID: "archive.chat.${id}"\ncontinuity: "[[Parialfare: Reimagined]]"\nstatus: Archive\ntags: [chat, archive, brainstorm]\n---\n\n# Chat Session: ${data.title}\n\n*Recorded on ${data.createdAt || new Date().toISOString()}*\n\n---\n\n`;

            for (const m of (data.messages || [])) {
                const roleName = m.role === 'user' ? '**Author**' : '**Nolheim Lore Assistant**';
                md += `### ${roleName}\n\n${m.content}\n\n---\n\n`;
            }

            fs.writeFileSync(mdPath, md.replace(/\r?\n/g, '\r\n'), 'utf8');
            sendJSON({ success: true, exportedPath: mdPath });
            return;
        }

        // 12. Fullscreen Minimalist Chat Execution
        if (pathname === '/api/ai/chat' && req.method === 'POST') {
            const { messages, userMessage } = await readBody();
            if (!messages || !Array.isArray(messages)) {
                sendJSON({ error: 'messages array required' }, 400);
                return;
            }

            const latestMsg = userMessage || messages[messages.length - 1]?.content || '';
            const trimmed = latestMsg.trim();

            // Command interception: /build, /deploy, /drift, /polish, /lint
            if (trimmed.startsWith('/')) {
                const cmd = trimmed.toLowerCase();
                if (cmd === '/build' || cmd === '/stage') {
                    sendJSON({
                        reply: `⚡ **Executing Operation:** Building staging content from vault...\n\nYou can watch the live terminal drawer in the top right.`,
                        actionTrigger: 'build-staging'
                    });
                    return;
                }
                if (cmd === '/deploy') {
                    sendJSON({
                        reply: `🚀 **Executing Operation:** Building wiki & syncing to GitHub Pages...\n\nWatch deployment logs in the live terminal drawer.`,
                        actionTrigger: 'deploy'
                    });
                    return;
                }
                if (cmd === '/drift') {
                    let driftReport = 'checking...';
                    try {
                        driftReport = cp.execSync(`node "${path.join(QUARTZ_DIR, 'drift-check.cjs')}" 2>nul`).toString().trim();
                    } catch (e) {}
                    sendJSON({
                        reply: `📊 **Continuity Drift Check Report:**\n\`\`\`text\n${driftReport}\n\`\`\``
                    });
                    return;
                }
                if (cmd === '/polish') {
                    sendJSON({
                        reply: `✨ **Executing Operation:** Running Khmer Bulk Polisher on Nolheim-Khmer with safety .bak backups...\n\nCheck live terminal drawer.`,
                        actionTrigger: 'polish-auto'
                    });
                    return;
                }
                if (cmd === '/lint') {
                    sendJSON({
                        reply: `🔍 **Executing Operation:** Running Markdown Syntax Linter...\n\nCheck live terminal drawer.`,
                        actionTrigger: 'lint-dry-run'
                    });
                    return;
                }
            }

            // Dynamically load Canonical Overview
            const OVERVIEW_FILE = path.join(CONTINUITIES_DIR, 'Overview.md');
            let canonOverview = '';
            if (fs.existsSync(OVERVIEW_FILE)) {
                canonOverview = fs.readFileSync(OVERVIEW_FILE, 'utf8');
            }

            // Keyword-based Vault Retrieval (Auto-grounding from local vault)
            const retrievedSnippets = [];
            const userQueryLower = latestMsg.toLowerCase();
            const allFiles = walkMarkdown(CONTINUITIES_DIR);
            
            for (const f of allFiles) {
                if (f === OVERVIEW_FILE) continue;
                const base = path.basename(f, '.md');
                const baseLower = base.toLowerCase();
                
                // Match note name or key acronyms (ITF, Ramcher, LENDERMAIRE, Anajak, etc.)
                let matched = userQueryLower.includes(baseLower);
                if (!matched) {
                    if (baseLower.includes('ironish task force') && userQueryLower.includes('itf')) matched = true;
                    if (baseLower.includes('ramcher') && userQueryLower.includes('ramcher')) matched = true;
                    if (baseLower.includes('lendermaire') && userQueryLower.includes('lendermaire')) matched = true;
                    if (baseLower.includes('anajak') && userQueryLower.includes('anajak')) matched = true;
                    if (baseLower.includes('pocheasang') && userQueryLower.includes('pocheasang')) matched = true;
                    if (baseLower.includes('konish') && userQueryLower.includes('konish')) matched = true;
                }

                if (matched) {
                    try {
                        const content = fs.readFileSync(f, 'utf8');
                        const { yaml, body } = parseFrontmatter(content);
                        const snippet = body.slice(0, 900).trim();
                        retrievedSnippets.push(`### Vault Dossier: [[${base}]]\n${snippet}`);
                    } catch (e) {}
                }
            }

            const retrievedSection = retrievedSnippets.length > 0 
                ? `\n\n[SPECIFIC CANON DOSSIERS RETRIEVED FROM YOUR VAULT]:\n${retrievedSnippets.join('\n\n---\n\n')}`
                : '';

            // Grounded Lore & Writing Prompt
            const systemPrompt = `You are the lead narrative architect and continuity keeper for the dark military-fiction universe "Nolheim" (Continuity: Parialfare: Reimagined).
You assist the author in drafting dossiers, timeline events, faction lore, and checking continuity against established canon.

CRITICAL CANON GROUNDING RULES (NEVER VIOLATE):
1. Historical Events vs Active Entities:
   - "[[2008 Pocheasang Palace raid]]" is a historical event that occurred on 25–26 August 2008 (LENDERMAIRE assaulted palace archives in Pocheasang, killed 12 defenders, extracted hard drives). It is a past EVENT, NEVER an active enemy group or faction to "fight against".
   - "[[Parialfare: Reimagined]]" is the META CONTINUITY NAME, never an in-universe physical item, weapon, or political leverage.
2. Faction & Character Truth:
   - [[Ironish Task Force (ITF)]] is an Ai'ron private military contractor (PMC) founded in 1998, headquartered in Pocheasang, guarding New Aester and formerly Pocheasang palace archives. It is named after the Ironish ethnic group. It is NOT "Inter-Territorial Forces" and NOT an Anajak sub-unit.
   - [[LENDERMAIRE]] is an anomalous 13-member black operations unit garrisoned as a single shared household in southern Ironclad on land owned by warlord [[Konish Kimbotin]]. They do NOT oppose Konish; they are his unit! It is NOT a giant futuristic skyscraper ("Tower Alpha") or high-tech facility.
   - [[Anajak Forces]] is the anti-insurgency task force under the GIC led by [[General Ramcher]], utilizing assassins from [[Site-29]].
   - [[Ironland]] is the kingdom (capital Pocheasang); [[Ironclad]] is the lawless DMZ frontier.
   - Setting Timeline: Strictly set in 2008 (modern-warfare / Cold War technology). Do not jump to 2024 or 2025.
3. Tone & Frontmatter:
   - Tone: Detached institutional records, classified dossier briefings, concrete tactical terminology, and accurate wikilinks.
   - When asked to draft a character or note, always include valid YAML frontmatter:
---
title: "Name"
subtitle: "Designation"
UID: "unique.id.parialfare-reimagined"
continuity: "[[Parialfare: Reimagined]]"
status: Draft
review_status: needs-review
aliases: ["Name"]
tags: [character, operative, ITF]
---
4. If writing in Khmer, use Kantumruy Pro native phrasing and proper punctuation (colon ៖, no spaced asterisks ** bold **).

[CANON MASTER OVERVIEW - THE GROUND TRUTH]:
${canonOverview}
${retrievedSection}`;

            const reply = await executeAiChat(messages, systemPrompt);
            sendJSON({ reply });
            return;
        }

        // 13. Asset Serving API (/api/assets/*)
        if (pathname.startsWith('/api/assets/')) {
            const assetName = decodeURIComponent(pathname.replace('/api/assets/', ''));
            const possibleLocations = [
                path.join(QUARTZ_DIR, 'content', 'assets', assetName),
                path.join(EN_VAULT, 'Assets', 'Images', assetName),
                path.join(EN_VAULT, 'Assets', assetName),
                path.join(KM_VAULT, 'Assets', 'Images', assetName),
                path.join(KM_VAULT, 'Assets', assetName)
            ];

            let foundPath = null;
            for (const loc of possibleLocations) {
                if (fs.existsSync(loc)) {
                    foundPath = loc;
                    break;
                }
            }

            if (foundPath) {
                const ext = path.extname(foundPath).toLowerCase();
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                fs.createReadStream(foundPath).pipe(res);
                return;
            } else {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Asset not found');
                return;
            }
        }

        // --- STATIC FILE SERVING (Embedded SPA) ---
        let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
            const ext = path.extname(filePath).toLowerCase();
            res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
            fs.createReadStream(filePath).pipe(res);
            return;
        }

        // SPA Fallback to index.html
        const indexPath = path.join(PUBLIC_DIR, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexPath).pipe(res);
            return;
        }

        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');

    } catch (e) {
        console.error('[studio:server] Error handling request:', e);
        sendJSON({ error: e.message }, 500);
    }
});

// Multi-Provider LLM Caller
async function executeAiCompletion(prompt) {
    const provider = config.activeProvider || 'openrouter';
    const pConfig = config.providers[provider] || {};

    // 1. anybridge fallback if configured and online
    if (provider === 'anybridge') {
        try {
            const res = await fetch(`${config.anybridgeUrl || 'http://localhost:3456'}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: prompt })
            });
            if (res.ok) {
                const data = await res.json();
                return data.response || data.text || JSON.stringify(data);
            }
        } catch (e) {}
    }

    // 2. OpenRouter API
    if (provider === 'openrouter') {
        const apiKey = pConfig.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return `[OpenRouter Key Missing]: Enter your OpenRouter API key in Studio Settings.\n\nGet one at https://openrouter.ai/keys (Free models available!)`;
        }
        const model = pConfig.model || 'google/gemini-2.0-flash-exp:free';
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'http://localhost:3333',
                    'X-Title': 'Nolheim Studio Suite',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: [{ role: 'user', content: prompt }]
                })
            });
            const data = await res.json();
            if (data?.error) {
                return `[OpenRouter Error]: ${data.error.message || JSON.stringify(data.error)}`;
            }
            return data?.choices?.[0]?.message?.content || JSON.stringify(data);
        } catch (e) {
            return `[OpenRouter Network Error]: ${e.message}`;
        }
    }

    // 3. Gemini API
    if (provider === 'gemini') {
        const apiKey = pConfig.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return `[AI Simulation / Key Missing] To enable live AI synthesis, enter your Gemini API key in Studio Settings.\n\n---\nPrompt Processed:\n${prompt.slice(0, 300)}...`;
        }
        const model = pConfig.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            });
            const data = await res.json();
            if (data?.error) {
                return `[Gemini API Error ${data.error.code}]: ${data.error.message}\n\nTip: In Studio Settings, use 'gemini-1.5-flash' or use anybridge with free web chats (ChatGPT/Gemini)!`;
            }
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data, null, 2);
        } catch (e) {
            return `[Gemini Fetch Error]: ${e.message}`;
        }
    }

    // 3. Anthropic Claude API
    if (provider === 'anthropic') {
        const apiKey = pConfig.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return `[AI Simulation / Key Missing] Enter your Anthropic Claude API key in Studio Settings.`;
        }
        const model = pConfig.model || 'claude-3-5-sonnet-20241022';
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await res.json();
        return data?.content?.[0]?.text || JSON.stringify(data);
    }

    // 4. OpenAI API
    if (provider === 'openai') {
        const apiKey = pConfig.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return `[AI Simulation / Key Missing] Enter your OpenAI API key in Studio Settings.`;
        }
        const model = pConfig.model || 'gpt-4o';
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }]
            })
        });
        const data = await res.json();
        return data?.choices?.[0]?.message?.content || JSON.stringify(data);
    }

    // 5. Local Ollama API
    if (provider === 'ollama') {
        const baseUrl = pConfig.baseUrl || 'http://localhost:11434';
        const model = pConfig.model || 'llama3.2';
        const res = await fetch(`${baseUrl}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false })
        });
        const data = await res.json();
        return data?.response || JSON.stringify(data);
    }

    return `Unsupported provider: ${provider}`;
}

// Multi-turn Chat Caller
async function executeAiChat(messages, systemPrompt) {
    const provider = config.activeProvider || 'openrouter';
    const pConfig = config.providers[provider] || {};

    // 1. anybridge fallback
    if (provider === 'anybridge') {
        const lastMsg = messages[messages.length - 1]?.content || '';
        try {
            const res = await fetch(`${config.anybridgeUrl || 'http://localhost:3456'}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: `${systemPrompt}\n\n${lastMsg}` })
            });
            if (res.ok) {
                const data = await res.json();
                return data.response || data.text || JSON.stringify(data);
            }
        } catch (e) {}
    }

    // 2. OpenRouter API (OpenAI-compatible Multi-Model Gateway)
    if (provider === 'openrouter') {
        const apiKey = pConfig.apiKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return `[OpenRouter Key Missing]: To chat live inside the studio, add your OpenRouter API key in Studio Settings.\n\nTip: You can get an API key with free access to Gemini Flash, Llama 3.3, and DeepSeek at https://openrouter.ai/keys!`;
        }
        const model = pConfig.model || 'google/gemini-2.0-flash-exp:free';
        const formattedMsgs = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];
        try {
            const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'HTTP-Referer': 'http://localhost:3333',
                    'X-Title': 'Nolheim Studio Suite',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: formattedMsgs
                })
            });
            const data = await res.json();
            if (data?.error) {
                return `[OpenRouter Error]: ${data.error.message || JSON.stringify(data.error)}`;
            }
            return data?.choices?.[0]?.message?.content || JSON.stringify(data);
        } catch (e) {
            return `[OpenRouter Network Error]: ${e.message}`;
        }
    }

    // 3. Gemini API
    if (provider === 'gemini') {
        const apiKey = pConfig.apiKey || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return `[AI Key Missing]: To chat live inside the studio, add your free Gemini API key in Studio Settings.\n\nTip: You can also click **"Copy for anybridge"** below to chat for free via your browser's ChatGPT or Gemini!`;
        }
        const model = pConfig.model || 'gemini-1.5-flash';
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        // Format contents
        const contents = [];
        for (const m of messages) {
            contents.push({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            });
        }
        // Prepend system prompt to first user message if present
        if (contents.length > 0 && contents[0].role === 'user') {
            contents[0].parts[0].text = `[SYSTEM INSTRUCTIONS]\n${systemPrompt}\n[END SYSTEM INSTRUCTIONS]\n\n${contents[0].parts[0].text}`;
        }

        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents })
            });
            const data = await res.json();
            if (data?.error) {
                return `[Gemini Error ${data.error.code}]: ${data.error.message}\n\nTip: In Studio Settings, use 'gemini-1.5-flash' or use anybridge!`;
            }
            return data?.candidates?.[0]?.content?.parts?.[0]?.text || JSON.stringify(data, null, 2);
        } catch (e) {
            return `[Gemini Network Error]: ${e.message}`;
        }
    }

    // 3. Anthropic Claude API
    if (provider === 'anthropic') {
        const apiKey = pConfig.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!apiKey) {
            return `[Anthropic Key Missing]: Enter your Claude API key in Studio Settings.`;
        }
        const model = pConfig.model || 'claude-3-5-sonnet-20241022';
        const formattedMsgs = messages.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
        }));
        try {
            const res = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    system: systemPrompt,
                    max_tokens: 4096,
                    messages: formattedMsgs
                })
            });
            const data = await res.json();
            return data?.content?.[0]?.text || JSON.stringify(data);
        } catch (e) {
            return `[Claude Error]: ${e.message}`;
        }
    }

    // 4. OpenAI API
    if (provider === 'openai') {
        const apiKey = pConfig.apiKey || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            return `[OpenAI Key Missing]: Enter your OpenAI API key in Studio Settings.`;
        }
        const model = pConfig.model || 'gpt-4o';
        const formattedMsgs = [
            { role: 'system', content: systemPrompt },
            ...messages.map(m => ({ role: m.role, content: m.content }))
        ];
        try {
            const res = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model,
                    messages: formattedMsgs
                })
            });
            const data = await res.json();
            return data?.choices?.[0]?.message?.content || JSON.stringify(data);
        } catch (e) {
            return `[OpenAI Error]: ${e.message}`;
        }
    }

    // 5. Local Ollama API
    if (provider === 'ollama') {
        const baseUrl = pConfig.baseUrl || 'http://localhost:11434';
        const model = pConfig.model || 'llama3.2';
        try {
            const res = await fetch(`${baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        ...messages
                    ],
                    stream: false
                })
            });
            const data = await res.json();
            return data?.message?.content || data?.response || JSON.stringify(data);
        } catch (e) {
            return `[Ollama Error]: Ensure Ollama is running on ${baseUrl}. Error: ${e.message}`;
        }
    }

    return `Unsupported provider: ${provider}`;
}

// WebSocket Server
const wss = new WebSocketServer({ server });

wss.on('connection', ws => {
    wsClients.add(ws);
    ws.send(JSON.stringify({ type: 'connected', version: 'Nolheim Studio v1.0' }));

    ws.on('close', () => wsClients.delete(ws));
    ws.on('error', () => wsClients.delete(ws));
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`================================================================`);
    console.log(`   NOLHEIM STUDIO SUITE RUNNING AT: http://localhost:${PORT}`);
    console.log(`================================================================`);
});
