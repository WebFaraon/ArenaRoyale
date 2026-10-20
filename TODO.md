# TODO — Arena Royale

Convenție: **Fapt** = verificat în repo sau în producție în această sesiune. **De verificat** = nu pot confirma din repo; nu e dat ca fapt.
Producția = Kamatera, ramura **`skinuri-noi`** (nu `main`). **Verificat pe VPS** (`git rev-parse HEAD` și `merge-base --is-ancestor` pentru fiecare hash): HEAD în producție = `5126971`, curat, pm2 `arena` online (6 restart-uri în total, fără buclă). Rollback: `8dbf785`.

| Grup | Commit | În producție? |
|---|---|---|
| G1 strat static de grafică | `92835e0` | **da** |
| G2 interpolare zombi/gloanțe | `b49c477` | **da** |
| G3 server (fără spin, backpressure, `[LAG]`) | `eb1b9d8` | **da** |
| G4 protocol `gs2` | `8f64373` | **da** |
| Harness / teste / dependențe | `bc7088b`, `e8283ad`, `5126971` | da (fișiere, nu rulează în producție) |
| G5, G6 | — | nefăcute |

Singurul lucru nedeployat din ce e comis: commit-ul acestor documente (`CLAUDE.md`, `TODO.md`), care nu schimbă codul.

## Făcut (grupurile de performanță)
- **G1 — strat static de grafică** · `92835e0` · **deployat**. Iarba, marcajele și chenarul în dale de 256 u (`public/ground-layer.js`), eticheta și vignetta zonei cache-uite, `?gfx=legacy`. La 2560×1600: PvE 68→221 fps, BR 62→208 fps. Inelul zonei rămâne vectorial (măsurat: nu costă).
- **G2 — interpolare zombi și gloanțe inamice** · `b49c477` · **deployat**. `public/interp.js`, teste în `tools/tests/interp.test.js`. Zombi: cadre fără mișcare 57–63% → ~9% (apoi ~1% cu G4).
- **G3 — server** · `eb1b9d8` · **deployat**. Fără spin pe Linux (CPU/cameră ~jumătate), backpressure pentru clienți lenți (client blocat 4 s: 249→72 pachete vechi), log `[LAG]` mereu pornit.
- **G4 — protocol `gs2`** · `8f64373` · **deployat**. `public/netproto.js`, `server-gs.js`; KB/s per client la 30 de jucători 147→38; poziții ×4.
- Suport: harness `bc7088b`, `e8283ad`; teste + dependențe + harness actualizat `5126971` · deployate (fișierele ajung pe VPS prin `git pull`, nu rulează acolo).
- Deja în producție înainte de G1 (verificat: strămoși ai `8dbf785`): nume de arme `653ce98`, skinuri de arme pe server `eea73bf`, skinuri în meci `3e71d29`, Arsenal `1f82813`, meniul vechi de arme scos `dad5432`, obiecte de hartă (grupa 1) `8dbf785`.

## Urmează (în ordinea priorității)
1. **G5 — plafon dpr + scalare dinamică a rezoluției, fără setare în UI.** Coboară rezoluția internă când fps-ul scade sub țintă, urcă lent la loc, cu histerezis (să nu oscileze). La 2560×1600 randarea e legată de numărul de pixeli (fps ∝ 1/pixeli). Fișiere: `public/game.js` (`MAX_DPR` ~linia 111, `resizeCanvas` în `initGame`, `ZOOM`/`dpr` din `draw`), `public/ground-layer.js` (scara dalelor), `public/arena-art.js` (cache de scară). Măsurare: `tools/perf-harness/suite.js`.
2. **G6 — mărunțișurile din auditul de performanță.** Raportul nu e în repo; lista de mai jos vine din auditul făcut în conversația din 2026-10-20, cifrele sunt de re-verificat:
   - textul spectatorului se rescrie la fiecare cadru (`game.js` ~4428–4429);
   - cronometrul evenimentului din lobby (`_eventTimerInterval`, `game.js` ~1650) rulează și în meci;
   - `leaderboard-update` se trimite tuturor socket-urilor, inclusiv celor din meci (`server.js` ~669);
   - clientul emite `move` și `stop-shoot`, pentru care serverul n-are handlere (`game.js` ~3775, ~3805);
   - alocări în `draw` (~17 KB/cadru în auditul inițial), chei de string create la fiecare cadru pentru etichete (`_drawLabel`);
   - camera aliniată la grila de pixeli pentru shimmer static (de testat, nu aplicat orbește);
   - PvE: ~35 de layout-uri/s din HUD (cost mic, ~0,4%).
3. **Test pe iPhone/iPad pentru memoria dalelor** (buget 40 MB iOS/Android în `ground-layer.js`). Nu e verificat pe dispozitiv; verifică și că nu apar cusături la zoom/rotire. Pe iOS, canvas-urile sunt eliberate cu `width = 0`.
4. **Recorder „black box” de lag pe client (F8/F9).** **De verificat:** în repo nu există nimic (am căutat F8/F9/black box). Punct de pornire: overlay-ul DBG (`_toggleDbg`, tasta `` ` ``) și hook-urile `ar_diag` din `game.js`.
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
