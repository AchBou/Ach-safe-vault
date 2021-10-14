const { ipcRenderer ,contextBridge } = require('electron')

contextBridge.exposeInMainWorld('alertWindow', {
    show: () => ipcRenderer.invoke('showAlert'),
    close: () => ipcRenderer.invoke('closeAlert')
})
contextBridge.exposeInMainWorld('mainWindow', {
    welcome: () => ipcRenderer.invoke('logIn'),
    bye_bye: () => ipcRenderer.invoke('logOut')
})



