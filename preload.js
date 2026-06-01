const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Valorant
  checkValorant: () => ipcRenderer.invoke('valorant:check'),
  prepareLobby: (data) => ipcRenderer.invoke('valorant:prepare-lobby', data),
  startMatch: (data) => ipcRenderer.invoke('valorant:start-match', data),

  // Window controls
  minimize: () => ipcRenderer.invoke('window:minimize'),
  hide: () => ipcRenderer.invoke('window:hide'),
})
