// Google Analytics 4 (gtag.js) — loaded ONLY after Cookiebot "statistics"
// consent is granted, so it stays GDPR-compliant. The Measurement ID comes from
// the VITE_GA_MEASUREMENT_ID env var (set in Cloudflare Pages / .env.local), so
// nothing is hardcoded and analytics is simply off when the var is absent.

declare global {
  interface Window {
    dataLayer: unknown[]
    gtag: (...args: unknown[]) => void
    Cookiebot?: { consent?: { statistics?: boolean } }
  }
}

const GA_ID = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

let loaded = false

function loadGA() {
  if (loaded || !GA_ID) return
  loaded = true

  // External gtag.js (allowed in CSP script-src via googletagmanager.com)
  const s = document.createElement('script')
  s.async = true
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`
  document.head.appendChild(s)

  // Config runs in our own bundle ('self') — no inline script needed, so the
  // strict Content-Security-Policy stays intact.
  window.dataLayer = window.dataLayer || []
  window.gtag = function gtag() { window.dataLayer.push(arguments) }
  window.gtag('js', new Date())
  // GA4 "Enhanced measurement" captures SPA route changes (history events)
  // automatically, so a single config call covers page views across the app.
  window.gtag('config', GA_ID)
}

export function initAnalytics() {
  if (!GA_ID) return
  const startIfConsented = () => {
    if (window.Cookiebot?.consent?.statistics) loadGA()
  }
  // Covers a returning visitor whose consent is already resolved…
  startIfConsented()
  // …and the first visit where consent is granted after the banner interaction.
  window.addEventListener('CookiebotOnConsentReady', startIfConsented)
  window.addEventListener('CookiebotOnAccept', startIfConsented)
}
