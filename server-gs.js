// ============================================
// Blastridge - server-gs.js
// Sends the state packet (public/netproto.js) so that the part every client shares is encoded ONCE per tick and
// each client only gets its own small row appended: no per-client encode of the whole packet, and no private rows
// of the other players on the wire.
//
// socket.io-msgpack-parser sends an event as one msgpack map { type: 2, data: [event, payload], nsp: '/' }. The
// payload here is an array [shared..., own]. The shared elements are encoded once as an array; each client's packet
// is  prefix + array header + shared elements + own row + suffix  (a few Buffer copies). createGsWriter checks at
// start that this is byte-for-byte what the parser itself would produce; if not (another msgpack library, another
// layout) it falls back to a normal per-client emit, so the game works either way, only slower.
// ============================================
const ARNet = require('./public/netproto');

function createGsWriter(msgpack, sharedCount) {
    // A probe is observational: even a faulty implementation cannot prevent gs2.
    function probe(diag, method, ...args) {
        if (diag) try { diag[method](...args); } catch (_) { try { diag.fail(_); } catch (_) {} }
    }
    const event = ARNet.EVENT, total = sharedCount + 1;
    let prefix = null, suffix = null, header = null;
    try {
        if (total > 15) throw new Error('payload array no longer fits a fixarray header');
        const probe = msgpack.encode({ type: 2, data: [event, new Array(total).fill(0)], nsp: '/' });
        const ev = msgpack.encode(event);
        const at = probe.indexOf(ev);
        const arrAt = at + ev.length;
        if (at < 0 || probe[arrAt] !== (0x90 | total)) throw new Error('unexpected packet layout');
        prefix = Buffer.from(probe.subarray(0, arrAt));
        suffix = Buffer.from(probe.subarray(arrAt + 1 + total));
        header = Buffer.from([0x90 | total]);
        // self check against the parser's own encoding of a packet with real content
        const shared = [7, [1, 2, 3, 4, 5, 6], [], [9, 400, 500, 12, 100, 1], [], [1650, 300], null];
        const ownRow = [10, 10, 0, 12345, 3, 96];
        const want = msgpack.encode({ type: 2, data: [event, shared.concat([ownRow])], nsp: '/' });
        const got = Buffer.concat([prefix, header, msgpack.encode(shared).subarray(1), msgpack.encode(ownRow), suffix]);
        if (!want.equals(got) || shared.length !== sharedCount) throw new Error('assembled packet differs from the parser\'s');
    } catch (e) {
        console.warn('[gs] envio per-client simplu (' + e.message + ')');
        prefix = null;
    }
    const fast = prefix !== null;

    return {
        fast,
        // sharedArr: the shared payload elements (sharedCount of them). Returns what send() needs.
        begin(sharedArr) { return fast ? msgpack.encode(sharedArr).subarray(1) : sharedArr; },
        // socket: a socket.io server Socket; ownRow: its own row. Bytes written for the PERF probe.
        send(socket, shared, ownRow, diag, slot) {
            if (!fast) {
                probe(diag, 'decision', slot, 'fallback');
                socket.emit(event, shared.concat([ownRow])); return 0;
            }
            const conn = socket.client;
            if (conn.conn.readyState !== 'open') {
                probe(diag, 'decision', slot, 'closed');
                return 0;
            }
            const ownStart = diag ? performance.now() : 0;
            const ownBytes = msgpack.encode(ownRow);
            const ownEncodeEnd = diag ? performance.now() : 0;
            const buf = Buffer.concat([prefix, header, shared, ownBytes, suffix]);
            const ownEnd = diag ? performance.now() : 0;
            probe(diag, 'beforeWrite', slot, buf, ownStart, ownEncodeEnd, ownEnd, conn);
            conn.writeToEngine(buf, {});
            probe(diag, 'afterWrite', slot, conn);
            return buf.length;
        },
    };
}

module.exports = { createGsWriter };
