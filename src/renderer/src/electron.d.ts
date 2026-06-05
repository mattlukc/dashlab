interface Window {
  electron: {
    platform: string
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    on: (channel: string, cb: (...args: unknown[]) => void) => void
    removeAllListeners: (channel: string) => void
  }
}
