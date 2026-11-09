const fs = require('fs');
const path = require('path');

const VAULT_ROOT = 'C:\\Users\\Administrator\\Documents\\Worldbuild & IP\\Nolheim';
const CONTINUITIES_DIR = path.join(VAULT_ROOT, 'Continuities', 'Parialfare - Reimagined');
const PUBLISH_ROOT = path.join(VAULT_ROOT, 'Publish');
const PUBLISH_DIR = path.join(PUBLISH_ROOT, 'Parialfare - Reimagined');
const SNAPSHOTS_DIR = path.join(VAULT_ROOT, 'Archives', 'Publish snapshots');
const VAULT_LOG = path.join(PUBLISH_ROOT, 'LOG.md');
const SITE_LOG = path.join(PUBLISH_DIR, 'Update Log.md');
const REQUEST = path.join(__dirname, 'Promote-Request.json');
const SNAPSHOT_THRESHOLD = 3;

function fail(msg) {
    console.error('');
    console.error('ERROR: ' + msg);
    process.exit(1);
}

function pad(n) { return String(n).padStart(3, '0'); }

function todayISO() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function todayReadable() {
    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const d = new Date();
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}

function highestSnapshotVersion() {
    if (!fs.existsSync(SNAPSHOTS_DIR)) return 0;
    let max = 0;
    for (const entry of fs.readdirSync(SNAPSHOTS_DIR)) {
        const m = entry.match(/^v(\d{3})-/);
        if (m) {
            const n = parseInt(m[1], 10);
            if (n > max) max = n;
        }
    }
    return max;
}

function highestLogVersion() {
    if (!fs.existsSync(VAULT_LOG)) return 0;
    const content = fs.readFileSync(VAULT_LOG, 'utf-8');
    let max = 0;
    const re = /^## v(\d{3})/gm;
    let m;
    while ((m = re.exec(content)) !== null) {
        const n = parseInt(m[1], 10);
        if (n > max) max = n;
    }
    return max;
}

function main() {
    if (!fs.existsSync(REQUEST)) {
        fail('No Promote-Request.json found at ' + REQUEST + '\nThe agent must write the request before running this script.');
    }
    let req;
    try {
        req = JSON.parse(fs.readFileSync(REQUEST, 'utf-8'));
    } catch (e) {
        fail('Promote-Request.json is not valid JSON: ' + e.message);
    }
    if (!Array.isArray(req.files) || req.files.length === 0) fail('Request must have a non-empty \"files\" array');
    if (typeof req.log_summary !== 'string' || !req.log_summary.trim()) fail('Request must have a non-empty \"log_summary\" string');
    if (typeof req.site_log !== 'string' || !req.site_log.trim()) fail('Request must have a non-empty \"site_log\" string');

    req.files = [...new Set(req.files)];

    const missing = req.files.filter(rel => !fs.existsSync(path.join(CONTINUITIES_DIR, rel)));
    if (missing.length) fail('Files not found in Continuities:\n  ' + missing.join('\n  '));

    const prevVer = Math.max(highestSnapshotVersion(), highestLogVersion());
    const nextVer = prevVer + 1;
    const version = 'v' + pad(nextVer);
    const dateISO = todayISO();
    const dateReadable = todayReadable();
    const snapshotName = version + '-' + dateISO;

    console.log('');
    console.log('Promoting ' + req.files.length + ' file(s) as ' + version + ' (' + dateISO + ').');
    console.log('');

    const copied = [];
    for (const rel of req.files) {
        const src = path.join(CONTINUITIES_DIR, rel);
        const dst = path.join(PUBLISH_DIR, rel);
        try {
            fs.mkdirSync(path.dirname(dst), { recursive: true });
            fs.copyFileSync(src, dst);
            copied.push(rel);
            console.log('  copied    ' + rel);
        } catch (e) {
            console.error('');
            console.error('PARTIAL PROMOTION - ' + copied.length + ' of ' + req.files.length + ' files were copied, then ' + rel + ' failed: ' + e.message);
            console.error('Log and snapshot were NOT created. Request file was NOT deleted. Manual cleanup may be required.');
            process.exit(1);
        }
    }

    if (!fs.existsSync(VAULT_LOG)) fail('Vault log not found at ' + VAULT_LOG);
    if (!fs.existsSync(SITE_LOG)) fail('Site log not found at ' + SITE_LOG);
    const willSnapshot = req.files.length >= SNAPSHOT_THRESHOLD;
    const snapDir = path.join(SNAPSHOTS_DIR, snapshotName);
    const snapshotStatus = willSnapshot ? (snapshotName + ' (created)') : 'skipped (below threshold)';

    const vaultEntry = '\n## ' + version + ' - ' + dateISO + '\n\n**Snapshot:** ' + snapshotStatus + '\n**Files: ' + req.files.length + '**\n**Site log:** ' + version + ' published.\n\n' + req.log_summary.trim() + '\n';
    let logContent = fs.readFileSync(VAULT_LOG, 'utf-8');
    const sepMatch = logContent.match(/\n---\n/);
    if (!sepMatch) fail('Vault log has no --- separator');
    const insertAt = sepMatch.index + sepMatch[0].length;
    logContent = logContent.slice(0, insertAt) + vaultEntry + logContent.slice(insertAt);
    fs.writeFileSync(VAULT_LOG, logContent);
    console.log('  log       ' + version + ' prepended to Publish/LOG.md');

    const siteEntry = '## ' + version + ' - ' + dateReadable + '\n\n' + req.site_log.trim() + '\n\n';
    let siteContent = fs.readFileSync(SITE_LOG, 'utf-8');
    const firstV = siteContent.match(/^## v\d{3}/m);
    if (!firstV) fail('Site log has no ## vNNN heading to insert before');
    siteContent = siteContent.slice(0, firstV.index) + siteEntry + siteContent.slice(firstV.index);
    fs.writeFileSync(SITE_LOG, siteContent);
    console.log('  log       ' + version + ' prepended to Update Log.md');

    if (willSnapshot) {
        if (fs.existsSync(snapDir)) fail('Snapshot folder already exists: ' + snapDir);
        try {
            fs.cpSync(PUBLISH_ROOT, snapDir, { recursive: true });
            console.log('  snapshot  ' + snapshotName);
        } catch (e) {
            console.error('');
            console.error('WARNING: snapshot failed AFTER logs were written.');
            console.error('Files and logs are consistent at ' + version + '. Rollback point is missing.');
            console.error(e.message);
            console.error('Manually copy Publish/ to: ' + snapDir);
        }
    } else {
        console.log('  snapshot  skipped (below ' + SNAPSHOT_THRESHOLD + '-file threshold)');
    }

    fs.unlinkSync(REQUEST);
    console.log('  cleanup   Promote-Request.json removed');

    console.log('');
    console.log('SUCCESS: ' + version + ' promoted.');
    console.log('Run Update-Wiki.bat to deploy.');
}

main();
