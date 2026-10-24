// Runs only when the server diagnostic is explicitly enabled. No game socket traffic.
const { parentPort } = require('worker_threads');
const { promises: fs } = require('fs');
const path = require('path');
const MAX_FILES = 20;

async function prune(dir) {
    const all = await fs.readdir(dir);
    // A killed worker can leave a temporary file; remove it after the next start.
    for (const name of all.filter(name => /^\.arena-netdiag-[0-9a-f]{24}\.tmp$/.test(name))) {
        try { if (Date.now() - (await fs.stat(path.join(dir, name))).mtimeMs > 3600000) await fs.unlink(path.join(dir, name)); } catch (_) {}
    }
    const names = all.filter(name => /^arena-netdiag-[0-9a-f]{24}\.json$/.test(name));
    if (names.length <= MAX_FILES) return;
    const dated = await Promise.all(names.map(async name => {
        try { return { name, mtime: (await fs.stat(path.join(dir, name))).mtimeMs }; }
        catch (_) { return null; }
    }));
    const sorted = dated.filter(Boolean).sort((a, b) => a.mtime - b.mtime);
    for (const old of sorted.slice(0, Math.max(0, sorted.length - MAX_FILES)))
        try { await fs.unlink(path.join(dir, old.name)); } catch (_) {}
}

parentPort.on('message', async message => {
    const { id, dir, session, incidentTick, reason, wallEnd, serverNow,
        columns, decisions, rows, events } = message;
    try {
        await fs.mkdir(dir, { recursive: true, mode: 0o700 });
        const realDir = await fs.realpath(dir);
        const realPublic = await fs.realpath(path.join(__dirname, '..', 'public'));
        const compare = value => process.platform === 'win32' ? value.toLowerCase() : value;
        if (compare(realDir) === compare(realPublic) || compare(realDir).startsWith(compare(realPublic + path.sep)))
            throw new Error('diagnostic directory is public');
        const stat = await fs.stat(dir);
        if (!stat.isDirectory() || (process.platform !== 'win32' &&
            ((stat.mode & 0o077) || (typeof process.getuid === 'function' && stat.uid !== process.getuid()))))
            throw new Error('diagnostic directory is not private');
        const width = columns.length, data = [];
        for (let i = 0; i < rows.length; i += width) data.push(Array.from(rows.subarray(i, i + width)));
        const eventRows = [];
        for (let i = 0; i < events.length; i += 3) eventRows.push(Array.from(events.subarray(i, i + 3)));
        const report = { version: 2, session, incidentTick, reason, wallEnd, serverNow,
            columns, decisions, events: eventRows, rows: data };
        const file = path.join(dir, `arena-netdiag-${id}.json`);
        const temp = path.join(dir, `.arena-netdiag-${id}.tmp`);
        let handle;
        try {
            handle = await fs.open(temp, 'wx', 0o600);
            await handle.writeFile(JSON.stringify(report));
            await handle.sync();
            await handle.close(); handle = null;
            await fs.link(temp, file); // atomic publication; never overwrite an existing report
        } finally {
            if (handle) await handle.close();
            try { await fs.unlink(temp); } catch (_) {}
        }
        try { await prune(dir); } catch (_) { /* the export itself succeeded */ }
        parentPort.postMessage({ id, ok: true, session, incidentTick, reason });
    } catch (error) {
        parentPort.postMessage({ id, ok: false, session, incidentTick, reason,
            error: error && error.code ? String(error.code) : 'EXPORT_FAILED' });
    }
});
