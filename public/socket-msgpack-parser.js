/*!
 * socket.io msgpack browser bundle
 * Combines: notepack.io 2.2.0 + component-emitter + socket.io-msgpack-parser 3.0.2
 */
(function (global) {
    'use strict';

    // ── notepack.io (browser build) ──────────────────────────────────────────────
    var notepack = (function () {
        function DecodeBuffer(buf) {
            this.offset = 0;
            if (buf instanceof ArrayBuffer) { this.buffer = buf; this.view = new DataView(buf); }
            else if (ArrayBuffer.isView(buf)) { this.buffer = buf.buffer; this.view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); }
            else throw new Error('Invalid argument');
        }
        function utf8Write(view, offset, str) {
            var c;
            for (var i = 0, l = str.length; i < l; i++) {
                c = str.charCodeAt(i);
                if (c < 0x80) { view.setUint8(offset++, c); }
                else if (c < 0x800) { view.setUint8(offset++, 0xc0 | (c >> 6)); view.setUint8(offset++, 0x80 | (c & 0x3f)); }
                else if (c < 0xd800 || c >= 0xe000) { view.setUint8(offset++, 0xe0 | (c >> 12)); view.setUint8(offset++, 0x80 | ((c >> 6) & 0x3f)); view.setUint8(offset++, 0x80 | (c & 0x3f)); }
                else { i++; c = 0x10000 + (((c & 0x3ff) << 10) | (str.charCodeAt(i) & 0x3ff)); view.setUint8(offset++, 0xf0 | (c >> 18)); view.setUint8(offset++, 0x80 | ((c >> 12) & 0x3f)); view.setUint8(offset++, 0x80 | ((c >> 6) & 0x3f)); view.setUint8(offset++, 0x80 | (c & 0x3f)); }
            }
        }
        function utf8ByteCount(str) {
            var c, count = 0;
            for (var i = 0, l = str.length; i < l; i++) {
                c = str.charCodeAt(i);
                if (c < 0x80) count += 1;
                else if (c < 0x800) count += 2;
                else if (c < 0xd800 || c >= 0xe000) count += 3;
                else { i++; count += 4; }
            }
            return count;
        }
        function encode(value) {
            var bytes = [], floats = [], size = _encode(bytes, floats, value);
            var buf = new ArrayBuffer(size), view = new DataView(buf);
            var floatIndex = 0, floatNext = floats.length > 0 ? floats[0].offset : -1;
            for (var i = 0, extra = 0, fi = 0; i < bytes.length; i++) {
                view.setUint8(extra + i, bytes[i]);
                if (i + 1 === floatNext) {
                    var f = floats[floatIndex++];
                    var dest = extra + f.offset;
                    if (f.buf) { var u8 = new Uint8Array(f.buf); for (var k = 0; k < f.len; k++) view.setUint8(dest + k, u8[k]); }
                    else if (f.str) utf8Write(view, dest, f.str);
                    else if (f.float !== undefined) view.setFloat64(dest, f.float);
                    extra += f.len;
                    floatNext = floatIndex < floats.length ? floats[floatIndex].offset : -1;
                }
            }
            return buf;
        }
        function _encode(bytes, floats, value) {
            var type = typeof value, size = 0, len = 0, hi = 0, lo = 0;
            if (type === 'string') {
                len = utf8ByteCount(value);
                if (len < 32) { bytes.push(0xa0 | len); size = 1; }
                else if (len < 256) { bytes.push(0xd9, len); size = 2; }
                else if (len < 65536) { bytes.push(0xda, len >> 8, len); size = 3; }
                else { bytes.push(0xdb, len >> 24, len >> 16, len >> 8, len); size = 5; }
                floats.push({ str: value, len: len, offset: bytes.length });
                return size + len;
            }
            if (type === 'number') {
                if (Math.floor(value) === value && isFinite(value)) {
                    if (value >= 0) {
                        if (value < 128) { bytes.push(value); return 1; }
                        if (value < 256) { bytes.push(0xcc, value); return 2; }
                        if (value < 65536) { bytes.push(0xcd, value >> 8, value); return 3; }
                        if (value < 4294967296) { bytes.push(0xce, value >>> 24, value >>> 16, value >>> 8, value); return 5; }
                        hi = (value / Math.pow(2, 32)) >> 0; lo = value >>> 0;
                        bytes.push(0xcf, hi >> 24, hi >> 16, hi >> 8, hi, lo >> 24, lo >> 16, lo >> 8, lo); return 9;
                    } else {
                        if (value >= -32) { bytes.push(value); return 1; }
                        if (value >= -128) { bytes.push(0xd0, value); return 2; }
                        if (value >= -32768) { bytes.push(0xd1, value >> 8, value); return 3; }
                        if (value >= -2147483648) { bytes.push(0xd2, value >> 24, value >> 16, value >> 8, value); return 5; }
                        hi = Math.floor(value / Math.pow(2, 32)); lo = value >>> 0;
                        bytes.push(0xd3, hi >> 24, hi >> 16, hi >> 8, hi, lo >> 24, lo >> 16, lo >> 8, lo); return 9;
                    }
                }
                bytes.push(0xcb); floats.push({ float: value, len: 8, offset: bytes.length }); return 9;
            }
            if (type === 'object') {
                if (value === null) { bytes.push(0xc0); return 1; }
                if (Array.isArray(value)) {
                    len = value.length;
                    if (len < 16) { bytes.push(0x90 | len); size = 1; }
                    else if (len < 65536) { bytes.push(0xdc, len >> 8, len); size = 3; }
                    else { bytes.push(0xdd, len >> 24, len >> 16, len >> 8, len); size = 5; }
                    for (var i = 0; i < len; i++) size += _encode(bytes, floats, value[i]);
                    return size;
                }
                if (value instanceof ArrayBuffer) {
                    len = value.byteLength;
                    if (len < 256) { bytes.push(0xc4, len); size = 2; }
                    else if (len < 65536) { bytes.push(0xc5, len >> 8, len); size = 3; }
                    else { bytes.push(0xc6, len >> 24, len >> 16, len >> 8, len); size = 5; }
                    floats.push({ buf: value, len: len, offset: bytes.length });
                    return size + len;
                }
                var keys = Object.keys(value).filter(function (k) { return typeof value[k] !== 'function'; });
                len = keys.length;
                if (len < 16) { bytes.push(0x80 | len); size = 1; }
                else if (len < 65536) { bytes.push(0xde, len >> 8, len); size = 3; }
                else { bytes.push(0xdf, len >> 24, len >> 16, len >> 8, len); size = 5; }
                for (var i = 0; i < len; i++) {
                    var k = keys[i];
                    size += _encode(bytes, floats, k);
                    size += _encode(bytes, floats, value[k]);
                }
                return size;
            }
            if (type === 'boolean') { bytes.push(value ? 0xc3 : 0xc2); return 1; }
            if (type === 'undefined') { bytes.push(0xd4, 0, 0); return 3; }
            throw new Error('Could not encode');
        }
        DecodeBuffer.prototype.readArray = function (len) {
            var out = new Array(len);
            for (var i = 0; i < len; i++) out[i] = this.read();
            return out;
        };
        DecodeBuffer.prototype.readMap = function (len) {
            var out = {};
            for (var i = 0; i < len; i++) out[this.read()] = this.read();
            return out;
        };
        DecodeBuffer.prototype.readStr = function (len) {
            var str = '', c, view = this.view, o = this.offset, end = o + len;
            while (o < end) {
                c = view.getUint8(o);
                if (!(c & 0x80)) { str += String.fromCharCode(c); o++; }
                else if ((c & 0xe0) === 0xc0) { str += String.fromCharCode((c & 0x1f) << 6 | (view.getUint8(o+1) & 0x3f)); o += 2; }
                else if ((c & 0xf0) === 0xe0) { str += String.fromCharCode((c & 0x0f) << 12 | (view.getUint8(o+1) & 0x3f) << 6 | (view.getUint8(o+2) & 0x3f)); o += 3; }
                else { var cp = ((c & 0x07) << 18 | (view.getUint8(o+1) & 0x3f) << 12 | (view.getUint8(o+2) & 0x3f) << 6 | (view.getUint8(o+3) & 0x3f)) - 0x10000; str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff)); o += 4; }
            }
            this.offset = o; return str;
        };
        DecodeBuffer.prototype.readBuf = function (len) {
            var slice = this.buffer.slice(this.offset, this.offset + len);
            this.offset += len; return slice;
        };
        DecodeBuffer.prototype.read = function () {
            var b = this.view.getUint8(this.offset++), len = 0, hi = 0, lo = 0, type = 0;
            if (b < 0xc0) { if (b < 0x80) return b; if (b < 0x90) return this.readMap(b & 0x0f); if (b < 0xa0) return this.readArray(b & 0x0f); return this.readStr(b & 0x1f); }
            if (b > 0xdf) return -1 * (0xff - b + 1);
            switch (b) {
                case 0xc0: return null;
                case 0xc2: return false;
                case 0xc3: return true;
                case 0xc4: len = this.view.getUint8(this.offset); this.offset += 1; return this.readBuf(len);
                case 0xc5: len = this.view.getUint16(this.offset); this.offset += 2; return this.readBuf(len);
                case 0xc6: len = this.view.getUint32(this.offset); this.offset += 4; return this.readBuf(len);
                case 0xca: { var f = this.view.getFloat32(this.offset); this.offset += 4; return f; }
                case 0xcb: { var f = this.view.getFloat64(this.offset); this.offset += 8; return f; }
                case 0xcc: { var v = this.view.getUint8(this.offset); this.offset += 1; return v; }
                case 0xcd: { var v = this.view.getUint16(this.offset); this.offset += 2; return v; }
                case 0xce: { var v = this.view.getUint32(this.offset); this.offset += 4; return v; }
                case 0xcf: hi = this.view.getUint32(this.offset) * Math.pow(2,32); lo = this.view.getUint32(this.offset+4); this.offset += 8; return hi + lo;
                case 0xd0: { var v = this.view.getInt8(this.offset); this.offset += 1; return v; }
                case 0xd1: { var v = this.view.getInt16(this.offset); this.offset += 2; return v; }
                case 0xd2: { var v = this.view.getInt32(this.offset); this.offset += 4; return v; }
                case 0xd3: hi = this.view.getInt32(this.offset) * Math.pow(2,32); lo = this.view.getUint32(this.offset+4); this.offset += 8; return hi + lo;
                case 0xd4: type = this.view.getInt8(this.offset); this.offset += 1; if (type === 0) { this.offset += 1; return undefined; } return [type, this.readBuf(1)];
                case 0xd9: len = this.view.getUint8(this.offset); this.offset += 1; return this.readStr(len);
                case 0xda: len = this.view.getUint16(this.offset); this.offset += 2; return this.readStr(len);
                case 0xdb: len = this.view.getUint32(this.offset); this.offset += 4; return this.readStr(len);
                case 0xdc: len = this.view.getUint16(this.offset); this.offset += 2; return this.readArray(len);
                case 0xdd: len = this.view.getUint32(this.offset); this.offset += 4; return this.readArray(len);
                case 0xde: len = this.view.getUint16(this.offset); this.offset += 2; return this.readMap(len);
                case 0xdf: len = this.view.getUint32(this.offset); this.offset += 4; return this.readMap(len);
            }
            throw new Error('Could not parse byte 0x' + b.toString(16));
        };
        return {
            encode: encode,
            decode: function (buf) {
                var db = new DecodeBuffer(buf);
                var result = db.read();
                if (db.offset !== db.view.byteLength) throw new Error((db.view.byteLength - db.offset) + ' trailing bytes');
                return result;
            }
        };
    })();

    // ── Emitter (component-emitter, browser-compatible) ──────────────────────────
    function Emitter(obj) { if (obj) return mixin(obj); }
    function mixin(obj) { for (var k in Emitter.prototype) obj[k] = Emitter.prototype[k]; return obj; }
    Emitter.prototype.on = Emitter.prototype.addEventListener = function (ev, fn) {
        this._cbs = this._cbs || {};
        (this._cbs['$' + ev] = this._cbs['$' + ev] || []).push(fn);
        return this;
    };
    Emitter.prototype.off = Emitter.prototype.removeListener = function (ev, fn) {
        this._cbs = this._cbs || {};
        if (!arguments.length) { this._cbs = {}; return this; }
        var cbs = this._cbs['$' + ev]; if (!cbs) return this;
        if (arguments.length === 1) { delete this._cbs['$' + ev]; return this; }
        for (var i = 0; i < cbs.length; i++) { if (cbs[i] === fn || cbs[i].fn === fn) { cbs.splice(i, 1); break; } }
        return this;
    };
    Emitter.prototype.emit = function (ev) {
        this._cbs = this._cbs || {};
        var args = Array.prototype.slice.call(arguments, 1);
        var cbs = (this._cbs['$' + ev] || []).slice();
        for (var i = 0; i < cbs.length; i++) cbs[i].apply(this, args);
        return this;
    };

    // ── socket.io-msgpack-parser (adapted for browser) ────────────────────────────
    var protocol = 5;

    var PacketType = { CONNECT: 0, DISCONNECT: 1, EVENT: 2, ACK: 3, CONNECT_ERROR: 4 };

    function Encoder() {}
    Encoder.prototype.encode = function (packet) {
        return [notepack.encode(packet)];
    };

    function Decoder() {}
    Emitter(Decoder.prototype);
    Decoder.prototype.add = function (obj) {
        var decoded = notepack.decode(obj);
        this.checkPacket(decoded);
        this.emit('decoded', decoded);
    };
    Decoder.prototype.checkPacket = function (decoded) {
        if (!(Number.isInteger(decoded.type) && decoded.type >= 0 && decoded.type <= 4))
            throw new Error('invalid packet type');
        if (typeof decoded.nsp !== 'string')
            throw new Error('invalid namespace');
        var type = decoded.type;
        var dataOk = (type === PacketType.CONNECT) ? (decoded.data === undefined || typeof decoded.data === 'object')
            : (type === PacketType.DISCONNECT) ? decoded.data === undefined
            : (type === PacketType.CONNECT_ERROR) ? (typeof decoded.data === 'string' || typeof decoded.data === 'object')
            : Array.isArray(decoded.data);
        if (!dataOk) throw new Error('invalid payload');
        if (decoded.id !== undefined && !Number.isInteger(decoded.id)) throw new Error('invalid packet id');
    };
    Decoder.prototype.destroy = function () {};

    // ── Expose global ─────────────────────────────────────────────────────────────
    global.msgpackParser = { Encoder: Encoder, Decoder: Decoder, protocol: protocol };

})(typeof self !== 'undefined' ? self : this);
