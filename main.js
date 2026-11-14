const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const VaultStore = require('./vault-store');
const Entries = require('./entries');

const LOGIN_PAGE = path.join(__dirname, 'index.html');
const VAULT_PAGE = path.join(__dirname, 'screens/main-screen/main-screen.html');
const ALERT_PAGE = path.join(__dirname, 'windows/alert-window/unauth-message.html');
const LEGACY_VAULT_FILE = path.join(__dirname, 'vault/passwords.json');

const MIN_PASSWORD_LENGTH = 8;
// The two timers can be shortened with environment variables, which the tests use.
const IDLE_LOCK_MS = Number(process.env.ACH_IDLE_MS) || 2 * 60 * 1000;
const CLIPBOARD_CLEAR_MS = Number(process.env.ACH_CLIP_MS) || 20 * 1000;

let mainWindow = null;
let alertWindow = null;

// ---------- vault state ----------
// The key and the decrypted data only exist in memory while the vault is unlocked.

let authenticated = false;
let vaultKey = null;
let vaultData = null;

const vaultFile = () => path.join(app.getPath('userData'), 'vault.enc');

function requireLogin() {
    if (!authenticated) throw new Error('Not authenticated');
}

function startSession(key, data) {
    vaultKey = key;
    vaultData = data;
    authenticated = true;
    resetIdleTimer();
}

function lock() {
    clearTimeout(idleTimer);
    clearClipboardNow();
    authenticated = false;
    if (vaultKey) vaultKey.fill(0); // overwrite the key bytes before dropping them
    vaultKey = null;
    vaultData = null;
}

// Saves the result of an Entries function and keeps the in-memory copy in sync.
// `result` is either { data } or { error }.
function commit(result) {
    requireLogin();
    if (result.error) return { ok: false, error: result.error };
    VaultStore.save(vaultFile(), vaultKey, result.data); // if this throws, vaultData is left untouched
    vaultData = result.data;
    return { ok: true, data: vaultData };
}

// ---------- brute-force throttle ----------
// After 3 wrong passwords, wait 1s, then 2s, 4s ... up to 60s before the next try.

let failedAttempts = 0;
let lockedUntil = 0;

function registerFailure() {
    failedAttempts++;
    if (failedAttempts >= 3) {
        const waitSeconds = Math.min(2 ** (failedAttempts - 3), 60);
        lockedUntil = Date.now() + waitSeconds * 1000;
    }
}

function secondsUntilNextTry() {
    return Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
}

function resetThrottle() {
    failedAttempts = 0;
    lockedUntil = 0;
}

// ---------- idle auto-lock ----------

let idleTimer = null;

function resetIdleTimer() {
    clearTimeout(idleTimer);
    if (!authenticated) return;
    idleTimer = setTimeout(async () => {
        lock();
        if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
        if (mainWindow && !mainWindow.isDestroyed()) await mainWindow.loadFile(LOGIN_PAGE);
    }, IDLE_LOCK_MS);
}

// ---------- clipboard auto-clear ----------

let clipboardTimer = null;
let copiedValue = null;

async function clearClipboardNow() {
    clearTimeout(clipboardTimer);
    clipboardTimer = null;
    const value = copiedValue;
    copiedValue = null;
    // Only wipe the clipboard if it still holds the password we put there.
    // (Clipboard reads are async in recent Electron versions.)
    if (value !== null && (await clipboard.readText()) === value) await clipboard.clear();
}

// ---------- window security ----------

const APP_URL = pathToFileURL(__dirname).href;

function secureWebPreferences() {
    return {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
    };
}

// No popups, and no navigation away from the app's own files.
function lockDown(win) {
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (event, url) => {
        if (!url.startsWith(APP_URL)) event.preventDefault();
    });
}

// Registers an IPC handler that only answers pages shipped inside the app.
function handle(channel, handler) {
    ipcMain.handle(channel, (event, ...args) => {
        const url = event.senderFrame && event.senderFrame.url;
        if (!url || !url.startsWith(APP_URL)) throw new Error('Blocked IPC from untrusted frame');
        return handler(event, ...args);
    });
}

// ---------- IPC handlers (registered once, not per window) ----------

function registerAlertHandlers() {
    handle('showAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) return;
        alertWindow = new BrowserWindow({
            width: 1000,
            show: false, // shown by 'setHeight' once the page has measured itself
            parent: mainWindow,
            modal: true,
            frame: false,
            webPreferences: secureWebPreferences(),
        });
        lockDown(alertWindow);
        alertWindow.on('closed', () => { alertWindow = null; });
        alertWindow.loadFile(ALERT_PAGE);
    });

    handle('closeAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
    });

    handle('setHeight', async (event, height) => {
        if (!alertWindow || alertWindow.isDestroyed()) return;
        alertWindow.setSize(1000, Number(height) || 300);
        alertWindow.show();
    });
}

function registerLoginHandlers() {
    handle('vaultStatus', async () => ({ exists: VaultStore.exists(vaultFile()) }));

    handle('setupVault', async (event, password) => {
        if (VaultStore.exists(vaultFile())) return { ok: false, error: 'Vault already exists' };
        if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
        }
        // First run only: carry over entries from the old plaintext vault, if it is still around.
        let entries = {};
        try {
            entries = JSON.parse(fs.readFileSync(LEGACY_VAULT_FILE, 'utf8'));
        } catch {
            // no legacy file: start with an empty vault
        }
        startSession(VaultStore.create(vaultFile(), password, entries), entries);
        await mainWindow.loadFile(VAULT_PAGE);
        return { ok: true };
    });

    handle('logIn', async (event, password) => {
        const wait = secondsUntilNextTry();
        if (wait > 0) return { ok: false, wait };
        if (typeof password !== 'string') return { ok: false };

        const unlocked = VaultStore.unlock(vaultFile(), password);
        if (!unlocked) {
            registerFailure();
            return { ok: false };
        }
        resetThrottle();
        startSession(unlocked.key, unlocked.data);
        await mainWindow.loadFile(VAULT_PAGE);
        return { ok: true };
    });

    handle('logOut', async () => {
        lock();
        await mainWindow.loadFile(LOGIN_PAGE);
    });
}

function registerEntryHandlers() {
    handle('readData', async () => {
        requireLogin();
        return vaultData;
    });

    handle('addEntry', async (event, platform, id, pwd) =>
        commit(Entries.add(vaultData, platform, id, pwd)));

    handle('updateEntry', async (event, oldPlatform, platform, id, pwd) =>
        commit(Entries.update(vaultData, oldPlatform, platform, id, pwd)));

    handle('deleteEntry', async (event, platform) =>
        commit(Entries.remove(vaultData, platform)));

    handle('copyPassword', async (event, platform) => {
        requireLogin();
        if (typeof platform !== 'string' || !Object.hasOwn(vaultData, platform)) return { ok: false };
        clearClipboardNow();
        copiedValue = vaultData[platform].pwd;
        clipboard.writeText(copiedValue);
        clipboardTimer = setTimeout(clearClipboardNow, CLIPBOARD_CLEAR_MS);
        return { ok: true, seconds: CLIPBOARD_CLEAR_MS / 1000 };
    });

    // Pages call this when the user moves the mouse or types, so the idle lock does not fire.
    handle('activity', async () => { resetIdleTimer(); });
}

function registerBackupHandlers() {
    handle('exportVault', async () => {
        requireLogin();
        resetIdleTimer(); // native dialogs do not generate page activity
        const today = new Date().toISOString().slice(0, 10);
        const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
            title: 'Export encrypted vault',
            defaultPath: `ach-vault-${today}.enc`,
            filters: [{ name: 'Encrypted vault', extensions: ['enc'] }],
        });
        resetIdleTimer();
        if (canceled || !filePath) return { ok: false, canceled: true };

        fs.copyFileSync(vaultFile(), filePath);
        await dialog.showMessageBox(mainWindow, {
            type: 'info',
            message: 'Vault exported',
            detail: filePath + '\n\nThe file is encrypted. Opening it on another device needs your master password.',
        });
        resetIdleTimer();
        return { ok: true, path: filePath };
    });

    handle('importVault', async () => {
        const hasVault = VaultStore.exists(vaultFile());
        // Replacing an existing vault requires being logged in.
        if (hasVault && !authenticated) return { ok: false, error: 'Log in before importing' };

        resetIdleTimer();
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            title: 'Import encrypted vault',
            properties: ['openFile'],
            filters: [{ name: 'Encrypted vault', extensions: ['enc'] }],
        });
        resetIdleTimer();
        if (canceled || filePaths.length === 0) return { ok: false, canceled: true };

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
            const replaceClicked = response === 1;
            if (!replaceClicked) return { ok: false, canceled: true };

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            fs.copyFileSync(vaultFile(), `${vaultFile()}.bak-${timestamp}`);
        }

        VaultStore.writeAtomic(vaultFile(), incoming);
        lock();
        resetThrottle();
        await mainWindow.loadFile(LOGIN_PAGE);
        return { ok: true };
    });

    handle('changePassword', async (event, currentPassword, newPassword) => {
        requireLogin();
        const wait = secondsUntilNextTry();
        if (wait > 0) return { ok: false, error: `Too many attempts, wait ${wait}s` };
        if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
            return { ok: false, error: 'Invalid input' };
        }

        if (!VaultStore.unlock(vaultFile(), currentPassword)) {
            registerFailure();
            return { ok: false, error: 'Current password is wrong' };
        }
        resetThrottle();
        if (newPassword.length < MIN_PASSWORD_LENGTH) {
            return { ok: false, error: `Use at least ${MIN_PASSWORD_LENGTH} characters` };
        }
        if (newPassword === currentPassword) return { ok: false, error: 'New password must be different' };

        // A new salt gives a new key; the file is replaced in one atomic write.
        const oldKey = vaultKey;
        vaultKey = VaultStore.create(vaultFile(), newPassword, vaultData);
        oldKey.fill(0);
        resetIdleTimer();
        return { ok: true };
    });
}

// ---------- app lifecycle ----------

function createWindow() {
    lock();
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, 'build/icon.png'),
        webPreferences: secureWebPreferences(),
    });
    lockDown(mainWindow);
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadFile(LOGIN_PAGE);
}

app.whenReady().then(() => {
    registerAlertHandlers();
    registerLoginHandlers();
    registerEntryHandlers();
    registerBackupHandlers();
    createWindow();

    // macOS: re-create the window when the dock icon is clicked and none are open
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('before-quit', lock);

// Quit when all windows are closed, except on macOS where apps stay in the dock.
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
