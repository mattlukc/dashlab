import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './globals.css'

// Shim fetch for /api/ calls → Electron IPC.
// This lets all existing components keep calling fetch('/api/...') unchanged;
// the request is mapped to an 'api:resource:action' IPC channel and the
// handler's return value is wrapped back into a Response.
const _fetch = window.fetch.bind(window)
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (typeof url === 'string' && url.startsWith('/api/')) {
    const method = init?.method?.toUpperCase() || 'GET'
    const body = init?.body ? JSON.parse(init.body as string) : undefined
    // Map /api/path + method → IPC channel.
    const channel = 'api:' + url.replace('/api/', '').replace(/\//g, ':').replace(/\[.*?\]/g, '') + ':' + method.toLowerCase()
    try {
      const result = await window.electron.invoke(channel, body)
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (err) {
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }
  return _fetch(input, init)
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
