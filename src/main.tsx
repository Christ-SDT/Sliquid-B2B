import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { initAnalytics } from './utils/analytics'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found in document.')

// GA4 — no-op unless VITE_GA_MEASUREMENT_ID is set and Cookiebot statistics consent is granted
initAnalytics()

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
