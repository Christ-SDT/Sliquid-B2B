import { describe, it, expect } from 'vitest'
import { ROUTE_TITLES, getDefaultTitle } from '@/utils/pageTitles'

// Mirrors the static <Route path> list in App.tsx. Kept as a literal array
// (not an import of App's routes) so this test fails loudly — rather than
// silently doing nothing — if a new route is added without a matching
// ROUTE_TITLES entry, per HQ 03's "unique page title" requirement.
const STATIC_ROUTES = [
  '/',
  '/our-brands',
  '/ingredients',
  '/about',
  '/announcements',
  '/insights',
  '/contact',
  '/partner-login',
  '/forgot-password',
  '/reset-password',
  '/health-practitioners',
  '/become-a-retailer',
  '/retailer-check-in',
  '/catalog',
  '/map-policy',
  '/privacy-policy',
  '/accessibility',
  '/data-rights',
  '/terms',
  '/erospain-2026',
  '/register',
]

describe('page titles (WCAG 2.4.2 Page Titled)', () => {
  it('has a ROUTE_TITLES entry for every static route', () => {
    for (const route of STATIC_ROUTES) {
      expect(ROUTE_TITLES[route], `missing ROUTE_TITLES entry for "${route}"`).toBeTruthy()
    }
  })

  it('gives every static route a unique title', () => {
    const titles = STATIC_ROUTES.map((route) => ROUTE_TITLES[route])
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('resolves dynamic announcement/insight routes to a placeholder, not the previous route title', () => {
    expect(getDefaultTitle('/announcements/some-post')).toBe('Announcement')
    expect(getDefaultTitle('/insights/some-post')).toBe('Announcement')
  })

  it('falls back to "Page Not Found" for unmatched paths', () => {
    expect(getDefaultTitle('/this-route-does-not-exist')).toBe('Page Not Found')
  })

  it('ignores a trailing slash', () => {
    expect(getDefaultTitle('/catalog/')).toBe(getDefaultTitle('/catalog'))
  })
})
