# perf-harness

Measurement tools used by the performance work (not part of the game, not deployed).

- `br.js` – drives a real Chromium through a match (login, join a room hosted by bots, move/shoot) and records frame times, GC, allocations, CPU profile, DOM mutations. `--headed --vsync` = the real display cadence. `--abl ARArena.drawGrass,...` disables draw functions at runtime (ablation), `--query gfx=legacy` loads the page with a URL query.
- `suite.js` – the standard before/after table at 2560x1600 (150 % scale): PvE and BR scenes, 3 runs each, medians.
- `bots.js` – socket.io bots (`--n 30 --mode br --secs 30 --port 3100`), prints KB/s, packet sizes, arrival jitter.
- `ana_pos.js`, `ana_bullets.js` – smoothness of zombies/remote players/own camera and of enemy bullets from a `br.js --pos --gslog` run.
- `anaperf.js` – aggregates the server's `perf.jsonl` (start the server with `PERF=1`).
- `anacpu.js`, `anaheap.js` – top functions of a `--pass cpu` / `--pass heap` run.
- `sizes.js` – decomposes a real `gs` packet by component. `slow.js` – a client that stops reading for 4 s.
- `floor.js` – frame-rate ceiling of the platform for an almost empty canvas of the same size.

Setup: `npm i` in this folder (own package.json). Run a local server without Supabase: `SUPABASE_URL= SUPABASE_SERVICE_KEY= PORT=3100 node server.js` from the repo root, then `node suite.js --label before`.
Notes: a headless pacer at 144/240 Hz on the GPU over-produces frames and shows fake multi-second stalls; use `--gpuoff` for pacer runs and `--headed --vsync` for real cadence.
- `ana_bullets_rows.js` – enemy bullets as drawn (needs the page's `window.__arBullets`, present from G2; `br.js --pos` records it).
- Unit tests of the interpolation (60/144/240 Hz simulated, no browser): `node --test tools/tests/interp.test.js` from the repo root.
- `bots_v1.js` – the bots of protocol 1 (`gs`), for runs against a server of that time: `br.js --botfile bots_v1.js`.
