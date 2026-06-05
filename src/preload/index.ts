import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  // App version for the corner label + Settings card.
  getVersion: () => ipcRenderer.invoke('app:version:get'),
  // OTA update controls (electron-updater, driven by the UpdateBanner + Settings).
  checkForUpdate: () => ipcRenderer.invoke('app:check-update:post'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => cb(...args))
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})
