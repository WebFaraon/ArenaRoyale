// ============================================
// ARENA ROYALE - dev-weapons.js
// Developer view: a player holding each gun, drawn by the same _drawPlayerFigure the match uses.
// Loaded by game.js only when the page is opened with ?dev=weapons; nothing here runs otherwise.
// ============================================
(function () {
    'use strict';
    const GUNS = ['pistol', 'smg', 'assault', 'sniper', 'shotgun', 'burst'];
    const WORLD_C = 1300;          // the view is centred in the middle of the arena, on the turf
    const GRID_DX = 300, GRID_DY = 330;

    const st = {
        skin: 'rookie', weapon: 'pistol', angle: 0, auto: false, zoom: 3, view: 'one',
        hitbox: true, muzzle: true, hands: true, frame: false, labels: false,
    };
    const entries = {};
    // shots: per figure (gun id) its effects, pending shots (burst) and live bullets
    const fxBy = {}, pending = [], bullets = [];
    let nextAuto = 0;
    const fxFor = id => fxBy[id] || (fxBy[id] = _newShotFx());
    // one trigger pull of gun `wid` at (x, y), aiming at `angle` (0 = down); bursts fire 3 times
    function pull(wid, x, y, angle, now) {
        const w = _WEAPON_DATA[wid] || _WEAPON_DATA.pistol;
        for (let i = 0; i < (w.burst || 1); i++) pending.push({ at: now + i * (w.burstDelay || 0.08) * 1000, wid, x, y, angle });
    }
    function shoot(s, now) {
        const w = _WEAPON_DATA[s.wid] || _WEAPON_DATA.pistol, gun = WEAPON_ART.byId[s.wid];
        const dx = -Math.sin(s.angle), dy = Math.cos(s.angle);
        const n = w.pellets || 1, spread = w.spread || 0;
        for (let i = 0; i < n; i++) {
            const a = n === 1 ? 0 : -spread / 2 + i * spread / (n - 1), c = Math.cos(a), sn = Math.sin(a);
            bullets.push({ wid: s.wid, x: s.x + dx * gun.muzzleDist, y: s.y + dy * gun.muzzleDist,
                vx: (dx * c - dy * sn) * w.bulletSpeed, vy: (dx * sn + dy * c) * w.bulletSpeed, t0: now, life: gun.bulletLife });
        }
        _shotKick(fxFor(s.wid), now);
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
            + (id === st.weapon ? ' checked' : '') + '>' + (id === 'none' ? 'fara arma' : WEAPON_ART.byId[id].name) + '</label>').join('');
        const box = (k, label) => '<label style="display:flex;gap:6px"><input type="checkbox" data-k="' + k + '"' + (st[k] ? ' checked' : '') + '>' + label + '</label>';
        panel.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:15px">ARME (dev)</b>'
            + '<button id="dw-close" style="padding:2px 8px">X</button></div>'
            + '<label>Skin<br><select id="dw-skin" style="width:100%;color:#0A1013;background:#F2EFE6;opacity:1;font:600 13px Sen,Arial">' + skinOpts + '</select></label>'
            + '<div>Arma<br>' + gunBtns + '</div>'
            + '<label>Unghi <b id="dw-ang-v">0</b>&deg; (0 = jos, 90 = stanga)<br><input id="dw-ang" type="range" min="0" max="359" value="0" style="width:100%"></label>'
            + box('auto', 'rotire automata')
            + '<label>Zoom <b id="dw-zoom-v">3</b> px/unitate<br><input id="dw-zoom" type="range" min="1" max="8" step="0.25" value="3" style="width:100%"></label>'
            + '<div>Vedere<br><label style="margin-right:10px"><input type="radio" name="dw-v" value="one" checked> una</label>'
            + '<label><input type="radio" name="dw-v" value="all"> toate 6</label></div>'
            + box('hitbox', 'hitbox (raza 30)') + box('muzzle', 'punct muzzle') + box('hands', 'punctele mainilor')
            + box('frame', 'cadrul sprite-ului (80 x 144)') + box('labels', 'nume + bara HP')
            + '<div style="display:flex;gap:8px;align-items:center"><button id="dw-fire" style="padding:6px 14px;font-weight:800">Trage</button>'
            + '<label style="display:flex;gap:6px"><input type="checkbox" data-k="autoFire">trage continuu</label></div>'
            + '<div id="dw-read" style="font:500 12px/1.4 monospace;color:#C9D4DA;white-space:pre"></div>'
            + '<div style="font-weight:500;color:#9FB0B8">Sageti stanga/dreapta: unghi. Esc: inchide.</div>';
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        readout = panel.querySelector('#dw-read');

        panel.querySelector('#dw-skin').value = st.skin;
        panel.querySelector('#dw-skin').addEventListener('change', e => { st.skin = e.target.value; });
        panel.querySelectorAll('input[name="dw-w"]').forEach(r => r.addEventListener('change', e => { st.weapon = e.target.value; }));
        panel.querySelectorAll('input[name="dw-v"]').forEach(r => r.addEventListener('change', e => { st.view = e.target.value; }));
        const ang = panel.querySelector('#dw-ang');
        ang.addEventListener('input', () => { st.angle = +ang.value; });
        const zoom = panel.querySelector('#dw-zoom');
        zoom.addEventListener('input', () => { st.zoom = +zoom.value; panel.querySelector('#dw-zoom-v').textContent = st.zoom; });
        panel.querySelectorAll('input[type="checkbox"]').forEach(c => c.addEventListener('change', () => { st[c.dataset.k] = c.checked; }));
        panel.querySelector('#dw-close').addEventListener('click', close);
        panel.querySelector('#dw-fire').addEventListener('click', () => { st.fireReq = true; });
        document.addEventListener('keydown', onKey);
        raf = requestAnimationFrame(frame);
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
        _drawLabel(ctx, 'Jucator', 14, '#66E287', INK, 4, 'alphabetic', x, barY - 12, px);
    }

    function frame(now) {
        if (!overlay) return;
        raf = requestAnimationFrame(frame);
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
        const grid = st.view === 'all';
        const cssW = cw / dpr, cssH = ch / dpr;
        const zoom = grid ? Math.min(cssW / (3 * GRID_DX), cssH / (2 * GRID_DY + 60)) : st.zoom;
        const px = zoom * dpr;
        ARArena.beginFrame(px, now);
        ctx.setTransform(px, 0, 0, px, cw / 2 - WORLD_C * px, ch / 2 - WORLD_C * px);
        const wm = ctx.getTransform();
        const l = WORLD_C - cw / 2 / px, t = WORLD_C - ch / 2 / px, r = WORLD_C + cw / 2 / px, b = WORLD_C + ch / 2 / px;
        ARArena.drawGround(ctx, l, t, r, b, 2600, 2600);
        const where = (i) => [grid ? WORLD_C + ((i % 3) - 1) * GRID_DX : WORLD_C, grid ? WORLD_C + (Math.floor(i / 3) - 0.5) * GRID_DY : WORLD_C];
        const angNow = st.angle * Math.PI / 180;
        const guns = grid ? GUNS : (st.weapon === 'none' ? [] : [st.weapon]);
        // trigger: the button, or the gun's cadence while "trage continuu" is on
        const autoCd = guns.length ? Math.max(...guns.map(g => { const w = _WEAPON_DATA[g]; return (w.shootCd + ((w.burst || 1) - 1) * (w.burstDelay || 0.08)) * 1000; })) : 0;
        if (st.fireReq || (st.autoFire && now >= nextAuto && guns.length)) {
            guns.forEach((g, i) => { const p = where(i); pull(g, p[0], p[1], angNow, now); });
            st.fireReq = false;
            nextAuto = now + (grid ? autoCd : (_WEAPON_DATA[guns[0]] ? (_WEAPON_DATA[guns[0]].shootCd + ((_WEAPON_DATA[guns[0]].burst || 1) - 1) * (_WEAPON_DATA[guns[0]].burstDelay || 0.08)) * 1000 : 500));
        }
        for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= now) { shoot(pending[i], now); pending.splice(i, 1); }
        // bullets with their trails, under the players as in the match
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bl = bullets[i], age = (now - bl.t0) / 1000;
            if (age > bl.life) { bullets.splice(i, 1); continue; }
            const bx = bl.x + bl.vx * age, by = bl.y + bl.vy * age, trail = Math.min(age * 480, 110);
            _setRotated(ctx, wm, bx, by, bl.vx, bl.vy);
            if (trail > 4) ctx.drawImage(_trailSpriteFor(bl.wid), -trail, -3, trail, 6);
            const bs = _bulletSprite(bl.wid, px);
            if (bs) ctx.drawImage(bs.c, -bs.box, -bs.box, bs.box * 2, bs.box * 2);
            ctx.setTransform(wm);
        }

        const angle = st.angle * Math.PI / 180; // player.angle: 0 = aim down
        const entry = entryFor(st.skin);
        const items = grid ? GUNS : [st.weapon === 'none' ? null : st.weapon];
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        items.forEach((wid, i) => {
            const x = grid ? WORLD_C + ((i % 3) - 1) * GRID_DX : WORLD_C;
            const y = grid ? WORLD_C + (Math.floor(i / 3) - 0.5) * GRID_DY : WORLD_C;
            _drawPlayerFigure(ctx, wm, x, y, angle, entry, wid, px, '#46D17C', 'rgba(70,209,124,0.14)', wid ? fxFor(wid) : null, now);
            drawOverlays(wm, x, y, angle, wid ? WEAPON_ART.byId[wid] : null, px);
            if (st.labels) drawLabels(x, y, px);
            if (grid) _drawLabel(ctx, WEAPON_ART.byId[wid].name.toUpperCase(), 16, '#FFFFFF', INK, 4, 'alphabetic', x, y + 150, px);
        });
        ctx.imageSmoothingQuality = 'low';
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        const g = !grid && st.weapon !== 'none' ? WEAPON_ART.byId[st.weapon] : null;
        readout.textContent = 'scara vizuala ' + PLAYER_VISUAL_SCALE + '\n'
            + (g ? 'maini   ' + JSON.stringify(g.hands0) + '\nmuzzle  ' + JSON.stringify(g.muzzle0)
                + '\n(x scara: muzzle la ' + (g.muzzle0[1] * PLAYER_VISUAL_SCALE).toFixed(1) + ' unitati)' : (grid ? 'toate armele' : 'fara arma: maini sub corp'));
    }

    Promise.all([SKINS_READY, WEAPONS_ART_READY]).then(() => {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
        else build();
    });
})();
