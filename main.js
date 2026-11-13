const { app, BrowserWindow, ipcMain } = require('electron')
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

function lock() {
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
        await mainWindow.loadFile(path.join(__dirname, 'screens/main-screen/main-screen.html'));
        return { ok: true };
    });

    handle('logOut', async () => {
        lock();
        await mainWindow.loadFile(path.join(__dirname, 'index.html'));
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
