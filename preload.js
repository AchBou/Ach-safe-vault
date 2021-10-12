const { ipcRenderer ,contextBridge } = require('electron')

contextBridge.exposeInMainWorld('alertWindow', {
    show: () => ipcRenderer.invoke('showAlert'),
    close: () => ipcRenderer.invoke('closeAlert')
})


