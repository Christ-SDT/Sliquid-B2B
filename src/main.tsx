import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { i18nReady } from './i18n'
import { initAnalytics } from './utils/analytics'

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('Root element #root not found in document.')

// GA4 — no-op unless VITE_GA_MEASUREMENT_ID is set and Cookiebot statistics consent is granted
initAnalytics()

// Wait for the visitor's language to load so es/fr never flash English first.
// A failed translation load must not blank the site — render anyway (English).
void i18nReady.catch(() => undefined).then(() => {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
})
