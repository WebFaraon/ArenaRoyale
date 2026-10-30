# BLASTRIDGE Server Ops — integrare privată

Colectorul este oprit până când `OPS_SITE_URL` și `OPS_SITE_TOKEN` sunt configurate în mediul procesului. Nu publică date către un serviciu terț de analiză și nu modifică pachetul `gs2`, gameplay-ul sau Supabase.

## Ce trimite

- Un ID nou, unic, pentru fiecare meci și rematch; room ID, mod, build, început și final.
- La 5 secunde: TPS măsurat, medie/P95/maxim de procesare tick, întârzierea programării, jucători, zombi, gloanțe, entități, pachete și octeți payload emiși.
- Stall-uri de proces ≥15 ms, corelate cu meciurile active, și semnalarea excepțiilor din bucla jocului.
- La 30 de secunde: heartbeat, RSS, CPU al procesului relativ la un nucleu, camere active și înregistrări pierdute de colector.
- Doar când Black Box este pornit: capturi client la 30 de secunde și o ultimă captură la oprire. Analiza și serializarea se fac în `ops-blackbox-worker.js`. Exportul local complet, diagnosticul de rețea existent și regulile sale de autorizare rămân funcționale.

## Activare pe Kamatera

1. Integrarea trebuie aprobată și aplicată pe branch-ul de producție `skinuri-noi`. Patch-ul este pregătit pentru baza `60902a8fe7d58ff47ce3cd23e6fb5baa3d7b49c0`; verifică diferențele dacă branch-ul a avansat.
2. În dashboardul privat, deschide **Conectarea serverului → Descarcă configurația VPS**. Descărcarea este disponibilă numai proprietarului autentificat. Fișierul conține o cheie de serviciu; adaugă variabilele în `.env` pe VPS, fără a-l adăuga în Git.
3. Respectă procedura curentă din `CLAUDE.md`/`ops/README.md`: notează commit-ul de rollback, verifică checkout-ul și meciurile active, apoi actualizează și repornește procesul din directorul corect. Nu modifica nginx, portul procesului sau configurația PM2 pentru această integrare.
4. După pornire, dashboardul trebuie să primească heartbeat în aproximativ 10 secunde și ulterior la 30 de secunde. Joacă un meci real: verifică room ID, mod, build, TPS și închiderea lui.
5. Pornește Black Box cu F8 în meci; în aproximativ 30–50 de secunde captura trebuie să fie legată de același ID de meci. La oprire rămâne disponibil și exportul local complet, conform comportamentului actual al jocului.

Variabile:

```dotenv
OPS_SITE_URL=https://adresa-dashboardului-privat
OPS_SITE_TOKEN=cheia-descărcată-privat
OPS_SERVER_ID=kamatera-bucharest
# Opțional: director persistent pentru loturile netrimise
# OPS_QUEUE_DIR=/root/ArenaRoyale/.ops-queue
```

`OPS_SITE_TOKEN` este trimis doar către `OPS_SITE_URL`, prin antetul `OAI-Sites-Authorization`; redirect-urile nu sunt urmate. Cheia nu este trimisă clienților jocului sau inclusă în codul sursă. Payload-ul clientului nu decide ID-ul de meci: serverul îl verifică față de ultimele meciuri ale socketului și înlocuiește metadatele personale cu un identificator anonim de sesiune.

## Fiabilitate și limite

Loturile sunt scrise asincron în `.ops-queue`, în fișiere private, și retrimise cu backoff. IDs rămân stabile pentru deduplicare. Coada este limitată la 50 MB / 1.000 de fișiere; depășirea sau o eroare de scriere crește contorul `droppedRecords` și este logată. Datele aflate în ultimele secunde înainte de un crash pot să nu fi ajuns încă pe disc. La reluare sunt excluse înregistrările mai vechi de 30 de zile.

Capturile transmise sunt ferestre client disjuncte de până la 90 secunde, maximum aproximativ 850 KB; raportul local complet păstrează diagnosticul extins de rețea. Trimiterea nu înlocuiește exportul local. Un Worker sau o conexiune indisponibilă poate împiedica sincronizarea clientului, iar fișierul local poate fi importat ulterior.

Dashboardul păstrează datele persistent 30 de zile, separat de browser. Expirarea la citire este imediată; ștergerea fizică se face la următorul acces sau ingest. Fără trafic nu există un job separat de ștergere la minut.

Pentru dezactivare, elimină `OPS_SITE_URL`/`OPS_SITE_TOKEN` din mediul procesului și repornește conform procedurii aprobate. Mecanica jocului și Black Box local continuă să funcționeze.

## Verificare

```sh
node --check server.js
node --check public/blackbox.js
node --test --test-concurrency=1 tools/tests/*.test.js
# Mediu izolat, cu Supabase fals și două meciuri locale:
node tools/tests/ops-e2e.js
```

La verificarea acestei modificări: 250/251 teste trec; singurul eșec este preexistent în `stat-points.test.js` (așteaptă `Total depasit`, codul actual răspunde `Maximum total exceeded`). Același eșec a fost reprodus pe commit-ul de bază nemodificat. Cele 5 teste noi ale colectorului și Worker-ului trec. Testul end-to-end verifică două meciuri, patru mostre și două capturi; cifrele locale nu reprezintă capacitatea VPS-ului.
