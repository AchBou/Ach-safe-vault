const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron')
const { pathToFileURL } = require('url')
const path = require("path");
const fs = require("fs");
const VaultStore = require("./vault-store");
const Entries = require("./entries");

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

// ---------- persisting entry changes ----------

// `result` is an Entries function result: { data } or { error }.
function commit(result) {
    if (!authenticated) throw new Error('Not authenticated');
    if (result.error) return { ok: false, error: result.error };
    VaultStore.save(vaultFile(), vaultKey, result.data); // throws -> in-memory data untouched
    vaultData = result.data;
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

    handle('addEntry', async (event, platform, id, pwd) =>
        commit(Entries.add(vaultData, platform, id, pwd)));

    handle('updateEntry', async (event, oldPlatform, platform, id, pwd) =>
        commit(Entries.update(vaultData, oldPlatform, platform, id, pwd)));

    handle('deleteEntry', async (event, platform) =>
        commit(Entries.remove(vaultData, platform)));

    // ----- export / import of the encrypted vault file -----

    handle('exportVault', async () => {
        if (!authenticated) throw new Error('Not authenticated');
        resetIdleTimer();
        const stamp = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export encrypted vault',
            defaultPath: `ach-vault-${stamp}.enc`,
            filters: [{ name: 'Encrypted vault', extensions: ['enc'] }],
        });
        resetIdleTimer();
        if (canceled || !filePath) return { ok: false, canceled: true };
        fs.copyFileSync(vaultFile(), filePath);
        await dialog.showMessageBox(mainWindow, {
            type: 'info',
            message: 'Vault exported',
            detail: `${filePath}

The file is encrypted. Opening it on another device needs your master password.`,
        });
        resetIdleTimer();
        return { ok: true, path: filePath };
    });

    handle('importVault', async () => {
        const hasVault = VaultStore.exists(vaultFile());
        // replacing an existing vault requires being logged in
        if (hasVault && !authenticated) return { ok: false, error: 'Log in before importing' };
        resetIdleTimer();
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Import encrypted vault',
            properties: ['openFile'],
            filters: [{ name: 'Encrypted vault', extensions: ['enc'] }],
        });
        resetIdleTimer();
        if (canceled || !filePaths.length) return { ok: false, canceled: true };

        const incoming = fs.readFileSync(filePaths[0]);
        if (!VaultStore.isValidFile(incoming)) return { ok: false, error: 'That is not a valid vault file' };

        if (hasVault) {
            const { response } = await dialog.showMessageBox(mainWindow, {
                type: 'warning',
                buttons: ['Cancel', 'Replace vault'],
                defaultId: 0,
                cancelId: 0,
                title: 'Replace current vault?',
                message: 'Replace the current vault with the imported one?',
                detail: 'A backup of the current vault is kept next to it. You will need the master password of the imported vault to log in.',
            });
            resetIdleTimer();
            if (response !== 1) return { ok: false, canceled: true };
            const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
            fs.copyFileSync(vaultFile(), `${vaultFile()}.bak-${stamp}`);
        }

        fs.mkdirSync(path.dirname(vaultFile()), { recursive: true });
        fs.writeFileSync(vaultFile() + '.tmp', incoming);
        fs.renameSync(vaultFile() + '.tmp', vaultFile());
        lock();
        failedAttempts = 0;
        lockedUntil = 0;
        await mainWindow.loadFile(path.join(__dirname, 'index.html'));
        return { ok: true };
    });

    handle('changePassword', async (event, current, next) => {
        if (!authenticated) throw new Error('Not authenticated');
        const wait = lockedUntil - Date.now();
        if (wait > 0) return { ok: false, error: `Too many attempts, wait ${Math.ceil(wait / 1000)}s` };
        if (typeof current !== 'string' || typeof next !== 'string') return { ok: false, error: 'Invalid input' };
        if (!VaultStore.unlock(vaultFile(), current)) {
            registerFailure();
            return { ok: false, error: 'Current password is wrong' };
        }
        failedAttempts = 0;
        if (next.length < MIN_PASSWORD_LENGTH) return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
        if (next === current) return { ok: false, error: 'New password must be different' };
        // new salt + new key; the file is replaced atomically
        const oldKey = vaultKey;
        vaultKey = VaultStore.create(vaultFile(), next, vaultData);
        oldKey.fill(0);
        resetIdleTimer();
        return { ok: true };
    });

    handle('activity', async () => { resetIdleTimer(); });

    handle('copyPassword', async (event, platform) => {
        if (!authenticated) throw new Error('Not authenticated');
        if (typeof platform !== 'string' || !Object.prototype.hasOwnProperty.call(vaultData, platform)) return { ok: false };
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
