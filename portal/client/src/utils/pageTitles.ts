/**
 * Route -> title-key map (keys under `common:titles`) for the routes nested under <Shell> in App.tsx
 * (leading slash omitted — these are relative <Route path> values). Backs
 * Shell.tsx's default document-title logic (WCAG 2.4.2 Page Titled).
 *
 * Routes with data-driven content (announcement/quiz detail) resolve to a
 * generic placeholder here and are overridden by the page itself via
 * useDocumentTitle once it knows what it's showing.
 */
export const ROUTE_TITLES: Record<string, string> = {
  dashboard: 'dashboard',
  announcements: 'announcements',
  'admin/announcements': 'manageAnnouncements',
  products: 'products',
  assets: 'assets',
  inventory: 'inventory',
  invoices: 'invoices',
  stats: 'stats',
  distributors: 'distributors',
  retailer: 'retailer',
  trainings: 'trainings',
  users: 'users',
  requests: 'requests',
  'marketing-requests': 'marketingRequests',
  'store-users': 'storeUsers',
  creator: 'creator',
  media: 'media',
  'reference-gallery': 'referenceGallery',
  logs: 'logs',
  'medical-marketing': 'medicalMarketing',
  'gdpr-requests': 'gdprRequests',
}

/**
 * Title key (under `common:titles`) for a pathname under Shell (leading slash
 * included, as from useLocation().pathname). Static routes resolve exactly;
 * `announcements/:slug` and `quiz/:id` resolve to a generic placeholder.
 */
export function getDefaultTitle(pathname: string): string {
  const path = pathname.replace(/^\//, '').replace(/\/+$/, '')

  if (path in ROUTE_TITLES) return ROUTE_TITLES[path]
  if (/^announcements\/[^/]+$/.test(path)) return 'announcement'
  if (/^quiz\/[^/]+$/.test(path)) return 'quiz'

  return 'dashboard'
}
