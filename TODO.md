# TODO — Blastridge

Convenție: **Fapt** = verificat în repo sau în producție în această sesiune. **De verificat** = nu pot confirma din repo; nu e dat ca fapt.
Production = Kamatera, branch **`skinuri-noi`**. **Verified on VPS 2026-10-30:** active code `4481d12`, build `9c968e93ef`; PM2 runs `/root/ArenaRoyale/server.js` on port 3000 behind nginx. `https://79.108.166.122/` has a trusted Let's Encrypt IP certificate; HTTP redirects to HTTPS. Chrome reports a secure context, a valid manifest, and no installability errors. The served page retains Blastridge branding and the PvE build HUD. Certbot renewal dry-run passed. Previous runtime for rollback: `/root/releases/arena-ammo-diag-cb5add2`.

| Grup | Commit | În producție? |
|---|---|---|
| G1 strat static de grafică | `92835e0` | **da** |
| G2 interpolare zombi/gloanțe | `b49c477` | **da** |
| G3 server (fără spin, backpressure, `[LAG]`) | `eb1b9d8` | **da** |
| G4 protocol `gs2` | `8f64373` | **da** |
| fix `stat_*` (migrare + log + test) | `fe8dafe` | **da** (migrarea rulată în Supabase) |
| G7 bcrypt nativ + token + `[SLOW]` | `9a9c220` | **da** |
| Harness / teste / dependențe | `bc7088b`, `e8283ad`, `5126971` | da (fișiere, nu rulează în producție) |
| G5 scalare dinamică a rezoluției | `cf630a4` | **da** |
| G6 mărunțișuri (parțial) | `dc1143f` | **da** |

Nedeployat din ce e comis: doar commit-uri de documente, care nu schimbă codul.

## Făcut (grupurile de performanță)
- **G1 — strat static de grafică** · `92835e0` · **deployat**. Iarba, marcajele și chenarul în dale de 256 u (`public/ground-layer.js`), eticheta și vignetta zonei cache-uite, `?gfx=legacy`. La 2560×1600: PvE 68→221 fps, BR 62→208 fps. Inelul zonei rămâne vectorial (măsurat: nu costă).
- **G2 — interpolare zombi și gloanțe inamice** · `b49c477` · **deployat**. `public/interp.js`, teste în `tools/tests/interp.test.js`. Zombi: cadre fără mișcare 57–63% → ~9% (apoi ~1% cu G4).
- **G3 — server** · `eb1b9d8` · **deployat**. Fără spin pe Linux (CPU/cameră ~jumătate), backpressure pentru clienți lenți (client blocat 4 s: 249→72 pachete vechi), log `[LAG]` mereu pornit.
- **G4 — protocol `gs2`** · `8f64373` · **deployat**. `public/netproto.js`, `server-gs.js`; KB/s per client la 30 de jucători 147→38; poziții ×4.
- **G7 — bcrypt** · `9a9c220` · **deployat** (detalii mai jos): `bcrypt` nativ cu fallback pe `bcryptjs` (`auth-hash.js`), token de sesiune în `/api/profile/stats` și `/api/profile/avatar`, jurnal `[SLOW]` și `near:` în `[LAG]`. Local, gol în event-loop la stats 71,5→1,8 ms și la 3 login-uri simultane 210→1,9 ms.
- Suport: harness `bc7088b`, `e8283ad`; teste + dependențe + harness actualizat `5126971` · deployate (fișierele ajung pe VPS prin `git pull`, nu rulează acolo).
- Deja în producție înainte de G1 (verificat: strămoși ai `8dbf785`): nume de arme `653ce98`, skinuri de arme pe server `eea73bf`, skinuri în meci `3e71d29`, Arsenal `1f82813`, meniul vechi de arme scos `dad5432`, obiecte de hartă (grupa 1) `8dbf785`.

## G7 — bcrypt blochează event-loop-ul (deployat 2026-10-20, `9a9c220`)
**Problema.** Descoperită din logul `[LAG]`: când FARAON a intrat în meci, event-loop-ul s-a blocat 156 ms. Cât timp `bcryptjs.compare` rulează, **toate camerele** pierd tick-uri. Rutele: login, `/api/profile/stats` (apelat la fiecare `joinGame`), `/api/profile/avatar`; `bcrypt.hash(…, 10)` la înregistrare.
- **Confirmat pe VPS** (script separat în /tmp; 1 vCPU Xeon, Node 22; toate cele 17 conturi au hash-uri `$2a$10$`): `bcryptjs` compare = **71 ms** (max 75), blochează tot; 3 simultane = **206 ms** într-un blocaj. În `worker_thread`: gol 1,4 ms. `bcrypt` nativ (verifică hash-urile `$2a$` existente): gol 1,6 ms, 3 simultane 2,3 ms, 55 ms/apel.
- **Pe rută (local, Supabase fals):** login, stats, avatar și stats cu parolă greșită blochează fiecare ~31–48 ms (un compare); `create-room` + `start-game` nu blochează (sub 15 ms).
- **Din logul `[LAG]` din producție (primele ~11 h după G3):** 30 de blocaje >25 ms (cel mai mare **184 ms**); 8 la ≤2,5 s de o cameră creată (5 din 6 intrări în meci), 20 fără eveniment de cameră în apropiere (logul nu avea cereri HTTP, deci ruta nu se putea dovedi), 2 la pornire. La niciunul nu era o cameră activă (`rooms 0`): până atunci nu se pierduseră tick-uri reale.
- **Rămas neatribuit:** blocajele de 129–184 ms la intrarea în meci sunt mai lungi decât un compare (71 ms); ce adaugă restul nu e dovedit. Acum `[LAG]` numește cererile din jur (`near:`) și `[SLOW]` numește hash-ul/handlerul lent, deci se va vedea la următoarele blocaje.

**Ce s-a făcut.** `auth-hash.js` (nativ dacă se încarcă, verificat; altfel `bcryptjs` cu linie `[Auth]`; `AUTH_BCRYPT=js` forțează fallback-ul; aceleași hash-uri, cost 10, fără migrare). `/api/profile/stats` și `/api/profile/avatar` se autentifică cu tokenul de sesiune (verificare în memorie), cu parola ca plasă pentru pagini vechi. `game.js` trimite tokenul. `[SLOW] <rută> <ms>` (hash `bcryptjs`, handlere de socket, cereri `/api` lungi; rată limitată, fără parole/tokenuri). Teste: 33 în total (`stat-points`, `auth-hash`, `fake-supabase`).
- **Măsurat local** (RTT al unui ping în timpul cererilor; înainte → după): stats max 71,5 → 1,8 ms; 3 login-uri simultane 210 → 1,9 ms; login 112 → 18,7 ms (restul e munca rutei, nu hash-ul). Doar cu token (fără nativ): stats rezolvat, login rămâne ~115 ms.
- **Verificat în producție după deploy:** pm2 online, `[Auth] bcrypt nativ activ (bcrypt 6.0.0)` în log, fără erori de `require`, fișierele publice 200, `game.js` trimite tokenul. **De verificat:** un login real + intrare în meci fără `[LAG]`/`[SLOW]` lângă `/api/auth/login` și `/api/profile/stats`, și salvarea `stat_*` cu token în DB.
- **Nu s-a făcut (opțiuni respinse):** `worker_threads` (nativul e mai simplu și mai rapid); scăderea costului.

## G5/G6 — deployate 2026-10-21 (`dc1143f`)
- **G5** (`public/game.js`, blocul `RS_*`/`_rsTick`): pașii de scară 1/0,85/0,72/0,62/0,54 din dpr; jos după 2 s sub 54 fps, sus după 12 s peste (dublează așteptarea dacă proba eșuează); un pas jos care nu ridică fps-ul (display 30 Hz, CPU-bound) se anulează, iar după 2 astfel de eșecuri scalerul se oprește. `?rs=off` / `?rs=0.6` pentru măsurători; ultimul pas se ține în `localStorage.ar_rs_idx`. Măsurat (software, 1707×1067 dpr 1,5, BR, 45 s): fără scaler 50,2 fps (ultimele 10 s: 53,1), cu scaler 66,5 (68,4), a ajuns pe pasul 0,85, iar proba în sus a eșuat o dată (upNeed 12→24 s), fără oscilație. Pe GPU real (200+ fps) nu intervine. **Netestat live:** calea „anulare” (nu am reușit să creez un caz CPU-bound cu `--cpu 6`).
- **G6 făcut:** text spectator doar la schimbare; cronometrul lobby oprit în meci (`stopEventTimer`); scoase `move`/`stop-shoot` (serverul n-are handlere).
- **G6 nefăcut, cu motiv:** `leaderboard-update` rămâne `io.emit` (1 mesaj la ≥10 s, câțiva KB; clasamentul de pe ecranul game over se actualizează tocmai prin el); alocările din `draw`/cheile de etichete (alocare totală măsurată ~2–2,6 MB/s, deci neglijabil); camera aliniată la pixel (cere verificare vizuală); layout-urile HUD PvE (~0,4%).

## Urmează (în ordinea priorității)
1. **G5 — plafon dpr + scalare dinamică a rezoluției, fără setare în UI.** Coboară rezoluția internă când fps-ul scade sub țintă, urcă lent la loc, cu histerezis (să nu oscileze). La 2560×1600 randarea e legată de numărul de pixeli (fps ∝ 1/pixeli). Fișiere: `public/game.js` (`MAX_DPR` ~linia 111, `resizeCanvas` în `initGame`, `ZOOM`/`dpr` din `draw`), `public/ground-layer.js` (scara dalelor), `public/arena-art.js` (cache de scară). Măsurare: `tools/perf-harness/suite.js`.
2. **G6 — mărunțișurile din auditul de performanță.** Raportul nu e în repo; lista de mai jos vine din auditul făcut în conversația din 2026-10-20, cifrele sunt de re-verificat:
   - textul spectatorului se rescrie la fiecare cadru (`game.js` ~4428–4429);
   - cronometrul evenimentului din lobby (`_eventTimerInterval`, `game.js` ~1650) rulează și în meci;
   - `leaderboard-update` se trimite tuturor socket-urilor, inclusiv celor din meci (`server.js` ~669);
   - clientul emite `move` și `stop-shoot`, pentru care serverul n-are handlere (`game.js` ~3775, ~3805);
   - alocări în `draw` (~17 KB/cadru în auditul inițial), chei de string create la fiecare cadru pentru etichete (`_drawLabel`);
   - camera aliniată la grila de pixeli: **făcut** (`_ox/_oy` în `draw()`, vezi `CLAUDE.md` §4 Randarea);
   - PvE: ~35 de layout-uri/s din HUD (cost mic, ~0,4%).
2b. **Raport F8 de pe un dispozitiv real** (desktop cu GPU la 240 Hz, iPad, telefon): optimizările de randare (pixeli întregi, vignetă 1:1, limită ~120 fps la ≥200 Hz) au fost măsurate doar în Chromium cu randare software (thread-ul principal 64% -> 30%, blocaje 19/min -> 0,5/min la 1280x720). Înregistrează un meci cu F8 și compară; dacă pe GPU real nu mai apar blocaje, restul e doar marjă.
3. **Test pe iPhone/iPad pentru memoria dalelor** (buget 40 MB iOS/Android în `ground-layer.js`). Nu e verificat pe dispozitiv; verifică și că nu apar cusături la zoom/rotire. Pe iOS, canvas-urile sunt eliberate cu `width = 0`.
4. **Recorder „black box” de lag pe client — făcut** (`public/blackbox.js`, testat în `tools/tests/blackbox.test.js`). F8 în meci pornește înregistrarea (pilulă „BLACK BOX” jos-stânga), F9 salvează ultimele 90 s și continuă, F8 din nou oprește și salvează; la sfârșitul meciului salvează singur ce a apucat. Raportul `arena-blackbox-<data>.json` are un rezumat, incidentele cu cauza probabilă (rețea, server care a sărit tick-uri, thread blocat, GC, cost de cadru, GPU/sistem, tab ascuns, redimensionare, deconectare) și seriile brute; timpii incidentelor au și ora de pe ceas, ca să se potrivească cu `[LAG]`/`[SLOW]` din `arena-error.log`. Costul cu el pornit e neglijabil (JS pe cadru 0,48 ms față de 0,49 oprit). **De făcut:** un buton în Setări pentru ecrane tactile (acum doar tastele F8/F9, sau `ARBlackBox.start()` din consolă) și, dacă se dovedește util, trimiterea raportului la server.
5. **Bug PvE: gloanțe-fantomă.** **De verificat:** nu există descriere sau test în repo. Clientul numără deja „ghost”/„phantom” (`_bDiag`, `game.js` ~2916); în măsurătorile mele PvE au ieșit 0–1 ghost și 0–4 phantom pe ~25 s, deci nu am reprodus un bug. Trebuie un caz de reproducere de la tine.
6. **Obiecte de hartă.** Grupa 1 e integrată: copaci mic/mediu/mare, brad, pietre mare/medie, 3 sezoane (`8dbf785`). `tufis` și `pietre_mici` sunt în pachet și în `map-objects.json`, dar nu se desenează (`MAP_OBJECT_IDS` are doar 6). Grupele 2–7: **de verificat**, nu apar în repo (README-ul pachetului vorbește doar de „grupul 1”).
7. **Conținut de joc nerealizat** (nu am găsit cod pentru ele; **de verificat** dacă există planuri în altă parte):
   - BR loot, melee, variante de arme;
   - integrarea sunetelor: există doar 3 sunete de UI (`public/assets/soundEffetcs`), niciun sunet în meci;
   - crosshair CSS;
   - raritățile cofrelor în DB/UI: în lobby sunt doar 4 sloturi goale cu text, fără logică și fără coloană în DB.

## Datorii tehnice găsite la citirea repo-ului
- **Skinuri `season`:** nu au cale de acordare (TODO în `server.js` ~335 și `game.js` ~782).
- **`admin.html` pare mort** (emite `admin-start`, `admin-trigger-zone`, `admin-reset` fără handler pe server) – **de decis dacă se șterge**. Verificat: `server.js` nu conține nicio ocurență `admin-`.
- **`main` e rămasă în urmă** (`2738538`, mai); producția rulează `skinuri-noi`. De decis: merge în `main` sau schimbarea ramurii implicite.
- **`PRODUCT.md` e vechi** (30 personaje vs 46 skinuri de personaj + 24 de arme). Zice și 29 de proiectile și nu pomenește Arsenalul.
- **`tufis` și `pietre_mici` nu se desenează încă:** există în `map-objects.json` și în pachetul de imagini, dar `MAP_OBJECT_IDS` (`public/combat-shared.js`) conține doar cele 6 obiecte din meci.
- **Limita de 20 de jucători** apare în text, nu în `server.js` (de verificat/decis).
- **`fly.toml` și `Dockerfile`** vin de la Fly.io; producția e pe Kamatera. De verificat dacă mai sunt folosite.
- **`package.json`:** `npm test` e placeholder; testele rulează prin `node --test` pe fișiere. `game-physics.js` zice că are teste unitare, dar nu există (de verificat).
- **Baza de date vs cod** (citit pe 2026-10-20 din Supabase, proiectul „WebFaraon's Project” `odgmomoesvlakdzwgrxg`, doar citire, nimic modificat; `players` are 17 rânduri, `friendships` 0):
  - **Migrările din repo sunt aplicate:** `missions_state` (text), `weapon_stats` (jsonb, check „obiect”), `owned_weapon_skins` (jsonb, check „listă”), `equipped_weapon_skins` (jsonb, check „obiect”). Deci tabela/coloana `weapon_stats` există; logul vechi din producție (2026-10-18) care spunea că lipsește e depășit.
  - **Migrările nu sunt urmărite de Supabase:** `list_migrations` returnează gol, adică au fost rulate manual în SQL editor. Nu există istoric.
  - **DIFERENȚĂ 1 — rezolvată (2026-10-20):** `stat_hp`, `stat_dmg`, `stat_spd` lipseau din `players`, iar `/api/profile/stats` răspundea `ok:true` deși update-ul eșua. Migrarea `supabase-migration-stat-points.sql` a fost rulată (verificat în citire: 3 coloane `integer not null default 0` + check-urile `players_stat_points_range` și `players_stat_points_total`, validate), iar serverul loghează acum eroarea și răspunde `ok:false` (`fe8dafe`). Rămâne de făcut testul cap-coadă pe un cont real (intri în meci cu 3/4/3, se citește doar rândul respectiv din DB).
  - **DIFERENȚĂ 2 (coloane fără cod):** `mission_date`, `mission_kills`, `mission_games`, `mission_wins`, `mission_kills_claimed`, `mission_games_claimed`, `mission_wins_claimed` sunt rămășițele sistemului vechi de misiuni; nicio ocurență în `server.js`, `missions.js` sau `game.js` (misiunile folosesc acum `missions_state`).
  - Restul coloanelor folosite de cod (`nickname`, `password_hash`, `avatar`, `kills_total`, `wins_total`, `games_played`, `xp`, `coins`, `diamonds`, `unlocked_characters`) și coloanele `friendships` (`requester`, `target`, `status`) există.
  - De decis: ce se face cu coloanele `mission_*` vechi (diferența 2).
- **Reziduuri G2/G4 (cosmetice):** ~1% din cadrele unui glonț inamic merg înapoi, în ultimele 1–2 cadre ale zborului (la capătul razei); zombii au ~1% cadre fără mișcare la 144/240 Hz.
