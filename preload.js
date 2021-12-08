const { ipcRenderer ,contextBridge } = require('electron')
const fs = require("fs");

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
    read: () => {
        const buffer = fs.readFileSync('vault/passwords.json')
        let data = JSON.parse(buffer.toString());
        console.log('reading done');
        return data;
    },
})



