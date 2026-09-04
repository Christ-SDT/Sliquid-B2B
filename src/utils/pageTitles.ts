/**
 * Static route -> page-name map backing the shared document-title logic in
 * Layout.tsx (WCAG 2.4.2 Page Titled). Keyed by pathname exactly as it
 * appears in App.tsx's <Route path> list (leading slash, no trailing slash).
 *
 * Routes whose content is data-driven (announcement/insight detail, the 404
 * catch-all) aren't listed here — those pages call useDocumentTitle directly
 * once they know what they're showing. `getDefaultTitle` still returns a
 * reasonable generic name for them so the tab never falls back to the
 * previous route's title while data is loading.
 */
export const ROUTE_TITLES: Record<string, string> = {
  '/': 'B2B Partner Portal',
  '/our-brands': 'Our Brands',
  '/ingredients': 'Ingredients',
  '/about': 'About Us',
  '/announcements': 'Announcements',
  '/insights': 'Insights',
  '/contact': 'Contact',
  '/partner-login': 'Partner Login',
  '/forgot-password': 'Forgot Password',
  '/reset-password': 'Reset Password',
  '/health-practitioners': 'Health Practitioners',
  '/become-a-retailer': 'Become a Retailer',
  '/retailer-check-in': 'Retailer Check-In',
  '/catalog': 'Product Catalog',
  '/map-policy': 'MAP Policy',
  '/privacy-policy': 'Privacy Policy',
  '/accessibility': 'Accessibility',
  '/data-rights': 'Your Data Rights',
  '/terms': 'Terms of Use',
  '/erospain-2026': 'Erospain 2026',
  '/register': 'Create Account',
}

/**
 * Best-effort page name for a given pathname. Static routes resolve exactly;
 * `/announcements/:slug` and `/insights/:slug` resolve to a generic name that
 * the detail page immediately overrides via useDocumentTitle once its data
 * loads. Anything else (unmatched routes) resolves to 'Page Not Found', which
 * NotFoundPage confirms via its own useDocumentTitle call.
 */
export function getDefaultTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  if (path in ROUTE_TITLES) return ROUTE_TITLES[path]
  if (/^\/announcements\/[^/]+$/.test(path)) return 'Announcement'
  if (/^\/insights\/[^/]+$/.test(path)) return 'Announcement'

  return 'Page Not Found'
}
