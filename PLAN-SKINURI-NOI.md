# Plan — integrarea skinurilor noi (fără cod scris încă)

Sursa: `incoming-assets/` (4 MB, deja în repo prin `8571dfb`). Citit: README-urile pachetelor, `weapon-skin-sprites.json` (Cerber, 12 skinuri noi), `character-skin-phoenix_mythic.json`, `weapons.json`, `weapon-skins.json`, `skins.json`.

## Descoperiri care schimbă planul
1. **Cele 12 skinuri Grizzly/Falcon/Titan țintesc arme care nu există în joc.** În JSON au `weapon: "ar_grizzly" | "ar_falcon" | "ar_titan"` (variante de Assault), dar `weapons.json` are doar `pistol, smg, assault, sniper, shotgun, burst`. Nu pot fi echipate pe nimic. În plus „Falcon” e deja numele armei burst, deci `ar_falcon` ar fi confuz. Opțiuni: (a) le leg de `assault` (Vanguard) ca 12 skinuri în plus — Arsenalul ajunge la 12+4 skinuri pe aceeași armă; (b) adaug cele 3 variante ca arme noi (schimbă mecanica și echilibrul: afară din scopul „strict cosmetic”). Recomand (a) după ce confirmi, cu id-urile `ar_*` păstrate ca id de skin și `weapon: "assault"`; `hands`/`muzzle` se iau exact din JSON, ca să nu se vadă diferențe de țeavă.
2. **Raritatea „mythic” nu cere schimbare de DB.** Rarități există doar în `weapon-skins.json` (`rarities`, `prices`) și ca stil în `game.js`/`index.html`; contul păstrează doar id-uri în `owned_weapon_skins` (jsonb). Nu am nevoie de migrare SQL pentru cele 6 skinuri mitice de armă. Migrare ar fi necesară doar pentru: skin mitic de **personaj** deținut (`unlocked_characters` ar merge, de verificat tipul coloanei), rucsac cosmetic, cofre/chest-uri, sau o monedă nouă.
3. **Mitic = fără preț în monede/diamante pe moment.** Propunere: neachiziționabile direct, doar din bundle/cofre/eveniment, deci `shop:false` până la un sistem de acordare (ca skinurile `season`, care au deja TODO fără cale de acordare). Prețul mitic e o decizie de produs, nu o ghicesc.
4. **Efectele sunt cod, iar „Efecte skin” nu există.** Trebuie: setare nouă (Redus/Normal) în UI, salvată local (`localStorage`, per jucător), Redus = imagine statică + aură. Straturile animate sunt PNG-uri full-frame (400×400 pentru personaj; 320×576 pentru arme) deci memorie de textură: ~0,6 MB RGBA/strat; de pre-încărcat doar pentru skinurile echipate în meci.
5. **Personajul Phoenix (400×400, pivot (200,179.5), `pxPerUnit` 2,5641) nu intră în sistemul actual** (256×256, pivot (128,118) hardcodat în `skins.json` și în desenul din `game.js`). Desenul trebuie să citească `frame.size`, `bodyCenterPx`, `pxPerUnit` per skin. Coliziunea rămâne r=36 (aripile/coada sunt doar imagine).

## Etape propuse (fiecare separat, cu teste și confirmare)
- **E1 — skinurile de armă noi (12), fără efecte.** Copiere sprite/svg/icon în `public/assets/…`, intrări în `weapon-skins.json` (după decizia de la punctul 1), iconițe în Arsenal. Risc mic; acoperit de testele existente + o verificare că `hands`/`muzzle` din JSON se aplică.
- **E2 — raritatea „mythic” în UI și server.** `rarities` + stil de card în Arsenal (aură/chenar), `shop:false`, acordare doar manuală/prin bundle. Prețuri/praguri rămân neatinse (listă „de nu atins”) până decizi tu valorile.
- **E3 — cele 6 skinuri mitice de armă.** Citire `layers`, `fx` din JSON; motor de efecte mic (aură, particule, flash, glonț) cu **plafon de particule** și dezactivat pe „Efecte skin = Redus”. Gloanțele mitice rămân vizual-doar: aceeași viteză/rază/hit (server nemodificat).
- **E4 — personaj Phoenix + sprite 400×400.** Generalizarea desenului (frame/pivot din JSON), apoi stratul cu aripi/coadă/creastă animate.
- **E5 — bundle Phoenix (personaj + sniper + rucsac).** Logica de bonus „ai toate piesele” o discutăm separat: cere decizie de produs (ce primești, unde se vede) și probabil coloană nouă; nu o încep fără ea. Rucsacul cosmetic nu are încă loc în UI.
- **Grenada:** doar SVG/PNG; **nu o integrez** (nu există mecanică de aruncare). Rămâne în `incoming-assets/` până apare designul.
- **Obiecte arenă** (colectibile, cutii, chest-uri, monede, iconițe, crosshair, zombi, arme pe jos): nu sunt în cererea de acum; lista din TODO (crosshair CSS, rarități cofre) le poate folosi mai târziu.

## Verificări înainte de orice cod
- Cadrul armelor `viewBox -40 0 80 144`, 4 px/unitate: confirmat în JSON-urile citite.
- Performanță: fiecare efect nou se măsoară cu harness-ul (`tools/perf-harness`, 2560×1600), înainte/după, în special particulele și straturile PNG mari, pentru că costul de fill-rate e deja problema cunoscută (G5).
