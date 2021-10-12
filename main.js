const { app, BrowserWindow } = require('electron')
const path = require("path");

function createWindow () {
    const win = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences:{
            preload: path.join(__dirname, 'preload.js')
        }
    })

    win.loadFile('index.html')
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