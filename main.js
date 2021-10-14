const { app, BrowserWindow, ipcMain} = require('electron')
const path = require("path");

function createWindow () {
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences:{
            preload: path.join(__dirname, 'preload.js')
        }
    })

    let alertWindow;
    ipcMain.handle('showAlert', async () => {
        alertWindow = new BrowserWindow({
            width: 450,
            height: 400,
            parent: mainWindow,
            modal: true,
            frame: false,
            webPreferences: {
                preload: path.join(__dirname, 'preload.js')
            }
        });
        alertWindow.loadFile('./windows/alert-window/unauth-message.html');
    })

    ipcMain.handle('closeAlert',async ()=>{
        alertWindow.close();
    });

    ipcMain.handle('logIn',async ()=>{
        await mainWindow.loadFile('screens/main-screen/main-screen.html')
    });

    ipcMain.handle('logOut',async ()=>{
        await mainWindow.loadFile('index.html')
    });

    mainWindow.loadFile('index.html')
}




// loading the app when its ready
app.whenReady().then(() => {
    createWindow()

    // for macOS ( doesnt quit when all windows are closed )
    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// generally apps quit when all windows are closed on Mac and linux
// but not on macOS
app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit()
})