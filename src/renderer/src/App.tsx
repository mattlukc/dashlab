import { useState } from 'react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import PolarisProvider from './PolarisProvider'
import Layout from './Layout'
import { RefreshContext } from './RefreshContext'
import Dashboard from './pages/Dashboard'
import Orders from './pages/Orders'
import OrderDetail from './pages/OrderDetail'
import Settings from './pages/Settings'
import TV from './pages/TV'

export default function App() {
  // Bumping refreshKey makes the data-fetching pages re-run their effects
  // (they list refreshKey in their deps) — a soft refresh that keeps the whole
  // UI mounted, so there's no white flash like window.location.reload() caused.
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = () => setRefreshKey((k) => k + 1)

  return (
    <PolarisProvider>
      <RefreshContext.Provider value={triggerRefresh}>
        {/* MemoryRouter, not BrowserRouter — there's no URL bar in Electron. */}
        <MemoryRouter
          initialEntries={['/']}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard refreshKey={refreshKey} />} />
              <Route path="/orders" element={<Orders refreshKey={refreshKey} />} />
              <Route path="/orders/:orderNumber" element={<OrderDetail />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/tv" element={<TV refreshKey={refreshKey} />} />
            </Routes>
          </Layout>
        </MemoryRouter>
      </RefreshContext.Provider>
    </PolarisProvider>
  )
}
