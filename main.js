const { app, BrowserWindow, ipcMain } = require('electron')
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

let mainWindow = null;
let alertWindow = null;
let authenticated = false;

// ---------- authentication (master password lives in the main process only) ----------

const authFile = () => path.join(app.getPath('userData'), 'auth.json');

function hashPassword(password, salt = crypto.randomBytes(16)) {
    const hash = crypto.scryptSync(password, salt, 64);
    return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

// First run: seed the master password with the old default ("hello").
// TODO: replace with a proper "set master password" screen, then change it.
function ensureAuthFile() {
    if (!fs.existsSync(authFile())) {
        fs.mkdirSync(path.dirname(authFile()), { recursive: true });
        fs.writeFileSync(authFile(), JSON.stringify(hashPassword('hello')));
    }
}

function verifyPassword(password) {
    if (typeof password !== 'string') return false;
    const { salt, hash } = JSON.parse(fs.readFileSync(authFile(), 'utf8'));
    const candidate = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
    return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

// ---------- IPC (registered once, not per window) ----------

function registerIpc() {
    ipcMain.handle('showAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) return;
        alertWindow = new BrowserWindow({
            width: 1000,
            show: false,
            parent: mainWindow,
            modal: true,
            frame: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js')
            }
        });
        alertWindow.on('closed', () => { alertWindow = null; });
        alertWindow.loadFile(path.join(__dirname, 'windows/alert-window/unauth-message.html'));
    })

    ipcMain.handle('closeAlert', async () => {
        if (alertWindow && !alertWindow.isDestroyed()) alertWindow.close();
    });

    ipcMain.handle('setHeight', async (event, height) => {
        if (!alertWindow || alertWindow.isDestroyed()) return;
        alertWindow.setSize(1000, Number(height) || 300);
        alertWindow.show();
    });

    ipcMain.handle('logIn', async (event, password) => {
        if (!verifyPassword(password)) return false;
        authenticated = true;
        await mainWindow.loadFile(path.join(__dirname, 'screens/main-screen/main-screen.html'));
        return true;
    });

    ipcMain.handle('logOut', async () => {
        authenticated = false;
        await mainWindow.loadFile(path.join(__dirname, 'index.html'));
    });

    ipcMain.handle('readData', async () => {
        if (!authenticated) throw new Error('Not authenticated');
        const buffer = fs.readFileSync(path.join(__dirname, 'vault/passwords.json'));
        return JSON.parse(buffer.toString());
    });
}

function createWindow() {
    authenticated = false;
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js')
        }
    })
    mainWindow.on('closed', () => { mainWindow = null; });
    mainWindow.loadFile('index.html')
}

app.whenReady().then(() => {
    ensureAuthFile();
    registerIpc();
    createWindow()

    // macOS: re-create the window when the dock icon is clicked and none are open
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// quit when all windows are closed, except on macOS
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})
