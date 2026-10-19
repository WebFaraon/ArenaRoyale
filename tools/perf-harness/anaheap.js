const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2])); const secs = r.metrics.secs; const top = +(process.argv[3] || 25);
const by = {}; let total = 0;
(function walk(n, path) {
  const c = n.callFrame; const k = (c.functionName || '(anon)') + ' ' + (c.url ? c.url.split('/').pop().split('?')[0] : '') + ':' + c.lineNumber;
  if (n.selfSize) { by[k] = (by[k] || 0) + n.selfSize; total += n.selfSize; }
  for (const ch of n.children || []) walk(ch);
})(r.heapProfile.head);
console.log('sampled allocation total MB', (total / 1048576).toFixed(1), 'in', secs.toFixed(1), 's =>', (total / 1048576 / secs).toFixed(2), 'MB/s');
Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, top).forEach(([k, v]) => console.log((v / 1048576 / secs * 1024).toFixed(0).padStart(7), 'KB/s', (v / total * 100).toFixed(1).padStart(5) + '%', k));
