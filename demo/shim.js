// Browser stand-in for the Electron side (preload.js + main.js).
// It defines the same window.mainWindow / homeWindow / alertWindow API the real
// pages call, so the desktop UI runs unchanged on a static host.
//
// DEMO ONLY: the real app keeps the key in the main process's memory. A web page has
// no such place that survives page navigation, so the derived key lives in
// sessionStorage here. Never put real passwords into the demo.
(function () {
    'use strict';

    const VAULT_KEY = 'ach-demo-vault';
    const SESSION_KEY = 'ach-demo-session-key';
    const SEEDED_KEY = 'ach-demo-seeded';
    const DEMO_PASSWORD = 'one-ring-to-rule-1';
    const MIN_PASSWORD_LENGTH = 8;
    const IDLE_LOCK_MS = 2 * 60 * 1000;
    const CLIPBOARD_CLEAR_MS = 20 * 1000;
    // scrypt parameters identical to vault-store.js, so demo files are interchangeable with the desktop app
    const SCRYPT = { costFactor: 2 ** 15, blockSize: 8, parallelism: 1, hashLength: 32 };

    const DEMO_ENTRIES = {
        github: { id: 'frodo.baggins@shire.me', pwd: 'Sting-Glows-Blue-77' },
        netflix: { id: 'bilbo@bagend.net', pwd: 'second-breakfast!' },
        spotify: { id: 'samwise', pwd: 'po-ta-toes-4ever' },
        mordor: { id: 'sauron', pwd: 'one-does-not-simply' },
        rivendell: { id: 'elrond@imladris.org', pwd: 'Valley-of-Song-2024' },
    };

    const enc = new TextEncoder();
    const dec = new TextDecoder();

    // ---------- helpers ----------

    // bytes -> "0a1b2c..."
    function toHex(bytes) {
        return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }

    // "0a1b2c..." -> bytes
    function fromHex(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        }
        return bytes;
    }

    // Browsers can block storage (private mode, strict settings), so every call is wrapped in try/catch.
    function safeStorage(getStorage) {
        return {
            get: (key) => { try { return getStorage().getItem(key); } catch { return null; } },
            set: (key, value) => { try { getStorage().setItem(key, value); } catch { /* blocked: ignore */ } },
            del: (key) => { try { getStorage().removeItem(key); } catch { /* blocked: ignore */ } },
        };
    }
    const store = safeStorage(() => localStorage);     // survives closing the tab: the encrypted vault
    const session = safeStorage(() => sessionStorage); // cleared when the tab closes: the unlocked session

    // ---------- crypto (same file format as vault-store.js: { v, salt, iv, tag, ct } in hex) ----------

    async function deriveKeyBytes(password, saltBytes) {
        return globalThis.hashwasm.scrypt({ password, salt: saltBytes, ...SCRYPT, outputType: 'binary' });
    }

    const importAesKey = (bytes) => crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);

    async function encryptVault(keyBytes, saltBytes, data) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await importAesKey(keyBytes);
        const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data))));
        // WebCrypto appends the 16-byte tag to the ciphertext; the file format stores them separately
        return {
            v: 1,
            salt: toHex(saltBytes),
            iv: toHex(iv),
            tag: toHex(out.slice(out.length - 16)),
            ct: toHex(out.slice(0, out.length - 16)),
        };
    }

    async function decryptVault(keyBytes, file) {
        const key = await importAesKey(keyBytes);
        const ct = fromHex(file.ct);
        const tag = fromHex(file.tag);
        const joined = new Uint8Array(ct.length + tag.length);
        joined.set(ct);
        joined.set(tag, ct.length);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromHex(file.iv) }, key, joined);
        return JSON.parse(dec.decode(pt));
    }

    const MAX_FILE_BYTES = 10 * 1024 * 1024;
    const isHex = (value, length) =>
        typeof value === 'string' && /^[0-9a-f]+$/i.test(value) && (length === undefined || value.length === length);

    // Structure check only: does this look like a vault file? Same rules as vault-store.js.
    function isValidFile(text) {
        if (typeof text !== 'string' || text.length > MAX_FILE_BYTES) return false;
        try {
            const file = JSON.parse(text);
            return file.v === 1 && isHex(file.salt, 32) && isHex(file.iv, 24) && isHex(file.tag, 32) && isHex(file.ct);
        } catch {
            return false; // not JSON
        }
    }

    async function createVault(password, data) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const keyBytes = await deriveKeyBytes(password, salt);
        store.set(VAULT_KEY, JSON.stringify(await encryptVault(keyBytes, salt, data)));
        return keyBytes;
    }

    // returns { keyBytes, data } or null when the password is wrong
    async function unlockVault(password) {
        try {
            const file = JSON.parse(store.get(VAULT_KEY));
            const keyBytes = await deriveKeyBytes(password, fromHex(file.salt));
            return { keyBytes, data: await decryptVault(keyBytes, file) };
        } catch {
            return null;
        }
    }

    async function saveVault(keyBytes, data) {
        const file = JSON.parse(store.get(VAULT_KEY));
        store.set(VAULT_KEY, JSON.stringify(await encryptVault(keyBytes, fromHex(file.salt), data)));
    }

    // ---------- session (unlocked state survives page navigation via sessionStorage; demo only) ----------

    const saveSessionKey = (bytes) => session.set(SESSION_KEY, toHex(bytes));
    const sessionKeyBytes = () => { const h = session.get(SESSION_KEY); return h ? fromHex(h) : null; };
    const isAuthenticated = () => !!session.get(SESSION_KEY);

    async function currentData() {
        const keyBytes = sessionKeyBytes();
        if (!keyBytes) throw new Error('Not authenticated');
        try {
            return await decryptVault(keyBytes, JSON.parse(store.get(VAULT_KEY)));
        } catch {
            session.del(SESSION_KEY);
            throw new Error('Not authenticated');
        }
    }

    // ---------- navigation (the desktop app calls loadFile; here pages are separate documents) ----------

    const base = (document.currentScript && document.currentScript.dataset.root) || '';
    const goLogin = () => { location.href = base + 'index.html'; };
    const goVault = () => { location.href = base + 'screens/main-screen/main-screen.html'; };

    // ---------- idle lock, brute-force throttle, clipboard ----------

    let idleTimer = null;
    function resetIdle() {
        clearTimeout(idleTimer);
        if (!isAuthenticated()) return;
        idleTimer = setTimeout(() => { session.del(SESSION_KEY); goLogin(); }, IDLE_LOCK_MS);
    }

    // throttle state is kept in sessionStorage so a page reload does not reset it
    const THROTTLE_KEY = 'ach-demo-throttle';
    function throttle() {
        try { return JSON.parse(session.get(THROTTLE_KEY)) || { fails: 0, until: 0 }; } catch { return { fails: 0, until: 0 }; }
    }
    function registerFailure() {
        const t = throttle();
        t.fails += 1;
        if (t.fails >= 3) t.until = Date.now() + Math.min(2 ** (t.fails - 3), 60) * 1000;
        session.set(THROTTLE_KEY, JSON.stringify(t));
    }
    const clearThrottle = () => session.del(THROTTLE_KEY);

    let clipboardTimer = null;
    let copiedValue = null;
    async function clearClipboardNow() {
        clearTimeout(clipboardTimer);
        const value = copiedValue;
        copiedValue = null;
        if (value === null) return;
        try {
            // only wipe it if it still holds what we put there (needs clipboard-read permission; skipped if denied)
            if ((await navigator.clipboard.readText()) === value) await navigator.clipboard.writeText('');
        } catch { /* permission denied: leave the clipboard alone */ }
    }

    // ---------- entry changes ----------

    async function commit(result) {
        if (result.error) return { ok: false, error: result.error };
        await saveVault(sessionKeyBytes(), result.data);
        return { ok: true, data: result.data };
    }

    // ---------- demo data ----------

    async function seedDemo() {
        await createVault(DEMO_PASSWORD, DEMO_ENTRIES);
        store.set(SEEDED_KEY, '1');
    }

    async function ensureVault() {
        const params = new URLSearchParams(location.search);
        if (params.has('reset')) { resetEverything(); }
        if (params.has('setup')) { resetEverything(); store.set(SEEDED_KEY, 'no-seed'); }
        if (store.get(VAULT_KEY) === null && store.get(SEEDED_KEY) !== 'no-seed') await seedDemo();
    }

    function resetEverything() {
        store.del(VAULT_KEY);
        store.del(SEEDED_KEY);
        session.del(SESSION_KEY);
        clearThrottle();
    }

    // runs before any page script asks for status; pages await mainWindow.status()
    const ready = ensureVault();

    // ---------- the API the pages call ----------

    window.mainWindow = {
        status: async () => { await ready; return { exists: store.get(VAULT_KEY) !== null }; },

        setup: async (password) => {
            await ready;
            if (store.get(VAULT_KEY) !== null) return { ok: false, error: 'Vault already exists' };
            if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
                return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
            }
            saveSessionKey(await createVault(password, {}));
            store.set(SEEDED_KEY, 'no-seed');
            goVault();
            return { ok: true };
        },

        welcome: async (password) => {
            await ready;
            const t = throttle();
            const wait = t.until - Date.now();
            if (wait > 0) return { ok: false, wait: Math.ceil(wait / 1000) };
            if (typeof password !== 'string') return { ok: false };
            const result = await unlockVault(password);
            if (!result) { registerFailure(); return { ok: false }; }
            clearThrottle();
            saveSessionKey(result.keyBytes);
            goVault();
            return { ok: true };
        },

        bye_bye: async () => {
            await clearClipboardNow();
            session.del(SESSION_KEY);
            goLogin();
        },

        importVault: async () => importVault(),
    };

    window.homeWindow = {
        read: async () => currentData(),
        add: async (platform, id, pwd) => commit(Entries.add(await currentData(), platform, id, pwd)),
        update: async (oldPlatform, platform, id, pwd) => commit(Entries.update(await currentData(), oldPlatform, platform, id, pwd)),
        remove: async (platform) => commit(Entries.remove(await currentData(), platform)),
        activity: async () => { resetIdle(); },

        copy: async (platform) => {
            const data = await currentData();
            if (typeof platform !== 'string' || !Object.hasOwn(data, platform)) return { ok: false };
            await clearClipboardNow();
            copiedValue = data[platform].pwd;
            try { await navigator.clipboard.writeText(copiedValue); } catch { return { ok: false }; }
            clipboardTimer = setTimeout(clearClipboardNow, CLIPBOARD_CLEAR_MS);
            return { ok: true, seconds: CLIPBOARD_CLEAR_MS / 1000 };
        },

        changePassword: async (current, next) => {
            const data = await currentData();
            const t = throttle();
            const wait = t.until - Date.now();
            if (wait > 0) return { ok: false, error: `Too many attempts, wait ${Math.ceil(wait / 1000)}s` };
            if (typeof current !== 'string' || typeof next !== 'string') return { ok: false, error: 'Invalid input' };
            if (!(await unlockVault(current))) { registerFailure(); return { ok: false, error: 'Current password is wrong' }; }
            clearThrottle();
            if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
            if (next === current) return { ok: false, error: 'New password must be different' };
            saveSessionKey(await createVault(next, data));
            store.set(SEEDED_KEY, 'no-seed'); // demo password no longer valid
            resetIdle();
            return { ok: true };
        },

        exportVault: async () => {
            if (!isAuthenticated()) throw new Error('Not authenticated');
            const blob = new Blob([store.get(VAULT_KEY)], { type: 'application/octet-stream' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `ach-vault-${new Date().toISOString().slice(0, 10)}.enc`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
            return { ok: true };
        },

        importVault: async () => importVault(),
    };

    function pickFile() {
        return new Promise((resolve) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.enc';
            input.addEventListener('change', () => resolve(input.files[0] || null));
            input.addEventListener('cancel', () => resolve(null));
            input.click();
        });
    }

    async function importVault() {
        const hasVault = store.get(VAULT_KEY) !== null;
        if (hasVault && !isAuthenticated()) return { ok: false, error: 'Log in before importing' };
        const file = await pickFile();
        if (!file) return { ok: false, canceled: true };
        const text = await file.text();
        if (!isValidFile(text)) return { ok: false, error: 'That is not a valid vault file' };
        if (hasVault && !confirm('Replace the current vault with the imported one?\n\nYou will need the master password of the imported vault to log in.')) {
            return { ok: false, canceled: true };
        }
        store.set(VAULT_KEY, text);
        store.set(SEEDED_KEY, 'no-seed');
        session.del(SESSION_KEY);
        clearThrottle();
        goLogin();
        return { ok: true };
    }

    // ---------- "you shall not pass" popup: the real alert page in an iframe overlay ----------

    let overlay = null;
    window.alertWindow = {
        show: async () => {
            if (window.parent !== window) return; // already inside the popup
            if (overlay) return;
            overlay = document.createElement('div');
            overlay.className = 'demo-overlay';
            const frame = document.createElement('iframe');
            frame.className = 'demo-overlay-frame';
            frame.title = 'You shall not pass';
            frame.src = base + 'windows/alert-window/unauth-message.html';
            overlay.appendChild(frame);
            document.body.appendChild(overlay);
        },
        // inside the iframe these talk to the parent page
        close: async () => { parent.postMessage({ demo: 'closeAlert' }, location.origin); },
        setHeight: async (height) => { parent.postMessage({ demo: 'alertHeight', height }, location.origin); },
    };

    window.addEventListener('message', (e) => {
        if (e.origin !== location.origin || !e.data || !overlay) return;
        const frame = overlay.querySelector('iframe');
        if (e.data.demo === 'closeAlert') { overlay.remove(); overlay = null; }
        if (e.data.demo === 'alertHeight' && frame) {
            frame.style.height = Math.min(Number(e.data.height) || 600, window.innerHeight * 0.95) + 'px';
            overlay.classList.add('ready');
        }
    });

    // ---------- demo badge ----------

    window.addEventListener('DOMContentLoaded', async () => {
        if (window.parent !== window) return; // not inside the popup iframe
        const badge = document.createElement('div');
        badge.className = 'demo-badge';
        const text = document.createElement('span');
        text.textContent = 'DEMO · fake data stored in your browser';
        const reset = document.createElement('a');
        reset.href = base + 'index.html?reset';
        reset.textContent = 'reset';
        badge.append(text, reset);
        document.body.appendChild(badge);

        // the vault page needs an unlocked session (the desktop app guards this in the main process)
        if (document.getElementById('table') && !isAuthenticated()) { goLogin(); return; }
        // idle lock only matters once logged in; start the timer
        resetIdle();

        await ready; // the hint depends on whether the demo vault was just seeded

        // login page: a collapsed hint box, so the "you shall not pass" gag still works by default
        const container = document.querySelector('.container');
        if (container && document.getElementById('password')) {
            const hint = document.createElement('details');
            hint.className = 'demo-hint';

            const summary = document.createElement('summary');
            summary.textContent = 'Demo hints';

            const list = document.createElement('ul');
            const addItem = (text, code) => {
                const item = document.createElement('li');
                item.append(text);
                if (code) {
                    const codeElement = document.createElement('code');
                    codeElement.textContent = code;
                    item.append(codeElement);
                }
                list.append(item);
            };

            // the demo password only applies while the original demo vault is untouched
            if (store.get(SEEDED_KEY) === '1') addItem('Master password: ', DEMO_PASSWORD);
            addItem('Press Enter first and see what happens. The real way in is Ctrl+Enter.');

            const setupItem = document.createElement('li');
            const setupLink = document.createElement('a');
            setupLink.href = base + 'index.html?setup';
            setupLink.textContent = 'Try the first-run setup instead';
            setupItem.append(setupLink);
            list.append(setupItem);

            hint.append(summary, list);
            container.append(hint);
        }
    });

})();
