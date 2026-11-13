const { ipcRenderer ,contextBridge } = require('electron')

contextBridge.exposeInMainWorld('alertWindow', {
    show: () => ipcRenderer.invoke('showAlert'),
    close: () => ipcRenderer.invoke('closeAlert'),
    setHeight: (height)=> ipcRenderer.invoke('setHeight', height)
})
contextBridge.exposeInMainWorld('mainWindow', {
    importVault: () => ipcRenderer.invoke('importVault'),
    status: () => ipcRenderer.invoke('vaultStatus'),
    setup: (password) => ipcRenderer.invoke('setupVault', password),
    welcome: (password) => ipcRenderer.invoke('logIn', password),
    bye_bye: () => ipcRenderer.invoke('logOut')
})

contextBridge.exposeInMainWorld('homeWindow', {
    read: () => ipcRenderer.invoke('readData'),
    exportVault: () => ipcRenderer.invoke('exportVault'),
    importVault: () => ipcRenderer.invoke('importVault'),
    copy: (platform) => ipcRenderer.invoke('copyPassword', platform),
    activity: () => ipcRenderer.invoke('activity'),
    add: (platform, id, pwd) => ipcRenderer.invoke('addEntry', platform, id, pwd),
    update: (oldPlatform, platform, id, pwd) => ipcRenderer.invoke('updateEntry', oldPlatform, platform, id, pwd),
    remove: (platform) => ipcRenderer.invoke('deleteEntry', platform)
})




