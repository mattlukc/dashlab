interface Window {
  electron: {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    downloadUpdate: () => Promise<unknown>
    installUpdate: () => Promise<unknown>
    on: (channel: string, cb: (...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
  }
}
