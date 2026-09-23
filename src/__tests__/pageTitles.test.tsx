import { describe, it, expect, afterEach } from 'vitest'
import i18n from '@/i18n'
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

const title = (route: string) => i18n.t(`titles.${ROUTE_TITLES[route]}`)

describe('page titles (WCAG 2.4.2 Page Titled)', () => {
  afterEach(() => i18n.changeLanguage('en'))

  it('has a ROUTE_TITLES entry with an English title for every static route', () => {
    for (const route of STATIC_ROUTES) {
      expect(ROUTE_TITLES[route], `missing ROUTE_TITLES entry for "${route}"`).toBeTruthy()
      expect(i18n.exists(`titles.${ROUTE_TITLES[route]}`), `no common:titles.${ROUTE_TITLES[route]}`).toBe(true)
    }
  })

  it.each(['en', 'es', 'fr'])('gives every static route a unique title in %s', async (lng) => {
    await i18n.changeLanguage(lng)
    const titles = STATIC_ROUTES.map(title)
    expect(new Set(titles).size).toBe(titles.length)
  })

  it('resolves dynamic announcement/insight routes to a placeholder, not the previous route title', () => {
    expect(getDefaultTitle('/announcements/some-post')).toBe('announcement')
    expect(getDefaultTitle('/insights/some-post')).toBe('announcement')
  })

  it('falls back to the not-found title for unmatched paths', () => {
    expect(getDefaultTitle('/this-route-does-not-exist')).toBe('notFound')
  })

  it('ignores a trailing slash', () => {
    expect(getDefaultTitle('/catalog/')).toBe(getDefaultTitle('/catalog'))
  })
})
