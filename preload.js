const { ipcRenderer ,contextBridge } = require('electron')

contextBridge.exposeInMainWorld('alertWindow', {
    show: () => ipcRenderer.invoke('showAlert'),
    close: () => ipcRenderer.invoke('closeAlert'),
    setHeight: (height)=> ipcRenderer.invoke('setHeight', height)
})
contextBridge.exposeInMainWorld('mainWindow', {
    welcome: () => ipcRenderer.invoke('logIn'),
    bye_bye: () => ipcRenderer.invoke('logOut')
})

contextBridge.exposeInMainWorld('homeWindow', {
    read: () => ipcRenderer.invoke('readData')
})




