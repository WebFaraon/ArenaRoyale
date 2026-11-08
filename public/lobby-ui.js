// LOBBY UI: the chest slots, the opening of a chest, the Battle Pass (card and screen) and the inbox. It runs after game.js and uses its globals
// (currentProfile, currentNickname, sessionToken, showToast, skinPreviewSrc, _arsIcon ...). The rules are in chests.js and battlepass.js (the same files
// the server uses); the account's state is the `lobby` object the server sends (server.js CHESTS, BATTLE PASS, INBOX, lobby-core.js).
// Nothing is decided here: every action asks the server, and the screen changes after its answer.
'use strict';
const LobbyUI = (function () {
    const C = window.ARChests, BP = window.ARBattlePass;
    const S = { lobby: null, skew: 0, tick: 0, busy: false };

    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const num = n => Number(n || 0).toLocaleString('en-US');
    const now = () => Date.now() + S.skew;
    const juice = () => !!(window.ARJuice && ARJuice.on());
    const sfx = name => { try { if (window.ARSound) ARSound.play(name); } catch (e) { /* no sound */ } };
    const chestImg = (id, part) => arAsset('/images/chests/' + id + (part ? '_' + part : '') + '.svg');
    const COL = { wooden: '#D99A48', silver: '#8FC8F2', golden: '#FFC72E', diamond: '#5CC0F2', mythical: '#B66BFF' };

    async function post(url, body) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ nickname: currentNickname, token: sessionToken }, body || {})) });
        return r.json();
    }

    // ---------- the account's state ----------
    // opts.wallet === false: the caller animates the coins itself (the mission claim)
    function setLobby(l, opts) {
        if (!l) return;
        S.lobby = l; S.skew = l.now - Date.now();
        if (currentProfile) {
            currentProfile.lobby = l;
            if (!(opts && opts.wallet === false)) { currentProfile.coins = l.coins; currentProfile.diamonds = l.diamonds; if (typeof _arsSetMoney === 'function') _arsSetMoney(); }
        }
        renderAll();
    }
    function applyOwned(r) {
        if (!r) return;
        if (Array.isArray(r.unlocked_characters) && r.unlocked_characters.length) unlockedCharacters = r.unlocked_characters;
        if (Array.isArray(r.owned_weapon_skins) && currentProfile) currentProfile.owned_weapon_skins = r.owned_weapon_skins;
    }
    function renderAll() {
        renderChests(); renderBpCard(); renderBadges();
        if (!$('screen-bp').style.display || $('screen-bp').style.display !== 'none') renderBp();
        if ($('inbox-overlay').style.display === 'flex') renderInbox();
    }
    const bp = () => S.lobby ? S.lobby.bp : { xp: 0, blast: false, claimed: { free: [], blast: [] } };
    const claimables = () => BP.claimable(BP.normalize(bp()));

    // ---------- CHESTS (the lobby tray) ----------
    function fmtLeft(ms) {
        const s = Math.max(0, Math.ceil(ms / 1000));
        const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60, p = v => String(v).padStart(2, '0');
        return h > 0 ? `${h}:${p(m)}:${p(x)}` : `${p(m)}:${p(x)}`;
    }
    function fmtWait(ms) {
        const m = Math.round(ms / 60000);
        return m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m / 60}h`) : `${m} min`;
    }
    function slotHtml(c, i, t, openingAt) {
        if (!c) return `<div class="cs cs-empty" data-slot="${i}"><span class="cs-num">${i + 1}</span><span class="cs-tag">EMPTY</span><img class="cs-img cs-img-empty" src="${arAsset('/images/ui/loc_gol.svg')}" alt="" draggable="false"><span class="cs-name">Empty slot</span><span class="cs-sub">Win a match</span></div>`;
        const type = C.BY_ID[c.type], st = C.statusOf(c, t), left = C.remaining(c, t), cost = C.gemCost(left);
        let tag, sub, btn;
        if (st === 'ready') { tag = 'READY'; sub = 'Opens now'; btn = `<button type="button" class="cs-btn cs-btn-green" data-act="open">OPEN</button>`; }
        else if (st === 'opening') { tag = 'OPENING'; sub = fmtLeft(left); btn = `<button type="button" class="cs-btn cs-btn-sky" data-act="skip">${ico('gem')}<b>${cost}</b></button>`; }
        else {
            tag = 'WAITING'; sub = fmtWait(left);
            btn = openingAt >= 0 ? `<button type="button" class="cs-btn cs-btn-sky" data-act="skip">${ico('gem')}<b>${cost}</b></button>`
                : `<button type="button" class="cs-btn cs-btn-orange" data-act="start">START</button>`;
        }
        return `<div class="cs cs-${st}" data-slot="${i}" style="--rc:${COL[c.type]}"><span class="cs-num">${i + 1}</span><span class="cs-tag">${tag}</span>
            <img class="cs-img" src="${chestImg(c.type)}" alt="" draggable="false"><span class="cs-name">${type.name}</span><span class="cs-sub"${st === 'opening' ? ' data-timer' : ''}>${sub}</span>${btn}</div>`;
    }
    function renderChests() {
        const box = $('cc-slots'); if (!box || !S.lobby) return;
        const t = now(), slots = S.lobby.slots, openingAt = C.openingSlot(slots, t);
        box.innerHTML = slots.map((c, i) => slotHtml(c, i, t, openingAt)).join('');
        const n = slots.filter(Boolean).length;
        $('cc-count').textContent = `${n} / ${C.SLOTS} slots`;
        $('cc-count').classList.toggle('is-full', n === C.SLOTS);
    }
    // once a second: the countdown of the chest that is opening; when its time is up the tray is drawn again (READY)
    function tickChests() {
        if (!S.lobby || document.hidden) return;
        const t = now(), slots = S.lobby.slots;
        slots.forEach((c, i) => {
            if (!c || c.readyAt == null) return;
            const el = document.querySelector(`#cc-slots .cs[data-slot="${i}"]`); if (!el) return;
            const ready = C.statusOf(c, t) === 'ready';
            if (ready !== el.classList.contains('cs-ready')) { renderChests(); renderBadges(); return; }
            const sub = el.querySelector('[data-timer]'); if (sub) sub.textContent = fmtLeft(C.remaining(c, t));
            const cb = el.querySelector('.cs-btn-sky b'); if (cb) cb.textContent = C.gemCost(C.remaining(c, t));
        });
    }
    function slotClick(e) {
        const b = e.target.closest('.cs-btn'); if (!b || S.busy) return;
        const el = b.closest('.cs'), i = +el.dataset.slot, c = S.lobby.slots[i]; if (!c) return;
        const act = b.dataset.act, type = C.BY_ID[c.type];
        if (act === 'start') return startChest(i);
        if (act === 'open') return openChest(i, false);
        if (act === 'skip') {
            const cost = C.gemCost(C.remaining(c, now())), have = (currentProfile && currentProfile.diamonds) || 0;
            if (have < cost) { showToast(`You need ${num(cost - have)} more gems`); return; }
            confirmBox({ icon: `<img class="cf-chest" src="${chestImg(c.type)}" alt="">`, title: `OPEN ${type.name.toUpperCase()} CHEST NOW?`, text: `Skip the wait for <b>${ico('gem')}${cost}</b> gems. You will have ${num(have - cost)} left.`, ok: 'OPEN', go: () => openChest(i, true) });
        }
    }
    async function startChest(i) {
        S.busy = true;
        try {
            const r = await post('/api/chests/start', { slot: i });
            if (!r.ok) { showToast(r.error || 'Could not start the chest'); if (r.lobby) setLobby(r.lobby); return; }
            sfx('select'); setLobby(r.lobby);
        } catch (e) { showToast('Network error. Please try again.'); } finally { S.busy = false; }
    }
    async function openChest(i, instant) {
        const c = S.lobby.slots[i]; if (!c || S.busy) return;
        S.busy = true;
        CO.begin(c.type);
        try {
            const r = await post('/api/chests/open', { slot: i, instant });
            if (!r.ok) { CO.abort(); showToast(r.error || 'Could not open the chest'); return; }
            applyOwned(r);
            CO.reveal(r.cards, () => { setLobby(r.lobby); if (typeof _heroRender === 'function') { const ch = CHARACTERS[heroIndex]; if (ch) _heroRender(ch); } });
        } catch (e) { CO.abort(); showToast('Network error. Please try again.'); }
        finally { S.busy = false; }
    }

    // ---------- the cards of a chest / a reward ----------
    const RAR_LABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY', mythic: 'MYTHIC', season: 'SEASON' };
    const RAR_COL = { common: '#9FB0BA', rare: '#52B6F0', epic: '#FF8A3A', legendary: '#FFC52E', mythic: '#B66BFF', season: '#FFD02A' };
    function skinArt(card) {
        if (card.skinKind === 'char') return `<img class="cd-skin" src="${skinPreviewSrc(card.id, SKIN_PREVIEW.full)}" alt="" draggable="false">`;
        const s = typeof _arsSkin === 'function' ? _arsSkin(card.id) : null;
        return `<span class="cd-gun">${s ? _arsIcon(s.weapon, card.id) : ''}</span>`;
    }
    // one card, big (in the opening) or small (in a list)
    function cardHtml(card, small) {
        let art, top, bottom, col;
        if (card.kind === 'coins') { art = pic('monede'); top = 'COINS'; bottom = '+' + num(card.amount); col = '#FFC72E'; }
        else if (card.kind === 'gems') { art = pic('diamante'); top = 'GEMS'; bottom = '+' + num(card.amount); col = '#38A7F2'; }
        else {
            col = RAR_COL[card.rarity] || '#9FB0BA'; art = skinArt(card);
            top = (RAR_LABEL[card.rarity] || '') + (card.skinKind === 'weapon' ? ' WEAPON SKIN' : ' SKIN');
            bottom = esc(card.name);
        }
        const dup = card.kind === 'skin' && card.duplicate > 0 ? `<span class="cd-dup">DUPLICATE: +${num(card.duplicate)} ${ico('coins')}</span>` : (card.kind === 'skin' ? '<span class="cd-new">NEW</span>' : '');
        return `<div class="cd${small ? ' cd-sm' : ''}${card.kind === 'skin' ? ' cd-skin-card' : ''}" style="--cc:${col}"><span class="cd-top">${top}</span><span class="cd-art">${art}</span><span class="cd-bottom">${bottom}</span>${dup}</div>`;
    }

    // ---------- CONFIRM / REWARD boxes ----------
    let _cf = null;
    function confirmBox(o) {
        _cf = o;
        $('cf-icon').innerHTML = o.icon || ''; $('cf-title').textContent = o.title; $('cf-text').innerHTML = o.text || '';
        $('cf-ok').textContent = o.ok || 'OK'; $('cf-cancel').style.display = o.single ? 'none' : '';
        $('cf-overlay').hidden = false; $('cf-ok').focus({ preventScroll: true });
    }
    function cfCancel() { $('cf-overlay').hidden = true; _cf = null; }
    function cfOk() { const o = _cf; $('cf-overlay').hidden = true; _cf = null; if (o && o.go) o.go(); }
    function showReward(cards, title) {
        $('rw-title').textContent = title || 'REWARD';
        $('rw-cards').innerHTML = cards.map(c => cardHtml(c, false)).join('');
        $('reward-overlay').hidden = false; sfx('select');
    }
    function closeReward() { $('reward-overlay').hidden = true; sfx('click'); }

    // ---------- the opening of a chest ----------
    // The chest alone in the middle: it shakes harder and harder, the lid flies off, light and particles by rarity burst out, then the cards come out one by
    // one with how many are left; the last tap shows all of them together. Canvas 2D, one pool of particles, nothing allocated per frame.
    const FX = {
        wooden:   { c1: '#E0A455', c2: '#FFE7B8', parts: 30,  beams: 0,  rings: 1, shake: 0,  flash: .35, kind: 'dust' },
        silver:   { c1: '#7FD0FF', c2: '#EAF6FF', parts: 48,  beams: 6,  rings: 1, shake: 0,  flash: .5,  kind: 'spark' },
        golden:   { c1: '#FFC72E', c2: '#FFF3B8', parts: 80,  beams: 10, rings: 2, shake: 4,  flash: .7,  kind: 'confetti' },
        diamond:  { c1: '#5CC0F2', c2: '#E2F8FF', parts: 110, beams: 14, rings: 2, shake: 7,  flash: .85, kind: 'shard' },
        mythical: { c1: '#B66BFF', c2: '#3DFFC9', parts: 150, beams: 18, rings: 3, shake: 11, flash: 1,   kind: 'ember' },
    };
    const CO = (function () {
        const st = { type: null, fx: null, cards: [], idx: -1, phase: 'idle', done: null, raf: 0, t0: 0, burstAt: 0, ctx: null, w: 0, h: 0, dpr: 1, cx: 0, cy: 0, ready: false, pending: null, shakeT: 0 };
        const P = { n: 0, x: new Float32Array(220), y: new Float32Array(220), vx: new Float32Array(220), vy: new Float32Array(220), life: new Float32Array(220), max: new Float32Array(220), size: new Float32Array(220), rot: new Float32Array(220), vr: new Float32Array(220), col: new Uint8Array(220) };
        const rings = [];   // { born, c }
        const reduce = () => window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

        function resize() {
            const cv = $('co-fx'); st.dpr = Math.min(2, window.devicePixelRatio || 1);
            st.w = innerWidth; st.h = innerHeight; cv.width = Math.round(st.w * st.dpr); cv.height = Math.round(st.h * st.dpr);
            cv.style.width = st.w + 'px'; cv.style.height = st.h + 'px'; st.ctx = cv.getContext('2d');
            const r = $('co-chest').getBoundingClientRect(); st.cx = r.left + r.width / 2; st.cy = r.top + r.height * 0.5;
        }
        function emit(n, fx, speed) {
            for (let k = 0; k < n && P.n < 220; k++) {
                const i = P.n++, a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.9);
                P.x[i] = st.cx + (Math.random() - .5) * 40; P.y[i] = st.cy - 10 + (Math.random() - .5) * 14;
                P.vx[i] = Math.cos(a) * v; P.vy[i] = Math.sin(a) * v - speed * 0.45;
                P.max[i] = P.life[i] = 0.9 + Math.random() * 0.9; P.size[i] = 3 + Math.random() * (fx.kind === 'confetti' ? 7 : 5);
                P.rot[i] = Math.random() * 6.28; P.vr[i] = (Math.random() - .5) * 12; P.col[i] = Math.random() < .5 ? 0 : 1;
            }
        }
        function drawBeams(ctx, t, fx, k) {
            if (!fx.beams || k <= 0) return;
            ctx.save(); ctx.translate(st.cx, st.cy - 10); ctx.globalCompositeOperation = 'lighter';
            const len = Math.max(st.w, st.h) * 0.75, spin = t * 0.35;
            for (let i = 0; i < fx.beams; i++) {
                const a = spin + (i / fx.beams) * Math.PI * 2, wd = 0.05 + (i % 3) * 0.018;
                const g = ctx.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
                g.addColorStop(0, fx.c2); g.addColorStop(0.4, fx.c1); g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.globalAlpha = 0.28 * k; ctx.fillStyle = g;
                ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a - wd) * len, Math.sin(a - wd) * len); ctx.lineTo(Math.cos(a + wd) * len, Math.sin(a + wd) * len); ctx.closePath(); ctx.fill();
            }
            ctx.restore();
        }
        function drawParts(ctx, dt, fx) {
            for (let i = 0; i < P.n; i++) {
                P.life[i] -= dt;
                if (P.life[i] <= 0) { const j = --P.n; if (i !== j) { for (const a of [P.x, P.y, P.vx, P.vy, P.life, P.max, P.size, P.rot, P.vr, P.col]) a[i] = a[j]; } i--; continue; }
                P.vy[i] += (fx.kind === 'ember' ? -90 : 520) * dt; P.vx[i] *= 1 - 1.4 * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.rot[i] += P.vr[i] * dt;
                const k = P.life[i] / P.max[i], s = P.size[i] * (fx.kind === 'ember' ? k : 0.5 + 0.5 * k);
                ctx.globalAlpha = Math.min(1, k * 1.6); ctx.fillStyle = P.col[i] ? fx.c2 : fx.c1;
                ctx.save(); ctx.translate(P.x[i], P.y[i]); ctx.rotate(P.rot[i]);
                if (fx.kind === 'confetti') ctx.fillRect(-s, -s * .5, s * 2, s);
                else if (fx.kind === 'shard') { ctx.beginPath(); ctx.moveTo(0, -s * 1.6); ctx.lineTo(s * .8, 0); ctx.lineTo(0, s * 1.6); ctx.lineTo(-s * .8, 0); ctx.closePath(); ctx.fill(); }
                else if (fx.kind === 'ember') { ctx.beginPath(); ctx.arc(0, 0, s, 0, 6.28); ctx.fill(); }
                else { ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.quadraticCurveTo(0, 0, s * 1.5, 0); ctx.quadraticCurveTo(0, 0, 0, s * 1.5); ctx.quadraticCurveTo(0, 0, -s * 1.5, 0); ctx.quadraticCurveTo(0, 0, 0, -s * 1.5); ctx.fill(); }
                ctx.restore();
            }
        }
        function frame(ts) {
            if ($('chest-open').hidden) { st.raf = 0; return; }
            const t = (ts - st.t0) / 1000, dt = Math.min(0.05, (ts - (st.last || ts)) / 1000); st.last = ts;
            const ctx = st.ctx, fx = st.fx; ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); ctx.clearRect(0, 0, st.w, st.h);
            if (juice() && !reduce()) {
                const since = st.burstAt ? (ts - st.burstAt) / 1000 : -1;
                // light behind the chest: grows with the anticipation, bursts, then settles
                const k = st.phase === 'shake' ? Math.min(1, t / 1.6) * 0.35 : since >= 0 ? Math.max(0.45, 1 - since * 0.35) : 0;
                drawBeams(ctx, t, fx, st.phase === 'shake' ? 0 : k);
                for (let i = rings.length - 1; i >= 0; i--) {
                    const a = (ts - rings[i].born) / 1000; if (a < 0) continue; if (a > 1.1) { rings.splice(i, 1); continue; }
                    ctx.globalAlpha = (1 - a / 1.1) * 0.8; ctx.strokeStyle = rings[i].c; ctx.lineWidth = 8 * (1 - a / 1.1) + 2;
                    ctx.beginPath(); ctx.arc(st.cx, st.cy - 10, 30 + a * Math.max(st.w, st.h) * 0.55, 0, 6.28); ctx.stroke();
                }
                if (st.phase === 'shake' && Math.random() < dt * (6 + t * 22)) emit(1, fx, 90);
                if (st.phase === 'cards' && fx.kind === 'ember' && Math.random() < dt * 14) emit(1, fx, 50);
                drawParts(ctx, dt, fx); ctx.globalAlpha = 1;
            }
            st.raf = requestAnimationFrame(frame);
        }

        function begin(type) {
            const fx = FX[type]; st.type = type; st.fx = fx; st.cards = []; st.idx = -1; st.phase = 'shake'; st.done = null; st.burstAt = 0; st.ready = false; st.pending = null; P.n = 0; rings.length = 0;
            const ov = $('chest-open'); ov.hidden = false; ov.dataset.type = type; ov.dataset.phase = 'shake'; ov.style.setProperty('--rc', fx.c1); ov.style.setProperty('--rc2', fx.c2);
            $('co-body').src = chestImg(type, 'body'); $('co-lid').src = chestImg(type, 'lid');
            $('co-name').textContent = C.BY_ID[type].name.toUpperCase() + ' CHEST'; $('co-left').textContent = ''; $('co-cardbox').innerHTML = '';
            $('co-btn').textContent = '...'; $('co-btn').disabled = true; $('co-btn').hidden = false;
            const chest = $('co-chest'); chest.className = 'co-chest'; void chest.offsetWidth; chest.classList.add('is-in');
            $('co-glow').className = 'co-glow'; void $('co-glow').offsetWidth;
            document.body.classList.add('co-open');
            requestAnimationFrame(() => { resize(); st.t0 = performance.now(); st.last = 0; if (!st.raf) st.raf = requestAnimationFrame(frame); });
            sfx('select'); setTimeout(() => { if (st.phase === 'shake') { chest.classList.add('is-shake'); $('co-glow').classList.add('is-on'); } }, 450);
            st.shakeUntil = performance.now() + 1700;   // the anticipation lasts at least this long, even if the answer is quicker
        }
        function abort() { st.phase = 'idle'; close(); }
        // the server answered: wait for the anticipation, then burst
        function reveal(cards, done) {
            st.cards = cards; st.done = done;
            const wait = Math.max(0, st.shakeUntil - performance.now());
            setTimeout(burst, wait);
        }
        function burst() {
            if (st.phase !== 'shake') return;
            const ov = $('chest-open'), fx = st.fx, chest = $('co-chest');
            st.phase = 'cards'; ov.dataset.phase = 'cards'; st.burstAt = performance.now();
            chest.classList.remove('is-shake'); chest.classList.add('is-open');
            $('co-glow').classList.add('is-burst'); sfx('start');
            if (juice() && !reduce()) {
                emit(fx.parts, fx, 520 + fx.parts * 2);
                for (let i = 0; i < fx.rings; i++) rings.push({ born: performance.now() + i * 140, c: i % 2 ? fx.c2 : fx.c1 });
                const fl = $('co-flash'); if (fl) { fl.style.setProperty('--fa', fx.flash); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go'); }
                if (fx.shake) { const sg = $('co-stage'); sg.style.setProperty('--sh', fx.shake + 'px'); sg.classList.remove('is-quake'); void sg.offsetWidth; sg.classList.add('is-quake'); }
            }
            st.idx = -1; st.ready = false; setTimeout(() => { st.ready = true; next(); }, 650);   // taps are ignored until the first card is out
        }
        function showCard(i) {
            const box = $('co-cardbox'), card = st.cards[i], fx = st.fx;
            box.innerHTML = cardHtml(card, false);
            const el = box.firstElementChild; el.classList.add('is-pop');
            if (juice() && !reduce() && card.kind === 'skin') { emit(22, fx, 360); }
            const left = st.cards.length - 1 - i;
            $('co-left').textContent = left > 0 ? `${left} ${left === 1 ? 'CARD' : 'CARDS'} LEFT` : 'LAST CARD';
            $('co-btn').textContent = left > 0 ? 'NEXT' : 'DONE'; $('co-btn').disabled = false; sfx('select');
        }
        function summary() {
            st.phase = 'summary'; $('chest-open').dataset.phase = 'summary';
            $('co-cardbox').innerHTML = `<div class="co-sum">${st.cards.map(c => cardHtml(c, true)).join('')}</div>`;
            $('co-left').textContent = 'YOU GOT'; $('co-btn').textContent = 'COLLECT'; sfx('select');
        }
        function next() {
            if (st.phase === 'cards') {
                if (!st.ready) return;
                if (st.idx < st.cards.length - 1) { st.idx++; showCard(st.idx); }
                else summary();
            } else if (st.phase === 'summary') finish();
        }
        function finish() { sfx('click'); const d = st.done; st.done = null; st.phase = 'idle'; close(); if (d) d(); }
        function close() {
            $('chest-open').hidden = true; document.body.classList.remove('co-open');
            if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
            const ctx = st.ctx; if (ctx) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, $('co-fx').width, $('co-fx').height); }
        }
        return { begin, abort, reveal, next, state: st };
    })();

    // ---------- BATTLE PASS: the card in the lobby ----------
    function rewardOf(track, tier) { return BP.TRACKS[track][tier] || null; }
    function rewardIcon(r) {
        if (r.charSkin) return `<img class="bpr-skin" src="${skinPreviewSrc(r.charSkin, SKIN_PREVIEW.full)}" alt="" draggable="false">`;
        if (r.weaponSkin) { const s = typeof _arsSkin === 'function' ? _arsSkin(r.weaponSkin) : null; return `<span class="bpr-gun">${s ? _arsIcon(s.weapon, r.weaponSkin) : ''}</span>`; }
        if (r.coins && r.diamonds) return `<span class="bpr-two">${pic('monede')}${pic('diamante')}</span>`;
        if (r.diamonds) return pic('diamante');
        return pic('monede');
    }
    function rewardLabel(r) {
        if (r.charSkin) { const ch = getCharacterById(r.charSkin); return (ch ? esc(ch.name) : 'Skin').toUpperCase(); }
        if (r.weaponSkin) { const s = typeof _arsSkin === 'function' ? _arsSkin(r.weaponSkin) : null; return (s ? esc(s.name) : 'Skin').toUpperCase(); }
        return (r.coins ? '+' + num(r.coins) : '') + (r.coins && r.diamonds ? ' ' : '') + (r.diamonds ? '+' + r.diamonds + ' GEMS' : '');
    }
    const isSkin = r => !!(r && (r.charSkin || r.weaponSkin));
    function renderBpCard() {
        const card = $('bp-card'); if (!card) return;
        const b = BP.normalize(bp()), tier = BP.tierOf(b.xp), into = BP.intoTier(b.xp);
        $('bp-card-kick').textContent = BP.SEASON.kicker; $('bp-card-season').textContent = BP.SEASON.name;
        $('bp-card-tier').textContent = 'TIER ' + tier;
        $('bp-card-xp').textContent = tier >= BP.TIERS ? 'MAX' : `${num(into)} / ${num(BP.XP_PER_TIER)} XP`;
        $('bp-card-fill').style.width = (into / BP.XP_PER_TIER * 100) + '%';
        // three tiles: the last reward you reached, the next one, the next skin
        const has = t => BP.FREE[t] || BP.BLAST[t];
        let last = 0; for (let t = tier; t >= 1; t--) if (BP.FREE[t]) { last = t; break; }
        let nextT = 0; for (let t = tier + 1; t <= BP.TIERS; t++) if (has(t)) { nextT = t; break; }
        let skinT = 0, skinTrack = 'blast'; for (let t = tier + 1; t <= BP.TIERS; t++) { if (isSkin(BP.BLAST[t])) { skinT = t; skinTrack = 'blast'; break; } if (isSkin(BP.FREE[t])) { skinT = t; skinTrack = 'free'; break; } }
        const tile = (t, track, kind) => {
            if (!t) return '<div class="bpt bpt-none"></div>';
            const r = rewardOf(track, t) || rewardOf(track === 'free' ? 'blast' : 'free', t);
            const tr = rewardOf(track, t) ? track : (track === 'free' ? 'blast' : 'free');
            const claimed = b.claimed[tr].includes(t), can = !claimed && t <= tier && (tr === 'free' || b.blast);
            const lock = t > tier || (tr === 'blast' && !b.blast && !claimed);
            return `<div class="bpt${claimed ? ' is-done' : ''}${can ? ' is-can' : ''}${lock && !can ? ' is-lock' : ''}${kind === 'skin' ? ' is-skin' : ''}"><span class="bpt-ic">${rewardIcon(r)}</span><span class="bpt-lbl">${claimed ? ico('check') : (lock && !can ? ico('lock') : '')}${kind === 'last' ? 'TIER ' + t : kind === 'skin' ? 'SKIN · ' + t : '+ · ' + t}</span></div>`;
        };
        $('bp-card-tiles').innerHTML = tile(last, 'free', 'last') + tile(nextT, BP.FREE[nextT] ? 'free' : 'blast', 'next') + tile(skinT, skinTrack, 'skin');
    }
    function renderBadges() {
        const n = claimables().length;
        const set = (id, v) => { const el = $(id); if (!el) return; el.hidden = !v; el.style.display = v ? '' : 'none'; el.textContent = v; };
        set('bp-card-badge', n); set('bp-nav-badge', n);
        const inb = S.lobby ? S.lobby.inbox.filter(m => !m.read || (m.reward && !m.claimed)).length : 0;
        set('inbox-nav-badge', inb);
    }

    // ---------- BATTLE PASS: the screen ----------
    function cellHtml(track, t, b) {
        const r = rewardOf(track, t), tier = BP.tierOf(b.xp);
        if (!r) return `<div class="bpc-cell bpc-none" aria-label="No reward"><span>·</span></div>`;
        const claimed = b.claimed[track].includes(t), reached = t <= tier, unlocked = track === 'free' || b.blast, can = !claimed && reached && unlocked;
        const cls = ['bpc-cell', 'bpc-' + track, claimed ? 'is-done' : '', can ? 'is-can' : '', !reached ? 'is-far' : '', !unlocked ? 'is-locked' : '', isSkin(r) ? 'is-skin' : ''].join(' ');
        const state = claimed ? `<span class="bpc-state bpc-ok">${ico('check')}</span>` : (!unlocked ? `<span class="bpc-state bpc-lock">${ico('lock')}</span>` : (!reached ? '' : `<span class="bpc-state bpc-claim">CLAIM</span>`));
        return `<button type="button" class="${cls}" data-track="${track}" data-tier="${t}" ${can ? '' : 'tabindex="-1"'} aria-label="${track === 'free' ? 'Free' : 'Blast Tier'} reward, tier ${t}${claimed ? ', claimed' : can ? ', claim' : ''}"><span class="bpc-ic">${rewardIcon(r)}</span><span class="bpc-lbl">${rewardLabel(r)}</span>${state}</button>`;
    }
    function renderBp() {
        if (!S.lobby) return;
        const b = BP.normalize(bp()), tier = BP.tierOf(b.xp), into = BP.intoTier(b.xp);
        $('bp-kick').textContent = BP.SEASON.kicker; $('bp-season').textContent = BP.SEASON.name;
        $('bp-sum-tier').textContent = 'TIER ' + tier;
        $('bp-sum-xp').textContent = tier >= BP.TIERS ? 'MAX TIER' : `${num(into)} / ${num(BP.XP_PER_TIER)} XP to tier ${tier + 1}`;
        $('bp-sum-fill').style.width = (into / BP.XP_PER_TIER * 100) + '%';
        const n = claimables().length;
        $('bp-claim-all').disabled = !n; $('bp-claim-all').textContent = n ? `CLAIM ALL (${n})` : 'CLAIM ALL';
        const bb = $('bp-blast-btn'); bb.classList.toggle('is-owned', b.blast); bb.disabled = b.blast;
        $('bp-blast-txt').innerHTML = b.blast ? `${ico('check')}BLAST TIER ACTIVE` : `GET BLAST TIER · $${BP.BLAST_PRICE_USD}`;
        $('bp-coins').textContent = num(S.lobby.coins); $('bp-diamonds').textContent = num(S.lobby.diamonds);
        const track = $('bp-track'), keep = track.scrollLeft;
        let html = '';
        for (let t = 1; t <= BP.TIERS; t++) html += `<div class="bpc${t === tier ? ' is-cur' : ''}${t <= tier ? ' is-reached' : ''}" data-tier="${t}"><div class="bpc-tier">${t}</div>${cellHtml('free', t, b)}${cellHtml('blast', t, b)}</div>`;
        track.innerHTML = html; track.scrollLeft = keep;
    }
    function openBattlePass() {
        const scr = $('screen-bp'); if (!S.lobby || scr.style.display === 'flex') return;
        scr.classList.remove('is-closing'); scr.style.display = 'flex'; document.body.classList.add('arsenal-open');
        renderBp(); sfx('click');
        const cur = document.querySelector('#bp-track .bpc.is-cur'), track = $('bp-track');
        if (cur) track.scrollLeft = Math.max(0, cur.offsetLeft - track.clientWidth / 2 + cur.offsetWidth / 2);
        document.addEventListener('keydown', bpKey);
        const back = scr.querySelector('.ars-back'); if (back) back.focus({ preventScroll: true, focusVisible: false });
    }
    function closeBattlePass() {
        const scr = $('screen-bp'); if (scr.style.display === 'none' || scr.classList.contains('is-closing')) return;
        document.removeEventListener('keydown', bpKey); document.body.classList.remove('arsenal-open');
        const fin = () => { scr.removeEventListener('animationend', onEnd); if (!scr.classList.contains('is-closing')) return; scr.classList.remove('is-closing'); scr.style.display = 'none'; };
        const onEnd = e => { if (e.target === scr) fin(); };
        scr.classList.add('is-closing'); scr.addEventListener('animationend', onEnd); setTimeout(fin, 450);
    }
    function bpKey(e) { if (e.key === 'Escape' && $('cf-overlay').hidden && $('reward-overlay').hidden) closeBattlePass(); }
    async function claim(track, tier) {
        const r = await post('/api/battlepass/claim', { track, tier });
        if (!r.ok) { showToast(r.error || 'Could not claim'); if (r.lobby) setLobby(r.lobby); return null; }
        applyOwned(r); setLobby(r.lobby); return r;
    }
    async function bpCellClick(e) {
        const c = e.target.closest('.bpc-cell.is-can'); if (!c || S.busy) return;
        S.busy = true;
        try { const r = await claim(c.dataset.track, +c.dataset.tier); if (r) showReward(r.cards, `TIER ${c.dataset.tier} REWARD`); }
        catch (err) { showToast('Network error. Please try again.'); } finally { S.busy = false; }
    }
    async function bpClaimAll() {
        if (S.busy) return;
        const list = claimables(); if (!list.length) return;
        S.busy = true; const all = [];
        try {
            for (const { track, tier } of list) { const r = await claim(track, tier); if (!r) break; all.push(...r.cards); }
            if (all.length) showReward(mergeCards(all), 'REWARDS');
        } catch (err) { showToast('Network error. Please try again.'); } finally { S.busy = false; }
    }
    // the coins and the gems of several rewards as one card each
    function mergeCards(cards) {
        const out = []; let coins = 0, gems = 0;
        for (const c of cards) { if (c.kind === 'coins') coins += c.amount; else if (c.kind === 'gems') gems += c.amount; else out.push(c); }
        if (gems) out.unshift({ kind: 'gems', amount: gems }); if (coins) out.unshift({ kind: 'coins', amount: coins });
        return out;
    }
    function bpBuyBlast() {
        if (bp().blast) return;
        confirmBox({ icon: `<img class="pic cf-bp" src="${arAsset('/images/ui/battlepass.svg')}" alt="">`, title: 'GET BLAST TIER?', text: `Unlock the Blast Tier rewards for <b>$${BP.BLAST_PRICE_USD}</b>. You get everything on the tiers you have already passed, starting with an exclusive Season skin on tier 1.`, ok: `GET · $${BP.BLAST_PRICE_USD}`, go: async () => {
            try { const r = await post('/api/battlepass/buy-blast'); if (!r.ok) { showToast(r.error || 'Could not get Blast Tier'); return; } setLobby(r.lobby); showToast('Blast Tier unlocked'); }
            catch (err) { showToast('Network error. Please try again.'); }
        } });
    }

    // ---------- INBOX ----------
    function ago(ts) {
        const m = Math.max(0, Math.round((now() - ts) / 60000));
        return m < 1 ? 'now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} d ago`;
    }
    function rewardChips(r) {
        const chips = [];
        if (r.coins) chips.push(`<span class="ib-chip">${ico('coins')}+${num(r.coins)}</span>`);
        if (r.diamonds) chips.push(`<span class="ib-chip">${ico('gem')}+${r.diamonds}</span>`);
        if (r.charSkin) { const ch = getCharacterById(r.charSkin); chips.push(`<span class="ib-chip">${ico('lock-open')}${esc(ch ? ch.name : 'Skin')}</span>`); }
        if (r.weaponSkin) { const s = typeof _arsSkin === 'function' ? _arsSkin(r.weaponSkin) : null; chips.push(`<span class="ib-chip">${ico('lock-open')}${esc(s ? s.name : 'Skin')}</span>`); }
        return chips.join('');
    }
    function renderInbox() {
        const list = $('inbox-list'); if (!list || !S.lobby) return;
        const msgs = S.lobby.inbox;
        if (!msgs.length) { list.innerHTML = '<div class="ib-empty">No messages yet.<br><span>Rewards and news from the game will arrive here.</span></div>'; return; }
        list.innerHTML = msgs.map(m => `<div class="ib-msg${m.read ? '' : ' is-new'}${m.reward && !m.claimed ? ' has-reward' : ''}" data-id="${m.id}">
            <div class="ib-head"><span class="ib-title">${esc(m.title || 'Message')}</span><span class="ib-time">${ago(m.ts)}</span></div>
            <p class="ib-text">${esc(m.text)}</p>
            <div class="ib-foot">${m.reward ? `<span class="ib-chips">${rewardChips(m.reward)}</span>` : '<span></span>'}
              ${m.reward && !m.claimed ? `<button type="button" class="ars-blk ars-btn-gold ars-mini" data-act="claim">CLAIM</button>` : m.reward ? '<span class="ib-done">CLAIMED</span>' : ''}
              <button type="button" class="ib-del" data-act="del" aria-label="Delete message" ${m.reward && !m.claimed ? 'disabled' : ''}>${ico('x')}</button></div></div>`).join('');
    }
    async function openInbox() {
        if (!S.lobby) return;
        $('inbox-overlay').style.display = 'flex'; renderInbox(); sfx('click');
        // what has no reward is read by opening the inbox
        const unread = S.lobby.inbox.filter(m => !m.read && !m.reward);
        for (const m of unread) { try { const r = await post('/api/inbox/read', { id: m.id }); if (r.ok) { m.read = true; } } catch (e) { break; } }
        renderBadges();
    }
    function closeInbox() { $('inbox-overlay').style.display = 'none'; renderBadges(); }
    async function inboxClick(e) {
        const b = e.target.closest('[data-act]'); if (!b || b.disabled || S.busy) return;
        const id = +b.closest('.ib-msg').dataset.id; S.busy = true;
        try {
            if (b.dataset.act === 'claim') { const r = await post('/api/inbox/claim', { id }); if (!r.ok) { showToast(r.error || 'Could not claim'); return; } applyOwned(r); setLobby(r.lobby); showReward(mergeCards(r.cards), 'REWARD'); }
            else { const r = await post('/api/inbox/delete', { id }); if (!r.ok) { showToast(r.error || 'Could not delete'); return; } setLobby(r.lobby); }
        } catch (err) { showToast('Network error. Please try again.'); } finally { S.busy = false; }
    }

    // ---------- the match: slots full, and what the match gave ----------
    const slotsFull = () => !!(S.lobby && C.isFull(S.lobby.slots));
    // before a Battle Royale or PvE match: all four slots taken -> no chest this match, even for a win
    function warnSlots(go) {
        confirmBox({ icon: `<img class="cf-chest" src="${chestImg('wooden')}" alt="">`, title: 'ALL CHEST SLOTS ARE FULL', text: 'You will not get a chest from this match, even if you win. Open or wait for one of your chests first to make room.', ok: 'PLAY ANYWAY', go });
    }
    // the end boards show it (BR: #screen-gameover, PvE: #pve-end)
    function matchChest(d) {
        if (d && d.lobby) setLobby(d.lobby);
        S.matchChest = d || null;
        const html = !d ? '' : d.chest ? `<img class="mc-img" src="${chestImg(d.chest.type)}" alt=""><span class="mc-txt"><b>${C.BY_ID[d.chest.type].name.toUpperCase()} CHEST</b><span>Added to your chests</span></span>`
            : d.full ? `<img class="mc-img mc-gray" src="${chestImg('wooden')}" alt=""><span class="mc-txt"><b>NO CHEST</b><span>All your chest slots are full</span></span>` : '';
        for (const id of ['go-chest', 'pe-chest']) { const el = $(id); if (!el) continue; el.innerHTML = html; el.hidden = !html; el.classList.toggle('mc-full', !!(d && d.full)); }
    }
    function resetMatchChest() { S.matchChest = null; for (const id of ['go-chest', 'pe-chest']) { const el = $(id); if (el) { el.innerHTML = ''; el.hidden = true; } } }

    // ---------- start ----------
    function init() {
        if (currentProfile && currentProfile.lobby) setLobby(currentProfile.lobby);
        if (!S.tick) S.tick = setInterval(tickChests, 1000);
        const slots = $('cc-slots'); if (slots && !slots._bound) { slots._bound = true; slots.addEventListener('click', slotClick); }
        const track = $('bp-track'); if (track && !track._bound) { track._bound = true; track.addEventListener('click', bpCellClick); }
        const inb = $('inbox-list'); if (inb && !inb._bound) { inb._bound = true; inb.addEventListener('click', inboxClick); }
        const co = $('chest-open'); if (co && !co._bound) { co._bound = true; co.addEventListener('click', e => { if (e.target.closest('#co-btn')) return; CO.next(); }); }
        document.addEventListener('visibilitychange', () => { if (!document.hidden) { renderChests(); renderBadges(); } });
    }
    return { init, setLobby, get lobby() { return S.lobby; }, slotsFull, warnSlots, matchChest, resetMatchChest, openBattlePass, closeBattlePass, bpClaimAll, bpBuyBlast, openInbox, closeInbox, cfCancel, cfOk, closeReward, coNext: () => CO.next(), renderAll, CO };
})();
window.LobbyUI = LobbyUI;
// the handlers the HTML calls
function openBattlePass() { LobbyUI.openBattlePass(); }
function closeBattlePass() { LobbyUI.closeBattlePass(); }
function bpClaimAll() { LobbyUI.bpClaimAll(); }
function bpBuyBlast() { LobbyUI.bpBuyBlast(); }
function openInbox() { LobbyUI.openInbox(); }
function closeInbox() { LobbyUI.closeInbox(); }
function cfCancel() { LobbyUI.cfCancel(); }
function cfOk() { LobbyUI.cfOk(); }
function closeReward() { LobbyUI.closeReward(); }
function coNext() { LobbyUI.coNext(); }
