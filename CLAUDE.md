# Arena Royale — ghid pentru Claude

## 1. Scop
Joc web multiplayer top-down, jucat în browser (desktop cu mouse/tastatură, telefon/iPad cu joystick-uri). Două moduri:
- **Battle Royale (`br`)**: jucători în cameră (cod de 5 litere), zonă care se strânge, 8 zombi pe hartă. **Nu există boți-jucători** (nu am găsit AI de jucători în cod).
- **Survival PvE (`pve`)**: cooperativ, 10 valuri de zombi (normal/runner/tank) care atacă baza din centru; între valuri, upgrade-uri cu monede.
Peste meci: conturi, XP/nivel, monede și diamante, misiuni zilnice, prieteni și invitații, clasament, magazin de personaje, Arsenal (arme + skinuri de arme).
Limita „20 de jucători" apare doar în text (PRODUCT.md, UI); în `server.js` nu am găsit o constantă care s-o impună (de verificat).

## 2. Stack
Node 22 (producție) + Express 5 + Socket.IO 4 (doar WebSocket, parser msgpack) · client fără framework: HTML/CSS + canvas 2D · Supabase (proiectul „WebFaraon's Project”, ref `odgmomoesvlakdzwgrxg`, eu-west-1; tabelele `players` și `friendships`, RLS activ, serverul folosește cheia de serviciu) · producție pe VPS Kamatera (Ubuntu, 1 vCPU), proces `pm2` numit `arena`, port 80.
Dependențe directe: express, socket.io, socket.io-msgpack-parser, notepack.io, bcrypt (nativ) + bcryptjs (fallback), dotenv, @supabase/supabase-js. `npm test` e doar un placeholder; testele se rulează cu `node --test` (secțiunea 5).

## 3. Structură
- `server.js` — tot serverul: rute HTTP (`/api/auth`, `/api/weapon-skins`, `/api/friends`, `/api/missions`, `/api/leaderboard`, `/api/build`), jocul (camere, bucla de tick, zombi, zonă, gloanțe), evenimente socket, Supabase. Secțiuni cu antet `// ----------`. **Fișier CRLF.**
- `auth-hash.js` — hash/verificare de parole: `bcrypt` nativ dacă se încarcă, altfel `bcryptjs` (cu linie `[Auth]` în log); aceleași hash-uri `$2a$10$`, cost 10.
- `server-gs.js` — trimite pachetul de stare `gs2`: partea comună codificată o dată, rândul „own” adăugat per client.
- `game-physics.js` — coliziuni pure (glonț măturat cerc/segment). `missions.js` — pool de misiuni zilnice (6/zi/jucător).
- `public/index.html` — o singură pagină cu toate ecranele (auth, lobby, Arsenal, așteptare, joc, overlay-uri). Serverul o stampilează cu hash-ul build-ului (`?v=`).
- `public/game.js` — clientul: UI de lobby/Arsenal/prieteni, `initGame` (socket, camere) și `startGameLoop` (rețea, predicție, desen). **Fișier LF.**
- `public/arena-art.js` — desenul hărții: sol (vectorial), copaci/pietre din sprite-uri PNG pe 3 sezoane, zombi din SVG-urile din `public/images/zombies/` (pachetul Obiecte Arena, scalate la hitbox-ul serverului, bitmap per tip), zona (vectorial), kit-uri.
- `public/ground-layer.js` — solul static (iarbă, marcaje, chenar) din dale în cache; `ARGround`.
- `public/interp.js` — interpolarea pe timpul serverului (jucători, zombi, gloanțe); `ARInterp`.
- `public/netproto.js` — formatul pachetului `gs2` (UMD: server, client, teste); `ARNet`.
- `public/combat-shared.js` — valori comune server/client (tick 60/s, scară vizuală, muzzle, durata gloanțelor, validări JSON).
- `public/ui-fx.js` — sunete UI (3 mp3 în `public/assets/soundEffetcs`), iconițe, cache-busting `arAsset`.
- `public/data/*.json` — surse unice: `weapons.json`, `weapon-skins.json`, `skins.json`, `map-objects.json`. `public/socket-msgpack-parser.js` — bundle browser; `style.css` — design toy-block (vezi `DESIGN.md`).
- `leaderboard.html` (clasament); `admin.html` există, dar serverul n-are handlere `admin-*` → pagină moartă (de verificat).
- `tools/perf-harness/` — măsurători (README propriu); `tools/tests/` — teste `node:test`; `tools/perf-probe.js` — sonda de tick a serverului (doar cu `PERF=1`); `tools/build-weapon-icons.js` — iconițe de arme, rulat manual.
- `_redesign/` — sursele artei (arme, skinuri, hartă, specificația Arsenalului); `_old_assets/` — imagini vechi; `supabase-migration-*.sql` — migrări de rulat manual.

## 4. Arhitectura acum
**Bucla serverului.** Fiecare cameră pornită are o buclă proprie, 60 tick/s exact (dt fix, acumulator pe `performance.now`; un tick întârziat se recuperează, peste 10 în urmă se aruncă restanța). Input-urile se pun în coadă și se aplică unul pe tick. Pe Linux bucla doarme cu `setTimeout` (fără spin, ~20% CPU/cameră economisit); pe Windows face sleep + spin pentru că timerele sunt grosiere (`LOOP_SPIN=1/0` forțează). `[LAG]` (în `arena-error.log`) apare când event-loop-ul e blocat >25 ms și numește cererile `/api` din jur (`near:`). `[SLOW] <rută> <ms>` apare pentru un hash `bcryptjs` sau un handler de socket care ține bucla >25 ms și pentru cereri `/api` care durează >400 ms (rată limitată, fără parole sau tokenuri). Backpressure: un client e sărit în tick-ul curent dacă are >64 KB în așteptare pe conexiune (`writableLength`) sau n-a trimis input >500 ms (clientul trimite câte un input per pachet primit); cât e sărit primește un pachet la 100 ms, deci la întoarcere vede ultima stare, nu o coadă.

**Protocolul `gs2`.** Eveniment `gs2`, `ARNet.PROTO = 2`. Pachet: `[tick, players, bullets, zombies, kits, zone, pve, own]`. Poziții în sferturi de pixel (întregi), jucătorii prin `slot` numeric (vine în `playersMeta`), `own` = rândul privat al clientului (muniție, reload, ack, monede). `server-gs.js` asamblează pachetul fiecărui client din partea comună + `own`, identic byte cu byte cu parser-ul; la pornire face un auto-test și, dacă nu se potrivește, cade pe `emit` per client. Clientul trimite `proto` la `create-room`/`join-room`; alt `proto` → `proto-mismatch` + `room-error` și pagina se reîncarcă o dată. Orice schimbare a formatului: crești `PROTO`, modifici server și client împreună, actualizezi `tools/tests/netproto.test.js`.

**Interpolarea.** Fiecare snapshot are `st = tick × TICK`. Clientul desenează lumea la `now − clockLag` (delay ~26–70 ms, din p95 al întârzierii pachetelor), între două snapshot-uri; la pauză extrapolează max 100 ms. Jucătorii remote și zombii se amestecă între snapshot-uri; gloanțele inamice pornesc din snapshot-ul de la/înainte de timpul de randare + timpul scurs (linie dreaptă). Jucătorul propriu: predicție locală + reconciliere prin reluarea input-urilor neconfirmate; gloanțele proprii sunt prezise și legate de cele ale serverului.

**Randarea.** Solul static (iarbă, marcaje, chenar) e pictat o dată în dale de 256 unități cu margine suprapusă de 6, la scara curentă (max 2,5 px/unitate), reconstruit când scara se stabilizează; buget 72 MB desktop / 40 MB iOS-Android, dalele nefolosite 20 s se eliberează; până la construcție, dala se desenează vectorial. `ARGround.setTheme(sezon)` invalidează cache-ul. `?gfx=legacy` desenează vechiul mod. Zona (inelul, doar BR) rămâne vectorială în `ARArena.drawZone` (măsurat: nu costă). Etichetele (nume, HP, timerul zonei) și sprite-urile sunt cache-uite; `MAX_DPR = 2`. **Rezoluție dinamică (G5, `RS_*`/`_rsTick` în `game.js`)**: sub 54 fps timp de 2 s dpr-ul intern coboară pe pașii 1/0,85/0,72/0,62/0,54, probă în sus după 12 s bune (dublează așteptarea dacă eșuează), pas anulat dacă nu ridică fps-ul; `?rs=off` / `?rs=0.6` pentru măsurători.

**Arme și skinuri.** `weapons.json` e sursa unică (server și client): 6 arme — Scout (pistol), Stinger (smg), Vanguard (assault), Falcon (burst, clasa assault), Boomer (shotgun), Hawkeye (sniper); id-urile interne rămân `pistol, smg, assault, burst, shotgun, sniper`. **Skinurile de arme** (`weapon-skins.json`, 24): rarități `rare` (1200 monede), `epic` (40 diamante), `legendary` (80 diamante); 6 se deblochează la 50 de kills cu arma respectivă (din `weapon_stats`). Contul păstrează `owned_weapon_skins` și `equipped_weapon_skins` (migrare SQL). Serverul alege skinul echipat la `addPlayer` și îl reîmprospătează la `start-game` și `rematch`, îl trimite în `playersMeta`/`player-image`; clientul îl desenează cu `_gunLook` (sprite, mâini, flash, dâră). Gloanțele pornesc mereu din gura armei de bază: skinul e strict cosmetic. Cumpărarea/echiparea trec prin `/api/weapon-skins/*` (cumpărare cu verificare compare-and-set, serializată). Arsenalul (`screen-arsenal`, lobby) alege arma și skinul; meniul vechi de arme a fost scos. **Skinurile de personaj** (`skins.json`, 46: common 10, rare 10, epic 5, legendary 17, season 4; implicit `rookie`) se validează pe server; skinurile `season` nu au încă un mod de acordare (TODO în `server.js` și `game.js`).

## 5. Comenzi
- Local fără bază de date: `SUPABASE_URL= SUPABASE_SERVICE_KEY= PORT=3100 node server.js` (fără chei, statisticile nu se salvează; login-ul acceptă orice nickname). Cu `.env` local (nu se comite) merge pe Supabase real — nu rula teste automate pe el.
- Teste: `node --test tools/tests/interp.test.js tools/tests/netproto.test.js` (22 de teste; Node 24 vrea fișiere, nu director).
- Harness: `cd tools/perf-harness && npm i`; tabelul înainte/după la 2560×1600: `node suite.js --server http://127.0.0.1:3100 --label eticheta [--query gfx=legacy]` (deschide ferestre Chrome). `br.js` = un meci real în Chromium cu boți (`--mode br|pve --bots N --hz 0 --headed --vsync --pass frames|cpu|heap|gc --abl ARArena.drawGrass,… --pos --gslog --botfile bots_v1.js`); `bots.js` = încărcare socket.io; `ana_*.js`, `sizes.js`, `slow.js`, `ground-fixture.js`. Detalii în `tools/perf-harness/README.md`. Pentru pacer la 144/240 Hz pe GPU folosește `--gpuoff`; cadența reală se măsoară cu `--headed --vsync`.
- Variabile de mediu: `PORT` (3000 local, 80 în producție), `SUPABASE_URL`/`SUPABASE_SERVICE_KEY` (lipsa lor = mod în memorie), `MAP_SEASON` (`vara`|`toamna`|`iarna`, implicit `vara`), `UNLOCK_ALL=1` (doar teste: toate skinurile deblocate), `TEST_ACCOUNTS` (conturi ascunse din clasament, implicit `qa_live_test`), `PERF=1` + `PERF_OUT` (sondă de tick în `perf.jsonl`), `LOOP_SPIN`, `LAG_LOG=0`, `LAG_LOG_MS` (25), `LAG_LOG_EVERY_S` (5), `AUTH_BCRYPT=js` (forțează `bcryptjs`), `SLOW_LOG=0`, `SLOW_LOG_MS` (25), `SLOW_REQ_MS` (400), `SLOW_LOG_EVERY_S` (5). Modul dev al armelor: `?dev=weapons`.

## 6. Deploy pe Kamatera (VPS `root@79.108.166.122`, dosar `/root/ArenaRoyale`, pm2 `arena`)
Se face doar după confirmarea explicită a utilizatorului.
- **Branch din care se trage în producție: `skinuri-noi`** (`origin/skinuri-noi`); `main` e rămasă în urmă (`2738538`) și nu se folosește la deploy.
- **Commit în producție acum: `dc1143f`** (G1–G4 + fix `stat_*` + G7 + G5 + G6; deployat și verificat pe VPS la 2026-10-21; build `e23d443e50`). Un commit mai nou poate diferi de el doar prin documente. Actualizează linia asta la fiecare deploy.
- **Commit de rollback curent: `9a9c220`** (`9a9c2207e881f56cddd4321c27c982adbc27f8bc`, producția dinaintea G5/G6; același `package.json`, deci nu cere `npm install`). Comanda exactă (din PowerShell/Git Bash local):
  `ssh -i ~/.ssh/arenaroyale root@79.108.166.122 "cd /root/ArenaRoyale && git checkout 9a9c2207e881f56cddd4321c27c982adbc27f8bc && pm2 restart arena"`
  Rollback mai adânc: `4060c2acd0c3644f2258a1f8a45c9d84806a10f2` (dinaintea G7: `bcryptjs` rămâne în `package.json`, iar `bcrypt` rămâne instalat dar neutilizat, deci nu cere `npm install`), apoi `5126971b0055f4422b8ab169ce33b2ba9de91ce6` (dinaintea fix-ului `stat_*`; pagina publică e aceeași), iar și mai adânc, dinaintea G1–G4: `8dbf785cfe31ebcb99e7ec95ec44b85141b112b4` (protocolul vechi `gs`, fără dale; clienții cu pagina nouă se reîncarcă singuri, build-ul diferă). După orice rollback VPS-ul rămâne cu HEAD detașat: ca să revii la fluxul normal, `git checkout skinuri-noi && git pull --ff-only` și `pm2 restart arena`.
1. Local: testele trec, totul comis, `git push origin skinuri-noi`.
2. Pe VPS (cheia SSH locală: `~/.ssh/arenaroyale`): notează `git rev-parse HEAD` (punctul de rollback), verifică `git status` curat și că nu e meci activ (`ss -tn state established '( sport = :80 )'`, ultimele linii din `arena-out.log`).
3. `git pull --ff-only` → `npm install --omit=dev` (doar dacă s-a schimbat `package*.json`) → `pm2 restart arena`.
4. După ~30 s: `pm2 list` (online, restarts crescut cu 1, fără buclă), liniile noi din `/root/.pm2/logs/arena-out.log` și `arena-error.log` (o linie `[LAG]` de ~30 ms la pornire e normală; atenție la `proto-mismatch`, erori de `require`, `[gs] envio per-client simplu`), `curl localhost:80/api/build`, fișierele publice noi cu `?v=<build>`.
5. Verificare `gs2` fără conturi reale: copie temporară a commit-ului (`git archive HEAD`, fără `.env`) pe alt port + boți din harness. **Nu crea conturi de test în Supabase de producție** (singurul cont de test e `qa_live_test`).
6. Rollback dacă ceva eșuează: `git checkout <commit-anterior>` + `pm2 restart arena`, apoi raportezi; fără reparații pe loc în producție. Nu șterge loguri pm2 și nu rula comenzi distructive.
Atenție la curățenia prin ssh: nu opri procese după directorul în care rulează chiar scriptul de curățenie.

## 7. Convenții
- Răspunzi în română; codul și comentariile rămân în engleză/română ca în fișierul respectiv.
- **Nu faci commit și nu faci deploy până nu confirmă utilizatorul explicit**, de fiecare dată.
- Modificările de performanță se raportează înainte/după cu numere măsurate (aceleași comenzi, 2560×1600, 240 Hz), plus teste, risc și mod de revenire.
- Un commit per modificare logică, mesaj clar (stilul actual: titlu scurt + paragraf cu „de ce” și cifre), cu trailer-ul `Co-Authored-By`.
- Nu schimbi mecanica jocului din motive vizuale. Skinurile de arme sunt strict cosmetice: aceeași gură de foc, dispersie, viteză, cadență, damage.
- Citește fișierul înainte de editare; atenție la capetele de rând (`server.js` CRLF, `game.js` LF) la editări scriptate.

## 8. De nu atins fără să întrebi
Protocolul `gs2` (ambele părți + `PROTO`) · logica de damage/hit și gloanțele măturate (`game-physics.js`, secțiunea de gloanțe din tick) · baza de date Supabase și migrările (`supabase-migration-*.sql`, coloane `players`) · prețuri, raritățile și pragurile de deblocare (`weapon-skins.json`, `skins.json`) · configurarea serverului și pm2 (`.env`, `fly.toml`, `Dockerfile`, setările pm2 de pe VPS) · cache-busting (`arAsset`/`?v=`).

## 9. Pitfall-uri deja găsite
- `volatile` din socket.io pierde `gs` la clienți sănătoși: orice mesaj ne-volatile scris în același tick (`hit`, `srv-stats`, kit) face transportul „nescriibil”. De aceea backpressure-ul e real (vezi 4).
- `bcryptjs` (JS pur) blochează tot event-loop-ul ~70 ms per hash/verificare pe VPS (toate camerele pierd tick-uri); de aceea `/api/profile/stats` și `/api/profile/avatar` se autentifică cu tokenul de sesiune (`sessionTokens`, emis la login/înregistrare, în memorie, fără expirare, unul per nickname), parola rămânând doar ca plasă pentru pagini vechi, iar hash-ul folosește `bcrypt` nativ. Rutele noi cu autentificare folosesc tokenul, nu parola.
- Iarba, marcajele și zona stroke-uite vectorial în fiecare cadru țineau jocul la 55–80 fps la 2560×1600 deși JS costa <1 ms: costul e pe GPU/raster și nu apare în profilul JS. Se găsește cu ablații, nu cu profiler (de aici stratul de dale).
- Serverul rotunjea pozițiile la pixel întreg: zombii se mișcau în trepte (rezolvat prin precizie ×4 în `gs2` + interpolare).
- Un pacer artificial de 144/240 Hz pe GPU produce blocaje false de secunde; măsoară cu `--gpuoff` sau cu vsync real.
- Memoria dalelor pe iOS/iPad nu e verificată pe dispozitiv (bugetul de 40 MB e o presupunere prudentă).
- Pe Windows timerele sunt grosiere: cifrele de jitter ale serverului local nu reprezintă producția (Linux).
- **Limita de 10 puncte HP/DMG/SPD e în 3 locuri**: clientul (`MAX_POINTS` în `game.js`), serverul (`/api/profile/stats`, plus clamp-ul din `addPlayer` la intrarea în meci) și check-ul `players_stat_points_total` din DB (`supabase-migration-stat-points.sql`; intervalul 0–10 pe stat e în `players_stat_points_range`). Dacă se schimbă, se schimbă în toate trei.
- Migrările din `supabase-migration-*.sql` se rulează manual în SQL editor (`list_migrations` e gol), deci nu au istoric: după fiecare, verifică în citire coloanele și check-urile. `stat_hp/dmg/spd` au lipsit din DB până pe 2026-10-20 (update-ul eșua în tăcere); acum există, iar o eroare de update se loghează și răspunde `ok:false`.
- Cache-ul de scară al sprite-urilor/dalelor: o schimbare de zoom întinde bitmap-urile până se stabilizează scara.
