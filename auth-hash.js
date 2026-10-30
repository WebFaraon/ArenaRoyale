// ============================================
// Blastridge - auth-hash.js
// Password hashing for server.js. Prefers the native `bcrypt` (it hashes on the libuv thread pool and does not block
// the event loop); if that cannot be loaded (no prebuilt binary for the platform, a broken install) it falls back to
// `bcryptjs`, which is pure JavaScript and blocks the whole event loop for ~70 ms per call on the VPS. Both read and
// write the same $2a$ / $2b$ hashes, so nothing is migrated: the accounts' existing $2a$10$ hashes keep verifying
// and new passwords are still cost 10.
// AUTH_BCRYPT=js forces the fallback (tests, comparisons).
// ============================================
const COST = 10;

function load() {
    const js = require('bcryptjs');
    if (process.env.AUTH_BCRYPT === 'js') { console.warn('[Auth] bcrypt nativ dezactivat (AUTH_BCRYPT=js), folosesc bcryptjs'); return { lib: js, native: false }; }
    try {
        const native = require('bcrypt');
        // a loaded binary that does not work must not take the logins down: check it against a hash bcryptjs made
        if (!native.compareSync('probe', js.hashSync('probe', 4))) throw new Error('verificarea de test a esuat');
        console.log('[Auth] bcrypt nativ activ (bcrypt ' + (require('bcrypt/package.json').version || '?') + ')');
        return { lib: native, native: true };
    } catch (e) {
        console.warn('[Auth] bcrypt nativ indisponibil, folosesc bcryptjs (' + String(e && e.message || e).split('\n')[0] + ')');
        return { lib: js, native: false };
    }
}

const { lib, native } = load();

module.exports = {
    native,
    COST,
    compare: (password, hash) => lib.compare(password, hash),
    hash: (password) => lib.hash(password, COST),
};
