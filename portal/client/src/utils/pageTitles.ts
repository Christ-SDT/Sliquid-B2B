/**
 * Route -> page-name map for the routes nested under <Shell> in App.tsx
 * (leading slash omitted — these are relative <Route path> values). Backs
 * Shell.tsx's default document-title logic (WCAG 2.4.2 Page Titled).
 *
 * Routes with data-driven content (announcement/quiz detail) resolve to a
 * generic placeholder here and are overridden by the page itself via
 * useDocumentTitle once it knows what it's showing.
 */
export const ROUTE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  announcements: 'Announcements',
  'admin/announcements': 'Manage Announcements',
  products: 'Products',
  assets: 'Product Library',
  inventory: 'Inventory',
  invoices: 'Invoices',
  stats: 'Stats',
  distributors: 'Distributors',
  retailer: 'Marketing Assets',
  trainings: 'Trainings',
  users: 'Users',
  requests: 'Partner Requests',
  'marketing-requests': 'Marketing Requests',
  'store-users': 'My Store',
  creator: 'Creator',
  media: 'Media',
  'reference-gallery': 'Reference Gallery',
  logs: 'Logs',
  'medical-marketing': 'Medical Marketing',
  'gdpr-requests': 'GDPR Requests',
}

/**
 * Best-effort page name for a pathname under Shell (leading slash included,
 * as from useLocation().pathname). Static routes resolve exactly;
 * `announcements/:slug` and `quiz/:id` resolve to a generic placeholder that
 * the page itself can override once it knows the real title.
 */
export function getDefaultTitle(pathname: string): string {
  const path = pathname.replace(/^\//, '').replace(/\/+$/, '')

  if (path in ROUTE_TITLES) return ROUTE_TITLES[path]
  if (/^announcements\/[^/]+$/.test(path)) return 'Announcement'
  if (/^quiz\/[^/]+$/.test(path)) return 'Training Quiz'

  return 'Dashboard'
}
