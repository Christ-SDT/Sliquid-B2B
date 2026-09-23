/**
 * Static route -> title-key map backing the shared document-title logic in
 * Layout.tsx (WCAG 2.4.2 Page Titled). Keyed by pathname exactly as it
 * appears in App.tsx's <Route path> list (leading slash, no trailing slash).
 * Values are keys under `common:titles`, so the browser tab follows the
 * visitor's language.
 *
 * Routes whose content is data-driven (announcement/insight detail, the 404
 * catch-all) call useDocumentTitle themselves once they know what they're
 * showing. `getDefaultTitle` still returns a reasonable generic key for them so
 * the tab never falls back to the previous route's title while data loads.
 */
export const ROUTE_TITLES: Record<string, string> = {
  '/': 'home',
  '/our-brands': 'ourBrands',
  '/ingredients': 'ingredients',
  '/about': 'about',
  '/announcements': 'announcements',
  '/insights': 'insights',
  '/contact': 'contact',
  '/partner-login': 'partnerLogin',
  '/forgot-password': 'forgotPassword',
  '/reset-password': 'resetPassword',
  '/health-practitioners': 'healthPractitioners',
  '/become-a-retailer': 'becomeRetailer',
  '/retailer-check-in': 'retailerCheckIn',
  '/catalog': 'catalog',
  '/map-policy': 'mapPolicy',
  '/privacy-policy': 'privacyPolicy',
  '/accessibility': 'accessibility',
  '/data-rights': 'dataRights',
  '/terms': 'terms',
  '/erospain-2026': 'erospain',
  '/register': 'register',
}

/** Title key (under `common:titles`) for a pathname. */
export function getDefaultTitle(pathname: string): string {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname

  if (path in ROUTE_TITLES) return ROUTE_TITLES[path]
  if (/^\/(announcements|insights)\/[^/]+$/.test(path)) return 'announcement'

  return 'notFound'
}
