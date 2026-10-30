// ============================================
// Blastridge - dev-weapons.js
// Developer view: a player holding each gun, drawn by the same _drawPlayerFigure the match uses.
// Loaded by game.js only when the page is opened with ?dev=weapons; nothing here runs otherwise.
// ============================================
(function () {
    'use strict';
    let GUNS = []; // weapons.json order, filled when it loads
    // weapon skins (public/data/weapon-skins.json, the file the server reads): id -> skin with its price
    const WSKINS = {};
    const WSKINS_READY = fetch(arAsset('/data/weapon-skins.json')).then(r => r.json())
        .then(d => { for (const s of ARShared.weaponSkins(d)) WSKINS[s.id] = s; })
        .catch(err => console.warn('[dev-weapons] weapon-skins.json:', err.message));
    const WORLD_C = 1300;          // the view is centred in the middle of the arena, on the turf
    const GRID_DX = 300, GRID_DY = 330;

    const st = {
        skin: 'rookie', weapon: null, weaponSkin: null, angle: 0, auto: false, zoom: 3, view: 'one',
        hitbox: true, muzzle: true, hands: true, frame: false, labels: false,
    };
    const entries = {};
    // shots: per figure (gun id + skin) its effects, pending shots (burst) and live bullets
    const fxBy = {}, pending = [], bullets = [];
    let nextAuto = 0;
    const fxFor = key => fxBy[key] || (fxBy[key] = _newShotFx());
    const figKey = it => it.wid + (it.skin ? ':' + it.skin : '');
    // bullets per trigger pull and the time until the next pull (as the match: the whole burst, then shootCd)
    const shotsPerPull = w => (w.fireMode === 'burst' ? w.burstCount : 1);
    const pullCycleMs = w => (w.shootCd + (shotsPerPull(w) - 1) * w.burstDelay) * 1000;
    // one trigger pull of figure `it` (gun it.wid, skin it.skin) at (it.x, it.y), aiming at `angle` (0 = down)
    function pull(it, angle, now) {
        const w = _WEAPON_DATA[it.wid];
        for (let i = 0; i < shotsPerPull(w); i++) pending.push({ at: now + i * w.burstDelay * 1000, wid: it.wid, skin: it.skin, key: figKey(it), x: it.x, y: it.y, angle });
    }
    // bullets start at the base gun's muzzle whatever the skin (as in the match); only the flash moves
    function shoot(s, now) {
        const w = _WEAPON_DATA[s.wid], gun = WEAPON_ART.byId[s.wid];
        const dx = -Math.sin(s.angle), dy = Math.cos(s.angle);
        const n = w.pellets, spread = w.spread;
        for (let i = 0; i < n; i++) {
            const a = n === 1 ? 0 : -spread / 2 + i * spread / (n - 1), c = Math.cos(a), sn = Math.sin(a);
            bullets.push({ wid: s.wid, skin: s.skin, x: s.x + dx * gun.muzzleDist, y: s.y + dy * gun.muzzleDist,
                vx: (dx * c - dy * sn) * w.bulletSpeed, vy: (dx * sn + dy * c) * w.bulletSpeed, t0: now, life: gun.bulletLife });
        }
        _shotKick(fxFor(s.key), now);
    }
    const entryFor = id => entries[id] || (entries[id] = _makeSkinEntry(id));

    let overlay, canvas, ctx, readout, raf = 0, last = 0;

    function el(tag, attrs, html) {
        const e = document.createElement(tag);
        for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    function build() {
        overlay = el('div', { id: 'dev-weapons' });
        overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;background:#101A15;font:600 13px Sen,Arial,sans-serif;color:#F2EFE6';
        canvas = el('canvas');
        canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%';
        overlay.appendChild(canvas);
        ctx = canvas.getContext('2d');

        const panel = el('div');
        panel.style.cssText = 'position:absolute;left:12px;top:12px;width:250px;max-height:calc(100% - 24px);overflow:auto;padding:12px;'
            + 'background:rgba(10,16,19,.86);border:3px solid #0A1013;border-radius:14px;display:flex;flex-direction:column;gap:10px';
        const skinOpts = CHARACTERS.map(c => '<option value="' + c.id + '">' + c.name + ' (' + c.rarity + ')</option>').join('');
        const gunBtns = ['none'].concat(GUNS).map(id => '<label style="display:inline-flex;gap:4px;margin:0 8px 4px 0"><input type="radio" name="dw-w" value="' + id + '"'
            + (id === st.weapon ? ' checked' : '') + '>' + (id === 'none' ? 'No weapon' : WEAPON_ART.byId[id].name) + '</label>').join('');
        const box = (k, label) => '<label style="display:flex;gap:6px"><input type="checkbox" data-k="' + k + '"' + (st[k] ? ' checked' : '') + '>' + label + '</label>';
        panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">WEAPONS (dev)</b>'
            + '<button id="dw-close" style="padding:2px 8px">X</button></div>'
            + '<label>Skin<br><select id="dw-skin" style="width:100%;color:#0A1013;background:#F2EFE6;opacity:1;font:600 13px Sen,Arial">' + skinOpts + '</select></label>'
            + '<div>Weapon<br>' + gunBtns + '</div>'
            + '<div>Weapon skin <span id="dw-wsk-cur" style="color:#9FB0B8;font-weight:500"></span><div id="dw-wsk-list" style="margin-top:4px">' + skinListHtml() + '</div></div>'
            + '<label>Angle <b id="dw-ang-v">0</b>&deg; (0 = down, 90 = left)<br><input id="dw-ang" type="range" min="0" max="359" value="0" style="width:100%"></label>'
            + box('auto', 'auto-rotate')
            + '<label>Zoom <b id="dw-zoom-v">3</b> px/unit<br><input id="dw-zoom" type="range" min="1" max="8" step="0.25" value="3" style="width:100%"></label>'
            + '<div>View<br><label style="margin-right:10px"><input type="radio" name="dw-v" value="one" checked> one</label>'
            + '<label style="margin-right:10px"><input type="radio" name="dw-v" value="all"> all 6</label>'
            + '<label><input type="radio" name="dw-v" value="skins"> all 24 skins</label></div>'
            + box('hitbox', 'hitbox (radius 30)') + box('muzzle', 'muzzle point') + box('hands', 'hand points')
            + box('frame', 'sprite frame (80 x 144)') + box('labels', 'name + HP bar')
            + '<div style="display:flex;gap:8px;align-items:center"><button id="dw-fire" style="padding:6px 14px;font-weight:800">Fire</button>'
            + '<label style="display:flex;gap:6px"><input type="checkbox" data-k="autoFire">continuous fire</label></div>'
            + '<div id="dw-read" style="font:500 12px/1.4 monospace;color:#C9D4DA;white-space:pre"></div>'
            + '<div style="border-top:1px solid #2A3A45;padding-top:8px"><b>Weapon statistics</b><br>'
            + '<div style="display:flex;gap:6px;margin-top:4px"><input id="dw-ws-nick" placeholder="nickname" style="flex:1;min-width:0;color:#0A1013;background:#F2EFE6;font:600 12px Sen,Arial">'
            + '<button id="dw-ws-load" style="padding:2px 8px">Load</button></div>'
            + '<div id="dw-ws" style="font:500 9.5px/1.45 monospace;color:#C9D4DA;white-space:pre;margin-top:6px;overflow-x:auto"></div>'
            + '<b style="display:block;margin-top:8px">Weapon skins</b>'
            + '<div id="dw-wskin" style="font:500 9.5px/1.45 monospace;color:#C9D4DA;white-space:pre;margin-top:4px;overflow-x:auto"></div>'
            + '<b style="display:block;margin-top:8px">Weapon skins in match</b>'
            + '<div id="dw-wskin-match" style="font:500 9.5px/1.45 monospace;color:#C9D4DA;white-space:pre;margin-top:4px;overflow-x:auto"></div></div>'
            + '<div style="font-weight:500;color:#9FB0B8">Left/right arrows: angle. Esc: close.</div>';
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        readout = panel.querySelector('#dw-read');

        panel.querySelector('#dw-skin').value = st.skin;
        panel.querySelector('#dw-skin').addEventListener('change', e => { st.skin = e.target.value; });
        panel.querySelectorAll('input[name="dw-w"]').forEach(r => r.addEventListener('change', e => {
            st.weapon = e.target.value;
            setWeaponSkin(st.weaponSkin && WSKINS[st.weaponSkin].weapon === st.weapon ? st.weaponSkin : null);
        }));
        panel.querySelectorAll('[data-wsk]').forEach(btn => btn.addEventListener('click', () => {
            if (btn.dataset.wsk) { setWeaponSkin(btn.dataset.wsk); return; }
            st.weapon = btn.dataset.wid; // fara skin: the gun as it is
            const r = overlay.querySelector('input[name="dw-w"][value="' + st.weapon + '"]'); if (r) r.checked = true;
            setWeaponSkin(null);
        }));
        setWeaponSkin(null);
        panel.querySelectorAll('input[name="dw-v"]').forEach(r => r.addEventListener('change', e => { st.view = e.target.value; }));
        const ang = panel.querySelector('#dw-ang');
        ang.addEventListener('input', () => { st.angle = +ang.value; });
        const zoom = panel.querySelector('#dw-zoom');
        zoom.addEventListener('input', () => { st.zoom = +zoom.value; panel.querySelector('#dw-zoom-v').textContent = st.zoom; });
        panel.querySelectorAll('input[type="checkbox"]').forEach(c => c.addEventListener('change', () => { st[c.dataset.k] = c.checked; }));
        panel.querySelector('#dw-close').addEventListener('click', close);
        panel.querySelector('#dw-fire').addEventListener('click', () => { st.fireReq = true; });
        const wsNick = panel.querySelector('#dw-ws-nick');
        wsNick.value = (typeof currentNickname === 'string' && currentNickname) || '';
        const loadNick = n => { loadWeaponStats(n); loadWeaponSkins(n); };
        panel.querySelector('#dw-ws-load').addEventListener('click', () => loadNick(wsNick.value.trim()));
        if (wsNick.value) loadNick(wsNick.value);
        showMatchWeaponSkins();
        document.addEventListener('keydown', onKey);
        raf = requestAnimationFrame(frame);
    }

    // totals per weapon of an account (server.js WEAPON STATS): one row per gun plus the fists
    async function loadWeaponStats(nick) {
        const box = overlay.querySelector('#dw-ws');
        if (!nick) { box.textContent = 'Enter a username'; return; }
        box.textContent = '...';
        try {
            const r = await fetch('/api/weapon-stats?nickname=' + encodeURIComponent(nick), { cache: 'no-store' }).then(x => x.json());
            if (!r.ok) { box.textContent = 'error'; return; }
            const pad = (v, n) => String(v).padStart(n);
            const row = c => c[0].padEnd(8) + pad(c[1], 4) + pad(c[2], 4) + pad(c[3], 7) + pad(c[4], 5) + pad(c[5], 5) + pad(c[6], 5);
            const rows = GUNS.concat(['fists']).map(id => {
                const e = r.weaponStats[id] || { kills: 0, zombieKills: 0, damage: 0, shots: 0, hits: 0 };
                const acc = e.shots ? Math.round(e.hits / e.shots * 100) + '%' : '-';
                return row([(WEAPON_ART.byId[id] && WEAPON_ART.byId[id].name) || id, e.kills, e.zombieKills, e.damage, e.shots, e.hits, acc]);
            });
            box.textContent = [row(['weapon', 'kills', 'zombies', 'damage', 'shots', 'hits', 'accuracy'])].concat(rows).join('\n');
        } catch (err) { box.textContent = 'error: ' + err.message; }
    }

    const wskinName = id => (WSKINS[id] ? WSKINS[id].name + ' (' + WSKINS[id].rarity + ')' : id);
    // an account's weapon skins (server.js WEAPON SKINS): per gun the equipped one and how many it owns
    async function loadWeaponSkins(nick) {
        const box = overlay.querySelector('#dw-wskin');
        if (!nick) { box.textContent = 'Enter a username'; return; }
        box.textContent = '...';
        try {
            await WSKINS_READY;
            const r = await fetch('/api/weapon-skins?nickname=' + encodeURIComponent(nick), { cache: 'no-store' }).then(x => x.json());
            if (!r.ok) { box.textContent = 'error'; return; }
            const owned = new Set(r.owned);
            const rows = GUNS.map(id => {
                const all = Object.values(WSKINS).filter(s => s.weapon === id);
                const eq = r.equipped[id];
                return WEAPON_ART.byId[id].name.padEnd(9) + (eq ? wskinName(eq) : '-').padEnd(22)
                    + all.filter(s => owned.has(s.id)).length + '/' + all.length;
            });
            box.textContent = ['weapon'.padEnd(9) + 'equipped'.padEnd(22) + 'owned'].concat(rows).join('\n')
                + (r.owned.length ? '\nowned: ' + r.owned.map(id => (WSKINS[id] ? WSKINS[id].name : id)).join(', ') : '')
                + (r.unlockAll ? '\n(UNLOCK_ALL: all are unlocked)' : '');
        } catch (err) { box.textContent = 'error: ' + err.message; }
    }
    // what the server sent for each player of the current / last match (player-image, playersMeta)
    function showMatchWeaponSkins() {
        const box = overlay && overlay.querySelector('#dw-wskin-match');
        if (!box) return;
        const rows = [..._playerWeaponSkins].map(([id, skinId]) => {
            const me = !!window._gameSocket && window._gameSocket.id === id;
            const name = (window.__arPlayerName && window.__arPlayerName(id)) || (me && currentNickname) || id.slice(0, 6);
            const wid = _playerWeapons.get(id);
            return String(name).padEnd(12) + ((WEAPON_ART.byId[wid] && WEAPON_ART.byId[wid].name) || wid || '?').padEnd(9)
                + (skinId === 'default' ? '-' : wskinName(skinId));
        });
        box.textContent = rows.length ? rows.join('\n') : 'no matches yet';
    }

    // the weapon skin list: per gun "fara" and its skins (weapon-skins.json order)
    function skinListHtml() {
        const btn = (wid, id, label, title) => '<button data-wid="' + wid + '" data-wsk="' + id + '" title="' + title + '" style="margin:0 4px 4px 0;padding:2px 6px;font:600 11px Sen,Arial;border-radius:6px;border:2px solid #0A1013;background:#F2EFE6;color:#0A1013">' + label + '</button>';
        return GUNS.map(w => '<div style="margin-bottom:2px"><span style="display:inline-block;width:64px;color:#9FB0B8">' + WEAPON_ART.byId[w].name + '</span>'
            + btn(w, '', 'No skin', 'No skin')
            + Object.values(WSKINS).filter(s => s.weapon === w).map(s => btn(w, s.id, s.name, s.id + ' (' + s.rarity + ')')).join('') + '</div>').join('');
    }
    // a click on a skin: its gun in hand, the view on one player
    function setWeaponSkin(id) {
        st.weaponSkin = id && WSKINS[id] ? id : null;
        if (st.weaponSkin) {
            st.weapon = WSKINS[id].weapon;
            const r = overlay.querySelector('input[name="dw-w"][value="' + st.weapon + '"]'); if (r) r.checked = true;
            st.view = 'one';
            const v = overlay.querySelector('input[name="dw-v"][value="one"]'); if (v) v.checked = true;
        }
        overlay.querySelectorAll('[data-wsk]').forEach(b => {
            const on = b.dataset.wsk ? b.dataset.wsk === st.weaponSkin : !st.weaponSkin && b.dataset.wid === st.weapon;
            b.style.background = on ? '#46D17C' : '#F2EFE6';
        });
        overlay.querySelector('#dw-wsk-cur').textContent = st.weaponSkin ? '(' + WSKINS[st.weaponSkin].name + ')' : '';
    }
    // the figures to draw: [{ wid, skin, x, y, label }]
    function figures() {
        if (st.view === 'all') return GUNS.map((wid, i) => ({ wid, skin: null, x: WORLD_C + ((i % 3) - 1) * GRID_DX, y: WORLD_C + (Math.floor(i / 3) - 0.5) * GRID_DY, label: WEAPON_ART.byId[wid].name.toUpperCase() }));
        if (st.view === 'skins') {
            const out = [];
            GUNS.forEach((wid, col) => Object.values(WSKINS).filter(s => s.weapon === wid).forEach((s, row) => out.push({
                wid, skin: s.id, x: WORLD_C + (col - 2.5) * GRID_DX, y: WORLD_C + (row - 1.5) * GRID_DY, label: s.name.toUpperCase() })));
            return out;
        }
        if (st.weapon === 'none') return [{ wid: null, skin: null, x: WORLD_C, y: WORLD_C }];
        const skin = st.weaponSkin && WSKINS[st.weaponSkin].weapon === st.weapon ? st.weaponSkin : null;
        return [{ wid: st.weapon, skin, x: WORLD_C, y: WORLD_C }];
    }

    function onKey(e) {
        if (!overlay) return;
        if (e.key === 'Escape') close();
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            st.angle = (st.angle + (e.key === 'ArrowLeft' ? -5 : 5) + 360) % 360;
            e.preventDefault();
        }
    }

    function close() {
        cancelAnimationFrame(raf);
        document.removeEventListener('keydown', onKey);
        if (overlay) overlay.remove();
        overlay = null;
    }

    function cross(x, y, r, color) {
        ctx.beginPath();
        ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
        ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
        ctx.strokeStyle = color; ctx.stroke();
    }

    function drawOverlays(wm, x, y, angle, gun, px) {
        const thin = 1.5 / px; // ~1.5 device px whatever the zoom
        _setRotated(ctx, wm, x, y, Math.cos(angle), Math.sin(angle));
        ctx.lineWidth = thin;
        if (st.frame) {
            ctx.setLineDash([6 / px, 4 / px]);
            ctx.strokeStyle = '#FF4FD8';
            ctx.strokeRect(WEAPON_ART.tl[0], WEAPON_ART.tl[1], WEAPON_ART.size[0], WEAPON_ART.size[1]);
            ctx.setLineDash([]);
        }
        if (st.hands) {
            for (let i = 0; i < 2; i++) {
                const hx = gun ? gun.hands[i][0] : _HAND.cx[i], hy = gun ? gun.hands[i][1] : _HAND.cy[i];
                cross(hx, hy, 5, i === 0 ? '#FFE14D' : '#4DE1FF');
            }
        }
        if (st.muzzle && gun) {
            ctx.setLineDash([3 / px, 3 / px]);
            ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(gun.muzzle[0], gun.muzzle[1]);
            ctx.strokeStyle = 'rgba(255,80,80,.8)'; ctx.stroke();
            ctx.setLineDash([]);
            ctx.beginPath(); ctx.arc(gun.muzzle[0], gun.muzzle[1], 3, 0, Math.PI * 2);
            ctx.fillStyle = '#FF3B3B'; ctx.fill();
        }
        ctx.setTransform(wm);
        if (st.hitbox) {
            ctx.lineWidth = thin;
            ctx.setLineDash([5 / px, 4 / px]);
            ctx.beginPath(); ctx.arc(x, y, 30, 0, Math.PI * 2);
            ctx.strokeStyle = '#38F2FF'; ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // name + HP bar laid out like your own player in the match (ammo bar left out)
    function drawLabels(x, y, px) {
        const ringR = _playerRingR(), barH = 22, barW = 108;
        const barY = y - ringR - barH - (4 + 6);
        _drawHpBar(ctx, x - barW / 2, barY, barW, barH, 0.8, 2.5);
        _drawLabel(ctx, 'Player', 14, '#66E287', INK, 4, 'alphabetic', x, barY - 12, px);
    }

    let _lastMatchSkins = 0;
    function frame(now) {
        if (!overlay) return;
        raf = requestAnimationFrame(frame);
        if (now - _lastMatchSkins > 1000) { _lastMatchSkins = now; showMatchWeaponSkins(); }
        const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
        last = now;
        if (st.auto) st.angle = (st.angle + dt * 45) % 360;
        const angEl = overlay.querySelector('#dw-ang');
        if (st.auto && angEl) angEl.value = Math.round(st.angle);
        const angV = overlay.querySelector('#dw-ang-v');
        if (angV) angV.textContent = Math.round(st.angle);

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const cw = Math.floor(canvas.clientWidth * dpr), ch = Math.floor(canvas.clientHeight * dpr);
        if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
        const grid = st.view !== 'one';
        const cssW = cw / dpr, cssH = ch / dpr;
        // the grids sit in the space right of the panel
        const panelW = grid ? Math.min(280, cssW * 0.4) : 0, freeW = cssW - panelW;
        const zoom = st.view === 'all' ? Math.min(freeW / (3 * GRID_DX), cssH / (2 * GRID_DY + 60))
            : st.view === 'skins' ? Math.min(freeW / (6 * GRID_DX), cssH / (4 * GRID_DY + 60)) : st.zoom;
        const px = zoom * dpr, cx = (panelW + freeW / 2) * dpr; // device x of the view centre
        ARArena.beginFrame(px, now);
        ctx.setTransform(px, 0, 0, px, cx - WORLD_C * px, ch / 2 - WORLD_C * px);
        const wm = ctx.getTransform();
        const l = WORLD_C - cx / px, t = WORLD_C - ch / 2 / px, r = WORLD_C + (cw - cx) / px, b = WORLD_C + ch / 2 / px;
        ARArena.drawGround(ctx, l, t, r, b, 2600, 2600);
        const angNow = st.angle * Math.PI / 180;
        const figs = figures(), guns = figs.filter(f => f.wid);
        // trigger: the button, or the gun's cadence while "continuous fire" is on
        const autoCd = guns.length ? Math.max(...guns.map(f => pullCycleMs(_WEAPON_DATA[f.wid]))) : 0;
        if (st.fireReq || (st.autoFire && now >= nextAuto && guns.length)) {
            guns.forEach(f => pull(f, angNow, now));
            st.fireReq = false;
            nextAuto = now + autoCd;
        }
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= now) { shoot(pending[i], now); pending.splice(i, 1); }
        // bullets with their trails, under the players as in the match
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bl = bullets[i], age = (now - bl.t0) / 1000;
            if (age > bl.life) { bullets.splice(i, 1); continue; }
            const bx = bl.x + bl.vx * age, by = bl.y + bl.vy * age, trail = Math.min(age * 480, 110);
            _setRotated(ctx, wm, bx, by, bl.vx, bl.vy);
            if (trail > 4) ctx.drawImage(_trailSpriteFor(bl.wid, bl.skin), -trail, -3, trail, 6);
            const bs = _bulletSprite(bl.wid, px, bl.skin);
            if (bs) ctx.drawImage(bs.c, -bs.box, -bs.box, bs.box * 2, bs.box * 2);
            ctx.setTransform(wm);
        }

        const angle = st.angle * Math.PI / 180; // player.angle: 0 = aim down
        const entry = entryFor(st.skin);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        figs.forEach(f => {
            const { wid, skin, x, y } = f;
            _drawPlayerFigure(ctx, wm, x, y, angle, entry, wid, px, '#46D17C', 'rgba(70,209,124,0.14)', wid ? fxFor(figKey(f)) : null, now, skin);
            drawOverlays(wm, x, y, angle, wid ? _gunLook(wid, skin) : null, px);
            if (st.labels) drawLabels(x, y, px);
            if (grid) _drawLabel(ctx, f.label, 16, '#FFFFFF', INK, 4, 'alphabetic', x, y + 150, px);
        });
        ctx.imageSmoothingQuality = 'low';
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const one = !grid && figs[0].wid ? figs[0] : null;
        const g = one ? _gunLook(one.wid, one.skin) : null, base = one ? WEAPON_ART.byId[one.wid] : null;
        const sk = one && one.skin ? WEAPON_ART.skins[one.skin] : null;
        const skinState = !one || !one.skin ? '' : !sk ? 'skin: no data in weapon-skin-sprites.json, using base weapon\n'
            : sk.failed ? 'skin: sprite missing, using base weapon\n' : g === sk ? 'skin: ' + WSKINS[one.skin].name + ' (' + one.skin + ')\n' : 'skin: loading...\n';
        readout.textContent = 'visual scale ' + PLAYER_VISUAL_SCALE + '\n' + skinState
            + (g ? 'hands   ' + JSON.stringify(g.hands0) + '\nmuzzle  ' + JSON.stringify(g.muzzle0)
                + (g !== base ? '  (weapon: ' + JSON.stringify(base.muzzle0) + ')' : '')
                + '\n(x scale: muzzle at ' + (g.muzzle0[1] * PLAYER_VISUAL_SCALE).toFixed(1) + ' units)'
                + (g !== base ? '\nbullet still starts at ' + (base.muzzleDist).toFixed(1) + ' (base weapon)' : '')
                : (st.view === 'all' ? 'all weapons' : st.view === 'skins' ? 'all skins' : 'no weapon: hands by body'));
    }

    Promise.all([SKINS_READY, WEAPONS_ART_READY, WSKINS_READY, WEAPON_SKIN_ART_READY]).then(() => {
        GUNS = WEAPONS.map(w => w.id);
        st.weapon = DEFAULT_WEAPON;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
        else build();
    });
})();
