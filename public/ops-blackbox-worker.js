// Captures are analyzed and serialized off the rendering thread. The local full Black Box export is unchanged.
(function () {
    function factory(BB) {
        function buildReport(task) {
            const a = BB.analyze(task.rec);
            for (const i of a.incidents) i.wallStart = new Date(task.wallStart + i.startMs).toISOString();
            const rep = {
                format: 'arena-blackbox', version: 1, reason: 'telemetry', savedAt: new Date(task.wallEnd).toISOString(),
                header: task.header,
                window: { wallStart: new Date(task.wallStart).toISOString(), wallEnd: new Date(task.wallEnd).toISOString(), seconds: (task.wallEnd - task.wallStart) / 1000 },
                summary: a.summary, thresholds: a.thresholds, incidents: a.incidents,
                series: { frames: task.rec.frames, packets: task.rec.packets, pingMs: task.rec.pings, predictionError: task.rec.csp, heapBytes: task.rec.heap, sceneCounts: task.rec.counts, events: task.rec.events },
                telemetry: { analysis: 'web-worker', fullNetDiagnostic: 'available-in-local-export' },
                legend: { frames: '[t ms, frame interval ms, JS work ms]', packets: '[t ms,tick,gap ms,missing ticks,players,bullets,zombies]', pingMs: '[t ms,RTT ms]' },
            };
            const json = JSON.stringify(rep);
            if (json.length > 850000) throw new Error('Capture too large; full report remains available locally');
            return json;
        }
        return { buildReport };
    }
    if (typeof module === 'object' && module.exports) { module.exports = factory(require('./blackbox')); return; }
    const script = new URL('blackbox.js', self.location.href); script.search = self.location.search;
    importScripts(script.href);
    const api = factory(self.ARBlackBox);
    self.onmessage = function (event) {
        try { self.postMessage({ id: event.data.id, json: api.buildReport(event.data) }); }
        catch (error) { self.postMessage({ id: event.data.id, error: String(error.message || error) }); }
    };
})();
