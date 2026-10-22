// node anacpu.js result.json [topN] -> self-time by function + inclusive for selected functions
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2])); const top = +(process.argv[3] || 30);
const p = r.cpuProfile; const nodes = new Map(); for (const n of p.nodes) nodes.set(n.id, n);
const self = new Map(); const total = p.timeDeltas.reduce((a, b) => a + b, 0);
for (let i = 0; i < p.samples.length; i++) self.set(p.samples[i], (self.get(p.samples[i]) || 0) + (p.timeDeltas[i] || 0));
const key = n => { const c = n.callFrame; return (c.functionName || '(anon)') + ' ' + (c.url ? c.url.split('/').pop().split('?')[0] : '') + ':' + c.lineNumber; };
const bySelf = {}; for (const [id, t] of self) { const k = key(nodes.get(id)); bySelf[k] = (bySelf[k] || 0) + t; }
const idle = (bySelf['(idle) :-1'] || 0), busy = total - idle;
console.log('total ms', (total / 1000).toFixed(0), 'idle', (idle / 1000).toFixed(0), 'busy', (busy / 1000).toFixed(0), 'busy%', (busy / total * 100).toFixed(1));
console.log('--- self time (ms, % of busy)');
Object.entries(bySelf).sort((a, b) => b[1] - a[1]).filter(([k]) => k !== '(idle) :-1').slice(0, top).forEach(([k, t]) => console.log((t / 1000).toFixed(0).padStart(7), (t / busy * 100).toFixed(1).padStart(5) + '%', k));
// inclusive
const parent = new Map(); for (const n of p.nodes) for (const c of (n.children || [])) parent.set(c, n.id);
const incl = {}; 
for (const [id, t] of self) { const seen = new Set(); let cur = id; while (cur !== undefined) { const k = key(nodes.get(cur)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + t; } cur = parent.get(cur); } }
console.log('--- inclusive (ms, % of busy) game functions');
Object.entries(incl).filter(([k]) => /game\.js|arena-art|ui-fx|combat-shared|socket-msgpack|socket\.io|\(program\)|garbage/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, top).forEach(([k, t]) => console.log((t / 1000).toFixed(0).padStart(7), (t / busy * 100).toFixed(1).padStart(5) + '%', k));
