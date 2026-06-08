import { createContext, useContext } from 'react'

// A no-op default so components used outside the provider don't crash.
export const RefreshContext = createContext<() => void>(() => {})

/** Trigger a data re-fetch across the app without remounting / reloading. */
export const useRefresh = () => useContext(RefreshContext)
