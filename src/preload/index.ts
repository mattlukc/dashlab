import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  // 'darwin' | 'win32' | … — the renderer can't read process.platform directly
  // under contextIsolation, so surface it here for platform-specific UI copy.
  platform: process.platform,
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, cb: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_e, ...args) => cb(...args))
  },
  removeAllListeners: (channel: string) => {
    ipcRenderer.removeAllListeners(channel)
  }
})
