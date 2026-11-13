const { app, BrowserWindow, ipcMain, clipboard } = require('electron')
const { pathToFileURL } = require('url')
const path = require("path");
const fs = require("fs");
const VaultStore = require("./vault-store");

let mainWindow = null;
let alertWindow = null;
let authenticated = false;

// ---------- vault state (key + data only exist in memory while unlocked) ----------

const vaultFile = () => path.join(app.getPath('userData'), 'vault.enc');
const legacyFile = () => path.join(__dirname, 'vault/passwords.json');
const MIN_PASSWORD_LENGTH = 8;

let vaultKey = null;
let vaultData = null;
let failedAttempts = 0;
let lockedUntil = 0;

const IDLE_LOCK_MS = Number(process.env.ACH_IDLE_MS) || 2 * 60 * 1000;
const CLIPBOARD_CLEAR_MS = Number(process.env.ACH_CLIP_MS) || 20 * 1000;
let idleTimer = null;
let clipboardTimer = null;
let copiedValue = null;

// In recent Electron versions clipboard reads are async.
async function clearClipboardNow() {
    clearTimeout(clipboardTimer);
    clipboardTimer = null;
    const value = copiedValue;
    copiedValue = null;
    // only wipe it if it still holds what we put there
    if (value !== null && (await clipboard.readText()) === value) await clipboard.clear();
}

function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!authenticated) return;
    idleTimer = setTimeout(async () => {
        lock();
        if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
        if (mainWindow && !mainWindow.isDestroyed()) {
            await mainWindow.loadFile(path.join(__dirname, 'index.html'));
        }
    }, IDLE_LOCK_MS);
}

function lock() {
    clearTimeout(idleTimer);
    clearClipboardNow();
    authenticated = false;
    if (vaultKey) vaultKey.fill(0);
    vaultKey = null;
    vaultData = null;
}

// Slow down brute force: after 3 failures, wait 2^(n-3) seconds (max 60s).
function registerFailure() {
    failedAttempts++;
    if (failedAttempts >= 3) {
        lockedUntil = Date.now() + Math.min(2 ** (failedAttempts - 3), 60) * 1000;
    }
}

// ---------- entry operations (validate, persist, then swap in-memory data) ----------

const MAX_FIELD = 500;
const RESERVED = new Set(['__proto__', 'constructor', 'prototype']);

function cleanEntry(platform, id, pwd) {
    if (typeof platform !== 'string' || typeof id !== 'string' || typeof pwd !== 'string') return null;
    platform = platform.trim();
    if (!platform || RESERVED.has(platform)) return null;
    if ([platform, id, pwd].some((v) => v.length > MAX_FIELD)) return null;
    return { platform, entry: { id, pwd } };
}

// `change` receives a shallow copy and mutates it; returns an error string or null.
function mutateVault(change) {
    if (!authenticated) throw new Error('Not authenticated');
    const next = Object.assign(Object.create(null), vaultData);
    const error = change(next);
    if (error) return { ok: false, error };
    const plain = Object.assign({}, next);
    VaultStore.save(vaultFile(), vaultKey, plain); // throws -> in-memory data untouched
    vaultData = plain;
    return { ok: true, data: vaultData };
}

// ---------- IPC (registered once, not per window) ----------

const APP_URL = pathToFileURL(__dirname).href;

// Only pages shipped inside the app may call IPC handlers.
function handle(channel, fn) {
    ipcMain.handle(channel, (event, ...args) => {
        const url = event.senderFrame && event.senderFrame.url;
        if (!url || !url.startsWith(APP_URL)) throw new Error('Blocked IPC from untrusted frame');
        return fn(event, ...args);
    });
}

const secureWebPreferences = () => ({
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
});

// No popups, and no navigation away from the app's own files.
function lockDown(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e, url) => {
        if (!url.startsWith(APP_URL)) e.preventDefault();
    });
}

function registerIpc() {
    handle('showAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) return;
        alertWindow = new BrowserWindow({
            width: 1000,
            show: false,
            parent: mainWindow,
            modal: true,
            frame: false,
            webPreferences: secureWebPreferences()
        });
        lockDown(alertWindow);
        alertWindow.on('closed', () => { alertWindow = null; });
        alertWindow.loadFile(path.join(__dirname, 'windows/alert-window/unauth-message.html'));
    })

    handle('closeAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
    });

    handle('setHeight', async (event, height) => {
        if (!alertWindow || alertWindow.isDestroyed()) return;
        alertWindow.setSize(1000, Number(height) || 300);
        alertWindow.show();
    });

    handle('vaultStatus', async () => ({ exists: VaultStore.exists(vaultFile()) }));

    handle('setupVault', async (event, password) => {
        if (VaultStore.exists(vaultFile())) return { ok: false, error: 'Vault already exists' };
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
        }
        // import the old plaintext vault the first time, if present
        let initial = {};
        try { initial = JSON.parse(fs.readFileSync(legacyFile(), 'utf8')); } catch {}
        vaultKey = VaultStore.create(vaultFile(), password, initial);
        vaultData = initial;
        authenticated = true;
        resetIdleTimer();
        await mainWindow.loadFile(path.join(__dirname, 'screens/main-screen/main-screen.html'));
        return { ok: true };
    });

    handle('logIn', async (event, password) => {
        const wait = lockedUntil - Date.now();
        if (wait > 0) return { ok: false, wait: Math.ceil(wait / 1000) };
        if (typeof password !== 'string') return { ok: false };
        const result = VaultStore.unlock(vaultFile(), password);
        if (!result) {
            registerFailure();
            return { ok: false };
        }
        failedAttempts = 0;
        vaultKey = result.key;
        vaultData = result.data;
        authenticated = true;
        resetIdleTimer();
        await mainWindow.loadFile(path.join(__dirname, 'screens/main-screen/main-screen.html'));
        return { ok: true };
    });

    handle('logOut', async () => {
        lock();
        await mainWindow.loadFile(path.join(__dirname, 'index.html'));
    });

    handle('addEntry', async (event, platform, id, pwd) => {
        const c = cleanEntry(platform, id, pwd);
        if (!c) return { ok: false, error: 'Invalid entry' };
        return mutateVault((d) => {
            if (c.platform in d) return 'That platform already exists';
            d[c.platform] = c.entry;
        });
    });

    handle('updateEntry', async (event, oldPlatform, platform, id, pwd) => {
        const c = cleanEntry(platform, id, pwd);
        if (!c || typeof oldPlatform !== 'string') return { ok: false, error: 'Invalid entry' };
        return mutateVault((d) => {
            if (!(oldPlatform in d)) return 'Entry not found';
            if (c.platform !== oldPlatform && c.platform in d) return 'That platform already exists';
            // rebuild so the edited entry keeps its position
            for (const k of Object.keys(d)) {
                const v = d[k];
                delete d[k];
                d[k === oldPlatform ? c.platform : k] = k === oldPlatform ? c.entry : v;
            }
        });
    });

    handle('deleteEntry', async (event, platform) => {
        if (typeof platform !== 'string') return { ok: false, error: 'Invalid entry' };
        return mutateVault((d) => {
            if (!(platform in d)) return 'Entry not found';
            delete d[platform];
        });
    });

    handle('activity', async () => { resetIdleTimer(); });

    handle('copyPassword', async (event, platform) => {
        if (!authenticated) throw new Error('Not authenticated');
        if (typeof platform !== 'string' || !(platform in vaultData)) return { ok: false };
        clearClipboardNow();
        copiedValue = vaultData[platform].pwd;
        clipboard.writeText(copiedValue);
        clipboardTimer = setTimeout(clearClipboardNow, CLIPBOARD_CLEAR_MS);
        return { ok: true, seconds: CLIPBOARD_CLEAR_MS / 1000 };
    });

    handle('readData', async () => {
        if (!authenticated) throw new Error('Not authenticated');
        return vaultData;
    });
}

function createWindow() {
    lock();
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: secureWebPreferences()
    })
    lockDown(mainWindow);
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadFile(path.join(__dirname, 'index.html'))
}

app.whenReady().then(() => {
    registerIpc();
    createWindow()

    // macOS: re-create the window when the dock icon is clicked and none are open
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// quit when all windows are closed, except on macOS
app.on('before-quit', lock)

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})
