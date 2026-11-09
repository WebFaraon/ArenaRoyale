// MISSIONS SCREEN: the daily, the weekly and the season missions in one screen of their own (#screen-missions, like the Battle Pass screen). It runs after game.js and lobby-ui.js
// and uses their globals (currentProfile, currentNickname, sessionToken, showToast, spawnCoinFly, selectGamemode, ico, pic, arAsset, ARIcons, ARChests, ARBattlePass, LobbyUI).
// Nothing is decided here: the lists, the progress and the prizes come from the server (missions.js, /api/missions/*), every claim asks it, and the screen changes after its answer.
//   DAILY   six missions of the day (they reset at midnight UTC), each pays coins, gems and Battle Pass XP
//   WEEKLY  six missions of the week (Monday UTC), each pays coins, gems and XP; finishing 2, 4 and 6 of them opens a prize (the last two are chests)
//   SEASON  twelve missions in four phases (halves, extra time, penalties); a phase opens when the one before it is done and pays a prize (chests, gems, XP)
'use strict';
const MissionsUI = (function () {
    const BP = window.ARBattlePass, C = window.ARChests;
    const M = { daily: [], ex: null, tab: 'daily', skew: 0, busy: false, tick: 0, fetched: false };
    const $ = id => document.getElementById(id);
    const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const num = n => Number(n || 0).toLocaleString('en-US');
    const now = () => Date.now() + M.skew;
    const juice = () => !!(window.ARJuice && ARJuice.on());
    const sfx = name => { try { if (window.ARSound) ARSound.play(name); } catch (e) { /* no sound */ } };
    const chestImg = id => arAsset('/images/chests/' + id + '.svg');
    const CHEST_COL = { wooden: '#D99A48', silver: '#8FC8F2', golden: '#FFC72E', diamond: '#5CC0F2', mythical: '#B66BFF' };
    const TABS = ['daily', 'week', 'season'];

    async function post(url, body) {
        const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ nickname: currentNickname, token: sessionToken }, body || {})) });
        return r.json();
    }

    // ---------- small pieces ----------
    const fmt = (v, goal) => goal >= 1000 && v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.0', '') + 'k' : num(v);
    function chips(r) {
        return (r.coins ? `<span class="ms-chip ms-c-coin">+${num(r.coins)}${pic('monede')}</span>` : '')
            + (r.diamonds ? `<span class="ms-chip ms-c-gem">+${r.diamonds}${pic('diamante')}</span>` : '')
            + (r.xp ? `<span class="ms-chip ms-c-xp" title="Battle Pass XP">+${num(r.xp)}<b>XP</b>${pic('battlepass')}</span>` : '');
    }
    function prizeText(r) {
        const bits = [];
        if (r.coins) bits.push(`+${num(r.coins)} coins`);
        if (r.diamonds) bits.push(`+${r.diamonds} gems`);
        if (r.chest) bits.push(`${C.BY_ID[r.chest].name} chest`);
        return bits.join(' · ');
    }
    function prizeIcon(r) {
        if (r.chest) return `<img class="ms-pz-chest" src="${chestImg(r.chest)}" alt="" draggable="false">`;
        return r.diamonds && !r.coins ? pic('diamante') : pic('monede');
    }
    const modeText = m => m.sub || (m.tag === 'br' ? 'Battle Royale' : m.tag === 'pve' ? 'Survival PvE' : m.weapon ? (typeof _WEAPON_DATA !== 'undefined' && _WEAPON_DATA[m.weapon] ? _WEAPON_DATA[m.weapon].name : m.weapon) : 'Any mode');
    function tile(m) {
        const kind = m.weapon ? 'wpn' : m.tag === 'pve' ? 'pve' : m.tag === 'br' ? 'br' : 'gen';
        const done = m.prog >= m.goal;
        const art = done ? ico('check') : m.weapon && window.ARIcons ? ARIcons.weaponHtml(m.weapon, true) : ico(kind === 'pve' ? 'biohazard' : kind === 'br' ? 'swords' : 'target');
        return `<span class="ms-tile ms-t-${kind}${done ? ' is-done' : ''}">${art}</span>`;
    }
    const segs = (list, doneFn) => `<span class="ms-segs">${list.map(m => `<i class="${doneFn(m) ? 'on' : ''}"></i>`).join('')}</span>`;
    function cd(kind, endsAt) { return `<span class="ms-timer" data-cd="${kind}" data-end="${endsAt}"><svg class="ic" aria-hidden="true"><use href="#clock"/></svg><span class="ms-timer-t">${cdText(kind, endsAt)}</span></span>`; }
    function cdText(kind, end) {
        const ms = Math.max(0, end - now()), s = Math.floor(ms / 1000), p = v => String(v).padStart(2, '0');
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
        if (kind === 'season') return !end ? '' : ms <= 0 ? 'Season ended' : d >= 1 ? `Ends in ${d} day${d === 1 ? '' : 's'}` : `Ends in ${h} h`;
        if (kind === 'week') return (d ? d + 'd ' : '') + `${p(h)}:${p(m)}:${p(x)}`;
        return `${p(h + d * 24)}:${p(m)}:${p(x)}`;
    }

    // ---------- the missions (a row) ----------
    function row(m, kind) {
        const done = m.prog >= m.goal, pct = Math.min(100, Math.round(m.prog / m.goal * 100));
        const act = m.claimed ? `<span class="ms-claimed">${ico('check')}CLAIMED</span>`
            : done ? `<button type="button" class="ms-btn ms-claim" data-act="claim">CLAIM</button>`
            : `<button type="button" class="ms-btn ms-play" data-act="play" data-tag="${m.tag || ''}">PLAY</button>`;
        return `<div class="ms-row${done && !m.claimed ? ' is-can' : ''}${m.claimed ? ' is-claimed' : ''}" data-kind="${kind}" data-id="${esc(m.id)}">${tile(m)}
            <div class="ms-info"><b class="ms-title">${esc(m.title)}</b><span class="ms-sub">${esc(modeText(m))}</span><span class="ms-bar"><i style="width:${pct}%"></i></span></div>
            <span class="ms-count">${fmt(Math.min(m.prog, m.goal), m.goal)}<i> / ${fmt(m.goal, m.goal)}</i></span>
            <span class="ms-rw">${chips({ coins: m.coins, diamonds: m.diamonds, xp: m.xp })}</span><span class="ms-act">${act}</span></div>`;
    }

    // ---------- DAILY ----------
    function paneDaily() {
        const list = M.daily || [], done = list.filter(m => m.prog >= m.goal).length;
        const ex = M.ex, s = ex && ex.season;
        const side = s ? `<aside class="ms-side"><div class="ms-card ms-teaser" style="--ac:var(--c-gold)">
                <span class="ms-kick">${esc(BP.SEASON.kicker)}</span><b class="ms-teaser-name">${esc(s.name)}</b>
                <div class="ms-teaser-row"><span>Season missions</span><b>${s.done} / ${s.total}</b></div>
                <span class="ms-bar"><i style="width:${Math.round(s.done / s.total * 100)}%"></i></span>
                <div class="ms-final"><img src="${chestImg(s.phases[s.phases.length - 1].reward.chest)}" alt="" draggable="false"><div><small>FINAL PRIZE</small><b>${esc(prizeText(s.phases[s.phases.length - 1].reward))}</b></div></div>
                <button type="button" class="ms-btn ms-go" data-act="tab" data-tab="season">SEASON MISSIONS</button></div>
            <div class="ms-card ms-tip"><b>${ico('zap')} Battle Pass XP</b><span>Every mission you claim, daily, weekly or from the season, adds XP to your Battle Pass.</span></div></aside>` : '';
        return `<div class="ms-cols"><div class="ms-main">
            <div class="ms-hdr" style="--ac:var(--c-orange)"><span class="ms-hdr-ic">${pic('misiuni')}</span>
                <div class="ms-hdr-t"><b>Daily missions</b><span>${done} of ${list.length} finished today</span></div>${segs(list, m => m.prog >= m.goal)}
                <span class="ms-hdr-n">${done}<i> / ${list.length}</i></span><span class="ms-hdr-r"><small>RESETS IN</small>${M.ex ? cd('day', M.ex.dailyEndsAt) : ''}</span></div>
            <div class="ms-list">${list.map(m => row(m, 'daily')).join('')}</div></div>${side}</div>`;
    }

    // ---------- WEEKLY ----------
    function paneWeek() {
        const w = M.ex && M.ex.week;
        if (!w) return loading();
        const rewards = w.rewards.map((r, i) => {
            const ready = !r.claimed && w.done >= r.need;
            const st = r.claimed ? `<span class="ms-claimed">${ico('check')}CLAIMED</span>` : ready ? `<button type="button" class="ms-btn ms-claim" data-act="reward" data-kind="week" data-i="${i}">CLAIM</button>` : `<span class="ms-lock">${ico('lock')}${r.need - w.done} more</span>`;
            return `<div class="ms-prize${ready ? ' is-can' : ''}${r.claimed ? ' is-claimed' : ''}${r.chest === 'golden' ? ' is-big' : ''}" style="--rc:${r.chest ? CHEST_COL[r.chest] : 'var(--c-gold)'}"><span class="ms-pz-need"><b>${r.need}</b> MISSIONS</span>
                <span class="ms-pz-ic">${prizeIcon(r)}</span><b class="ms-pz-txt">${esc(prizeText(r))}</b><span class="ms-pz-xp">+${num(r.xp)} XP</span><span class="ms-pz-st">${st}</span></div>`;
        }).join('');
        return `<div class="ms-wk">
            <div class="ms-hdr" style="--ac:var(--c-sky)"><span class="ms-hdr-ic">${pic('misiuni')}</span>
                <div class="ms-hdr-t"><b>Weekly progress</b><span>Finish missions to open the prizes below</span></div>${segs(w.list, m => m.prog >= m.goal)}
                <span class="ms-hdr-n">${w.done}<i> / ${w.list.length}</i></span><span class="ms-hdr-r"><small>RESETS IN</small>${cd('week', w.endsAt)}</span></div>
            <div class="ms-list ms-list-2">${w.list.map(m => row(m, 'week')).join('')}</div>
            <div class="ms-prizes-h"><b>WEEKLY PRIZES</b><span>${esc('Chests are only given when you have a free chest slot')}</span></div>
            <div class="ms-prizes">${rewards}</div></div>`;
    }

    // ---------- SEASON ----------
    function paneSeason() {
        const s = M.ex && M.ex.season;
        if (!s) return loading();
        const fin = s.phases[s.phases.length - 1];
        const active = s.phases.findIndex((p, i) => p.unlocked && !p.claimed && !(p.missions.every(m => m.prog >= m.goal) && i < s.phases.length - 1 && s.phases[i + 1].unlocked));
        const cards = s.phases.map((p, i) => {
            const all = p.missions.every(m => m.prog >= m.goal), ready = p.unlocked && all && !p.claimed;
            const tag = !p.unlocked ? `<span class="ms-ph-tag is-lock">${ico('lock')}</span>` : p.claimed ? `<span class="ms-ph-tag is-done">${ico('check')}DONE</span>` : i === active ? `<span class="ms-ph-tag is-on">ACTIVE</span>` : '';
            const st = p.claimed ? `<span class="ms-claimed">${ico('check')}CLAIMED</span>` : ready ? `<button type="button" class="ms-btn ms-claim" data-act="reward" data-kind="season" data-i="${i}">CLAIM</button>` : `<span class="ms-lock">${ico(p.unlocked ? 'target' : 'lock')}${p.unlocked ? 'Finish the 3 missions' : 'Locked'}</span>`;
            return `<div class="ms-phase${p.unlocked ? '' : ' is-locked'}${i === active ? ' is-active' : ''}${p.final ? ' is-final' : ''}${ready ? ' is-can' : ''}" style="--rc:${CHEST_COL[p.reward.chest] || '#FFC72E'}">
                <div class="ms-ph-h"><b>${esc(p.name)}</b>${tag}</div>
                ${p.missions.map(m => { const d = m.prog >= m.goal; return `<div class="ms-sm${d ? ' is-done' : ''}"><span class="ms-sm-t">${d ? ico('check') : ''}${esc(m.title)}</span><span class="ms-bar"><i style="width:${Math.round(Math.min(m.prog, m.goal) / m.goal * 100)}%"></i></span><span class="ms-sm-n">${fmt(Math.min(m.prog, m.goal), m.goal)} / ${fmt(m.goal, m.goal)}</span></div>`; }).join('')}
                <div class="ms-ph-pz"><span class="ms-ph-pic">${prizeIcon(p.reward)}</span><div><small>${p.final ? 'FINAL PRIZE' : 'PRIZE'}</small><b>${esc(prizeText(p.reward))}</b><em>+${num(p.reward.xp)} XP</em></div></div>
                <div class="ms-ph-st">${st}</div></div>`;
        }).join('');
        return `<div class="ms-ss">
            <div class="ms-hdr ms-hdr-season" style="--ac:var(--c-gold)"><span class="ms-ball"><svg class="ic" aria-hidden="true"><use href="#ball"/></svg></span>
                <div class="ms-hdr-t"><span class="ms-kick">${esc(BP.SEASON.kicker)}</span><b>${esc(s.name)}</b>${cd('season', s.endsAt)}</div>
                <div class="ms-ss-mid"><span class="ms-ss-l">Season missions finished</span><div class="ms-ss-segs">${s.phases.map(p => `<span class="ms-ss-seg"><span class="ms-bar"><i style="width:${Math.round(p.missions.filter(m => m.prog >= m.goal).length / 3 * 100)}%"></i></span><small>${esc(p.name)}</small></span>`).join('')}</div></div>
                <span class="ms-hdr-n">${s.done}<i> / ${s.total}</i></span>
                <div class="ms-fin-card"><img src="${chestImg(fin.reward.chest)}" alt="" draggable="false"><div><small>FINAL PRIZE</small><b>${esc(prizeText(fin.reward))}</b></div></div></div>
            <div class="ms-phases">${cards}</div></div>`;
    }
    const loading = () => `<div class="ms-loading">Loading...</div>`;

    // ---------- the screen ----------
    function claimable() {
        const ex = M.ex;
        return {
            daily: (M.daily || []).some(m => m.prog >= m.goal && !m.claimed),
            week: !!ex && (ex.week.list.some(m => m.prog >= m.goal && !m.claimed) || ex.week.rewards.some(r => !r.claimed && ex.week.done >= r.need)),
            season: !!ex && ex.season.phases.some(p => p.unlocked && !p.claimed && p.missions.every(m => m.prog >= m.goal)),
        };
    }
    function badges() {
        const c = claimable();
        for (const t of TABS) { const d = $('ms-dot-' + t); if (d) d.hidden = !c[t]; }
        const nb = $('missions-nav-badge'); if (nb) { const any = c.daily || c.week || c.season; nb.hidden = !any; nb.style.display = any ? '' : 'none'; }
    }
    function render() {
        const pane = $('ms-pane'); if (!pane) return;
        const keep = pane.scrollTop;
        pane.className = 'ms-pane ms-pane-' + M.tab;
        pane.innerHTML = M.tab === 'week' ? paneWeek() : M.tab === 'season' ? paneSeason() : paneDaily();
        pane.scrollTop = keep;
        document.querySelectorAll('#ms-tabs .ms-tab').forEach(b => { const on = b.dataset.tab === M.tab; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
        const sc = $('screen-missions'); if (sc) sc.dataset.tab = M.tab;
        badges();
    }
    function wallet() {
        const l = window.LobbyUI && LobbyUI.lobby;
        if (l) { $('ms-coins').textContent = num(l.coins); $('ms-diamonds').textContent = num(l.diamonds); }
        else if (currentProfile) { $('ms-coins').textContent = num(currentProfile.coins); $('ms-diamonds').textContent = num(currentProfile.diamonds); }
    }
    async function refresh() {
        try {
            const r = await post('/api/missions/state');
            if (!r.ok) return;
            M.daily = r.missions; M.ex = r.ex; M.skew = r.ex.now - Date.now(); M.fetched = true;
            if (typeof renderMissions === 'function') { _missionsCache = r.missions; }
            if ($('screen-missions').style.display === 'flex') render(); else badges();
        } catch (e) { /* offline: the cached daily list stays */ }
    }
    function open(tab) {
        const scr = $('screen-missions'); if (!scr) return;
        if (tab && TABS.includes(tab)) M.tab = tab;
        if (scr.style.display === 'flex') { render(); return; }
        scr.classList.remove('is-closing'); scr.style.display = 'flex'; document.body.classList.add('arsenal-open');
        wallet(); render(); sfx('click');
        refresh();
        clearInterval(M.tick); M.tick = setInterval(tickTimers, 1000);
        document.addEventListener('keydown', onKey);
        const back = scr.querySelector('.ars-back'); if (back) back.focus({ preventScroll: true, focusVisible: false });
    }
    function close() {
        const scr = $('screen-missions'); if (!scr || scr.style.display === 'none' || scr.classList.contains('is-closing')) return;
        clearInterval(M.tick); document.removeEventListener('keydown', onKey); document.body.classList.remove('arsenal-open');
        const fin = () => { scr.removeEventListener('animationend', onEnd); if (!scr.classList.contains('is-closing')) return; scr.classList.remove('is-closing'); scr.style.display = 'none'; };
        const onEnd = e => { if (e.target === scr) fin(); };
        scr.classList.add('is-closing'); scr.addEventListener('animationend', onEnd); setTimeout(fin, 450);
    }
    function onKey(e) {
        if (e.key === 'Escape' && $('reward-overlay').hidden) close();
        else if (e.key === '1' || e.key === '2' || e.key === '3') { M.tab = TABS[+e.key - 1]; render(); }
    }
    function tickTimers() {
        document.querySelectorAll('#ms-pane [data-cd]').forEach(el => { const t = el.querySelector('.ms-timer-t'); if (t) t.textContent = cdText(el.dataset.cd, +el.dataset.end); });
        if (M.ex && M.ex.dailyEndsAt <= now() && !M.busy && !M._reset) { M._reset = true; refresh().then(() => { M._reset = false; }); }   // the day (or the week) turned over while the screen was open
    }

    // ---------- claims ----------
    // After a payment: the numbers of the account, the coins and gems fly to the counters at the top, a prize with a chest gets its card
    function applyPay(r, fromEl, prizeTitle) {
        const before = window.LobbyUI && LobbyUI.lobby ? { coins: LobbyUI.lobby.coins, diamonds: LobbyUI.lobby.diamonds } : { coins: 0, diamonds: 0 };
        if (window.LobbyUI && r.lobby) LobbyUI.setLobby(r.lobby);
        M.daily = r.missions; M.ex = r.ex; if (typeof renderMissions === 'function') renderMissions(r.missions);
        render();
        const cEl = $('ms-coins'), gEl = $('ms-diamonds');
        if (juice() && fromEl && typeof spawnCoinFly === 'function') {
            cEl.textContent = num(before.coins); gEl.textContent = num(before.diamonds);
            if (r.rewardCoins) spawnCoinFly(fromEl, cEl.closest('.ars-cur'), r.rewardCoins, 'coins');
            if (r.rewardDiamonds) setTimeout(() => spawnCoinFly(fromEl, gEl.closest('.ars-cur'), r.rewardDiamonds, 'gem'), 250);
            setTimeout(() => {
                if (r.rewardCoins) { if (window.ARJuice && ARJuice.roll) ARJuice.roll(cEl, r.coins); else cEl.textContent = num(r.coins); }
                if (r.rewardDiamonds) { if (window.ARJuice && ARJuice.roll) ARJuice.roll(gEl, r.diamonds); else gEl.textContent = num(r.diamonds); }
                setTimeout(wallet, 1200);
            }, 800);
        } else wallet();
        if (r.rewardXp) showToast(`+${num(r.rewardXp)} Battle Pass XP${r.tiersGained ? ' · TIER UP!' : ''}`);
        if (prizeTitle && window.LobbyUI && LobbyUI.showReward) {
            const cards = [];
            if (r.rewardCoins) cards.push({ kind: 'coins', amount: r.rewardCoins });
            if (r.rewardDiamonds) cards.push({ kind: 'gems', amount: r.rewardDiamonds });
            if (r.chest) cards.push({ kind: 'chest', type: r.chest.type });
            if (cards.length) setTimeout(() => LobbyUI.showReward(cards, prizeTitle), juice() ? 900 : 0);
        }
    }
    async function onClick(e) {
        const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
        const act = b.dataset.act;
        if (act === 'tab') { M.tab = b.dataset.tab; render(); sfx('click'); return; }
        if (act === 'play') { close(); if (b.dataset.tag && typeof selectGamemode === 'function') selectGamemode(b.dataset.tag); return; }
        if (M.busy) return;
        M.busy = true; b.disabled = true;
        try {
            let r;
            if (act === 'claim') { const row = b.closest('.ms-row'); r = await post('/api/missions/claim', { missionId: row.dataset.id, kind: row.dataset.kind }); if (r.ok) applyPay(r, row, null); }
            else if (act === 'reward') { r = await post('/api/missions/claim-reward', { kind: b.dataset.kind, index: +b.dataset.i }); if (r.ok) applyPay(r, b.closest('.ms-prize, .ms-phase'), b.dataset.kind === 'season' ? 'SEASON PRIZE' : 'WEEKLY PRIZE'); }
            if (r && !r.ok) { showToast(r.error || 'Could not claim'); b.disabled = false; }
        } catch (err) { showToast('Network error. Please try again.'); b.disabled = false; }
        finally { M.busy = false; }
    }

    function init() {
        const pane = $('ms-pane'); if (!pane || pane._bound) return; pane._bound = true;
        pane.addEventListener('click', onClick);
        $('ms-tabs').addEventListener('click', e => { const t = e.target.closest('.ms-tab'); if (t) { M.tab = t.dataset.tab; render(); sfx('click'); } });
    }
    // game.js hands over the daily list it got (login, end of a match, a claim in the lobby card)
    function setDaily(list) {
        if (!Array.isArray(list)) return;
        M.daily = list;
        if ($('screen-missions') && $('screen-missions').style.display === 'flex') render(); else badges();
        if (!M.fetched && !M._pre) { M._pre = true; setTimeout(refresh, 600); }   // learn the weekly and the season state once, for the dot of the Missions button
    }
    return { init, open, close, setDaily, refresh, get state() { return M; } };
})();
window.MissionsUI = MissionsUI;
function openMissions(tab) { MissionsUI.open(tab); }
function closeMissions() { MissionsUI.close(); }
