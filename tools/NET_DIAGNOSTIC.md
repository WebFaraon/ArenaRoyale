# Network diagnostic (local worktree)

The server trace stays off unless both `AR_NET_DIAG=1` and
`AR_NET_DIAG_USER_ID=<Supabase players.id of the test account>` are set. Only a
successful password login backed by Supabase records a diagnostic identity;
activation also re-reads that ID and nickname from Supabase. Local fallback
login, failed database reads, and nickname matching alone cannot activate it.
Only this identity can claim the one global diagnostic slot with F8 during a match. No
change is made to `gs2`, its tick rate, or its payload. The ordinary browser
Blackbox still works when the server trace is disabled.

The diagnostic events are limited per socket: start once per 10 seconds,
incident once per 30 seconds, and ping once per 1.5 seconds. Server incident
exports have an additional 30 second cooldown. Stop is always accepted.
Only one export may be pending; a worker job times out after 15 seconds.

Server samples stay in a fixed ring of 6,000 rows (1,279,200 bytes including
the event and batch arrays). An incident captures at most the preceding eight
seconds, two seconds after detection. The main thread copies bounded typed
arrays; a worker builds JSON and writes a temporary file with mode `0600`,
syncs it, and atomically publishes a complete report in a
directory with mode `0700`. The default directory is under the OS temporary
directory, named `arena-netdiag-<OS user ID>` (or `-local` on Windows). The
name remains the same across process restarts, and at most 20 published
reports are retained. Stale temporary files are removed on a later export.
Set `AR_NET_DIAG_DIR` to an absolute,
private directory if persistence is needed. A directory under `public/` is
rejected. Existing directories with group or other permissions or a different
owner are rejected on Linux. The worker reports only a random file ID, session ID, and tick over
the gameplay socket; it never sends the report content through Socket.IO.
Retrieve server files from that private directory separately. There is no
HTTP endpoint for them. The worker retains at most 20 diagnostic files in the
directory, deleting the oldest files with its own naming pattern.

The browser's F9 and F8 report saves wait until gameplay has ended. During a
long match, up to three small eight second incident windows are kept in memory
so their packet/decode/handler rows survive the 90 second rolling window.
Forced departure stops the game loop before a queued browser export runs; a
temporary disconnect or reconnect keeps the queued report until that end.
Room reset and build reload wait briefly for an already queued browser save
after stopping the game loop; a diagnostic failure cannot hold the reload
longer than two seconds.
The server file, if already queued, can still be recovered by its ID. Disconnect
and rematch stop the old diagnostic session; a new match needs a new F8 claim
and receives a new session ID. The browser report includes the session ID,
server export ID, and clock samples for correlation.

`packetCreate` means Engine.IO accepted the buffer, `flush` means Engine.IO
passed it to the WebSocket transport, and `transportDrain` means that
transport's send callback ran. None proves remote TCP acknowledgement or
physical arrival. `rawBefore`/`rawAfter` and `wsBefore`/`wsAfter` measure
different queues. The browser/server clock offset is estimated from diagnostic
ping samples, with uncertainty of at least half the corrected RTT under
symmetric paths. Comparing successive server and browser intervals does not
require clock synchronization.

Run local checks from this worktree with dependencies installed:

```powershell
node --test tools/tests/*.test.js
node tools/tests/net-diagnostic.bench.js
```

The benchmark uses an in-memory mock connection. It measures probe cost, not
production network latency. A later VPS trial requires separate approval.
Use one authorized test account, observe CPU/RSS and errors, collect the
server file and browser JSON, and compare the matched session and tick IDs.
If `transportDrain` is prompt but browser parser entry is late, a packet
capture or browser NetLog is still needed to distinguish TCP delivery from
browser network-thread scheduling.
