// Bot clients for load/measurement. Usage: node bots.js --n 10 --mode br --secs 30 --port 3100 [--out file.json] [--join CODE] [--noStart]
const { io } = require('socket.io-client');
const parser = require('socket.io-msgpack-parser');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const N = +arg('n', 10), MODE = arg('mode', 'br'), SECS = +arg('secs', 30), PORT = +arg('port', 3100);
const OUT = arg('out', null), JOIN = arg('join', null), NOSTART = arg('noStart', false), PFX = arg('prefix', 'bot');
const WEAPON = arg('weapon', undefined);
const HOLD = arg('hold', false);
const BASE = 'http://127.0.0.1:' + PORT;

const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function login(nick) {
    const r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nickname: nick, password: 'x' }) });
    const j = await r.json();
    if (!j.ok) throw new Error('login ' + JSON.stringify(j));
    return j.token;
}

class Bot {
    constructor(i, wander) {
        this.i = i; this.nick = PFX + '_' + i; this.stats = { bytes: 0, msgs: 0, gs: 0, gsBytes: 0, big: [], arr: [], max: 0, sizes: [] };
        this.lastGs = 0; this.myId = null; this.dx = 0; this.dy = 0; this.ang = 0; this.shoot = false; this.t = 0; this.alive = true; this.wander = wander;
        this.ticks = []; // st (tickNo) seen, to detect missed ticks
        this.lastTick = null; this.missed = 0; this.dup = 0;
    }
    async connect() {
        const token = await login(this.nick);
        const s = this.s = io(BASE, { parser, transports: ['websocket'], reconnection: false, forceNew: true });
        await new Promise((res, rej) => { s.on('connect', res); s.on('connect_error', rej); });
        this.myId = s.id;
        // raw bytes per message (engine level)
        s.io.engine.on('data', d => { const n = d.byteLength !== undefined ? d.byteLength : d.length; this.stats.bytes += n; this.stats.msgs++; this.lastLen = n; });
        s.emit('authenticate', { nickname: this.nick, token });
        s.on('gs', pk => {
            const now = performance.now();
            const st = this.stats;
            st.gs++; st.gsBytes += this.lastLen; st.sizes.push(this.lastLen);
            if (this.lastGs) st.arr.push(now - this.lastGs);
            this.lastGs = now;
            const tickNo = pk[8];
            if (this.lastTick !== null) { const d = tickNo - this.lastTick; if (d > 1) this.missed += d - 1; if (d <= 0) this.dup++; }
            this.lastTick = tickNo;
            st.lastPk = pk;
            this.sendInput();
        });
        s.on('eliminated', () => { this.alive = false; });
        s.on('pve-wave-start', () => { this.alive = true; });
        s.on('pve-wave-break', () => { setTimeout(() => s.emit('pve-skip'), 500); });
        s.on('room-error', m => console.error(this.nick, 'room-error', m));
    }
    sendInput() {
        if (!this.alive) return;
        this.t++;
        if (this.wander && this.t % 90 === 1) { const a = Math.random() * Math.PI * 2; this.dx = Math.cos(a); this.dy = Math.sin(a); if (Math.random() < 0.2) { this.dx = 0; this.dy = 0; } }
        if (this.t % 40 === 1) { this.ang = Math.random() * Math.PI * 2; this.shoot = Math.random() < 0.6; }
        this.s.emit('input', { seq: this.t, dx: this.dx, dy: this.dy, angle: this.ang, shooting: this.shoot, sdx: this.shoot ? -Math.sin(this.ang) : 0, sdy: this.shoot ? Math.cos(this.ang) : 0 });
    }
}

(async () => {
    const bots = [];
    for (let i = 0; i < N; i++) { const b = new Bot(i, true); await b.connect(); bots.push(b); }
    const host = bots[0];
    const data = { skin: 'rookie', stats: { hp: 3, dmg: 4, spd: 3 }, weapon: WEAPON, mode: MODE, xp: 0 };
    let code = JOIN;
    if (!code) {
        code = await new Promise(res => { host.s.once('room-created', ({ code }) => res(code)); host.s.emit('create-room', data); });
    }
    for (let i = JOIN ? 0 : 1; i < N; i++) { bots[i].s.emit('join-room', { code, ...data }); await sleep(20); }
    console.log('ROOM', code);
    await sleep(500);
    if (HOLD) { console.log('HOLDING'); await new Promise(r => process.stdin.once('data', r)); }
    if (!NOSTART) host.s.emit('start-game');
    const t0 = Date.now();
    // wait for the countdown (3.7 s) then measure
    await sleep(4500);
    for (const b of bots) { b.stats = { bytes: 0, msgs: 0, gs: 0, gsBytes: 0, big: [], arr: [], max: 0, sizes: [] }; b.missed = 0; b.dup = 0; }
    const m0 = Date.now();
    await sleep(SECS * 1000);
    const dur = (Date.now() - m0) / 1000;
    const per = bots.map(b => {
        const st = b.stats;
        return { kbps: st.bytes / 1024 / dur, msgsps: st.msgs / dur, gsps: st.gs / dur, gsKB: st.gsBytes / Math.max(1, st.gs) / 1024,
            sizeP50: pct(st.sizes, .5), sizeP95: pct(st.sizes, .95), sizeMax: Math.max(0, ...st.sizes),
            arrP50: pct(st.arr, .5), arrP95: pct(st.arr, .95), arrP99: pct(st.arr, .99), arrMax: Math.max(0, ...st.arr), over25: st.arr.filter(v => v > 25).length, over50: st.arr.filter(v => v > 50).length,
            missed: b.missed, dup: b.dup };
    });
    const avg = k => per.reduce((a, p) => a + p[k], 0) / per.length;
    const sum = {
        n: N, mode: MODE, secs: dur,
        kbpsPerClient: +avg('kbps').toFixed(2), msgsPerSecPerClient: +avg('msgsps').toFixed(1), gsPerSec: +avg('gsps').toFixed(1),
        gsKBavg: +avg('gsKB').toFixed(3), sizeP50: avg('sizeP50'), sizeP95: avg('sizeP95'), sizeMax: Math.max(...per.map(p => p.sizeMax)),
        arrP50: +avg('arrP50').toFixed(2), arrP95: +avg('arrP95').toFixed(2), arrP99: +avg('arrP99').toFixed(2), arrMax: +Math.max(...per.map(p => p.arrMax)).toFixed(1),
        over25PerSec: +(avg('over25') / dur).toFixed(2), over50PerSec: +(avg('over50') / dur).toFixed(2), missedTicks: per.reduce((a, p) => a + p.missed, 0),
    };
    console.log(JSON.stringify(sum));
    if (OUT) require('fs').writeFileSync(OUT, JSON.stringify({ sum, per }, null, 1));
    // a sample packet decomposition
    const pk = host.stats.lastPk;
    if (pk) console.log('SAMPLE players', pk[0].length, 'bullets', pk[1].length, 'priv', pk[2].length / 7, 'zombies', pk[5].length / 6, 'kits', pk[6].length / 4);
    for (const b of bots) b.s.disconnect();
    process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
