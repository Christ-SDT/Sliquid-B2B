import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedAnnouncement, seedPendingUser } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number
let tier2Id: number
let tier4Id: number
let pendingId: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id, tier4Id } = seedTestUsers())
  pendingId = seedPendingUser()
})

afterAll(() => db.close())

// Fixed literals — vi.useFakeTimers() does NOT move SQLite's datetime('now').
const PAST = '2020-01-01 00:00:00'
const FUTURE = '2099-01-01 00:00:00'

const admin = () => bearerToken(adminId, 'tier5')

/** A fully live, portal- and public-visible announcement. */
function seedLive(overrides = {}) {
  return seedAnnouncement({
    status: 'published', publish_at: PAST, show_in_portal: 1, show_on_public: 1, ...overrides,
  })
}

describe('GET /api/announcements (portal feed)', () => {
  it('returns 401 without auth', async () => {
    expect((await request(app).get('/api/announcements')).status).toBe(401)
  })

  // "Visible to all users" must genuinely mean all seven tiers.
  it.each([
    ['tier1', () => tier1Id], ['tier2', () => tier2Id], ['tier3', () => tier1Id],
    ['tier4', () => tier4Id], ['tier5', () => adminId], ['tier6', () => tier1Id],
    ['tier7', () => tier1Id],
  ])('is readable by %s', async (role, id) => {
    seedLive()
    const res = await request(app)
      .get('/api/announcements')
      .set('Authorization', bearerToken(id(), role))
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('omits body_html to keep list payloads small', async () => {
    seedLive()
    const res = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(res.body[0]).not.toHaveProperty('body_html')
    expect(res.body[0]).toHaveProperty('title')
    expect(res.body[0]).toHaveProperty('excerpt')
  })

  it('resolves admin overrides via COALESCE', async () => {
    seedLive({ wp_title: 'WP Title', title_override: 'Admin Title' })
    const res = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(res.body[0].title).toBe('Admin Title')
  })

  it('excludes hidden, archived, future and expired announcements', async () => {
    seedAnnouncement({ status: 'hidden', show_in_portal: 1 })
    seedAnnouncement({ status: 'archived', show_in_portal: 1 })
    seedAnnouncement({ status: 'published', publish_at: FUTURE, show_in_portal: 1 })
    seedAnnouncement({ status: 'published', publish_at: PAST, expires_at: PAST, show_in_portal: 1 })

    const res = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(res.body).toHaveLength(0)
  })

  it('excludes announcements that are public-only', async () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 0, show_on_public: 1,
    })
    const res = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(res.body).toHaveLength(0)
  })

  it('orders pinned first, then newest', async () => {
    seedLive({ wp_title: 'Old', wp_date_gmt: '2025-01-01 00:00:00' })
    seedLive({ wp_title: 'New', wp_date_gmt: '2026-06-01 00:00:00' })
    seedLive({ wp_title: 'Pinned', wp_date_gmt: '2020-01-01 00:00:00', pinned: 1 })

    const res = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(res.body.map((a: any) => a.title)).toEqual(['Pinned', 'New', 'Old'])
  })

  it('supports search and limit', async () => {
    seedLive({ wp_title: 'Tsunami nominated' })
    seedLive({ wp_title: 'Sample packets' })

    const s = await request(app)
      .get('/api/announcements?search=Tsunami').set('Authorization', admin())
    expect(s.body).toHaveLength(1)

    const l = await request(app)
      .get('/api/announcements?limit=1').set('Authorization', admin())
    expect(l.body).toHaveLength(1)
  })
})

describe('GET /api/announcements/:idOrSlug (portal detail)', () => {
  it('resolves by both id and slug, and includes the body', async () => {
    const id = seedLive({ slug: 'my-release', wp_content_html: '<p>Body here</p>' })

    for (const key of [String(id), 'my-release']) {
      const res = await request(app)
        .get(`/api/announcements/${key}`).set('Authorization', admin())
      expect(res.status).toBe(200)
      expect(res.body.body_html).toContain('Body here')
      expect(res.body.body_shape).toBe('rich')
    }
  })

  // Without re-applying the visibility predicate on detail, anyone could read an
  // unpublished or embargoed press release just by guessing its slug.
  it('404s for a hidden announcement even with a valid admin token', async () => {
    seedAnnouncement({ status: 'hidden', show_in_portal: 1, slug: 'secret-embargo' })
    const res = await request(app)
      .get('/api/announcements/secret-embargo').set('Authorization', admin())
    expect(res.status).toBe(404)
  })

  it('404s for a future-scheduled announcement', async () => {
    seedAnnouncement({
      status: 'published', publish_at: FUTURE, show_in_portal: 1, slug: 'embargoed',
    })
    expect((await request(app)
      .get('/api/announcements/embargoed').set('Authorization', admin())).status).toBe(404)
  })

  it('404s for an unknown slug', async () => {
    expect((await request(app)
      .get('/api/announcements/nope').set('Authorization', admin())).status).toBe(404)
  })

  it('requires auth', async () => {
    seedLive({ slug: 'x' })
    expect((await request(app).get('/api/announcements/x')).status).toBe(401)
  })
})

describe('GET /api/announcements/public', () => {
  it('works with no Authorization header at all', async () => {
    seedLive()
    const res = await request(app).get('/api/announcements/public')
    expect(res.status).toBe(200)
    expect(res.body).toHaveLength(1)
  })

  it('respects show_on_public independently of show_in_portal', async () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, show_on_public: 0,
    })
    expect((await request(app).get('/api/announcements/public')).body).toHaveLength(0)
  })

  it('serves detail publicly and 404s a portal-only announcement', async () => {
    seedLive({ slug: 'public-one', wp_content_html: '<p>Public body</p>' })
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, show_on_public: 0,
      slug: 'portal-one',
    })

    const ok = await request(app).get('/api/announcements/public/public-one')
    expect(ok.status).toBe(200)
    expect(ok.body.body_html).toContain('Public body')

    expect((await request(app).get('/api/announcements/public/portal-one')).status).toBe(404)
  })

  it('does not let an announcement slugged "public" shadow this route', async () => {
    // slugify() reserves 'public', so the row cannot claim that slug.
    const res = await request(app)
      .post('/api/announcements')
      .set('Authorization', admin())
      .send({ title: 'Public' })
    expect(res.status).toBe(201)
    expect(res.body.slug).toBe('public-announcement')

    // The literal route still wins and returns a list, not a detail object.
    expect(Array.isArray((await request(app).get('/api/announcements/public')).body)).toBe(true)
  })
})

describe('CORS — the marketing site can actually reach the public feed', () => {
  // supertest sends no Origin by default, and strictCors allows a missing
  // origin — so without these tests a missing PUBLIC_PATHS entry passes the
  // whole suite and only fails in a real browser.
  it('wildcards the public feed for a cross-origin GET', async () => {
    seedLive()
    const res = await request(app)
      .get('/api/announcements/public')
      .set('Origin', 'https://sliquid.com')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('wildcards the public detail route too (prefix match)', async () => {
    seedLive({ slug: 'a-release' })
    const res = await request(app)
      .get('/api/announcements/public/a-release')
      .set('Origin', 'https://sliquid.com')
    expect(res.headers['access-control-allow-origin']).toBe('*')
  })

  it('answers the preflight with 204', async () => {
    const res = await request(app)
      .options('/api/announcements/public')
      .set('Origin', 'https://sliquid.com')
    expect(res.status).toBe(204)
  })

  it('does NOT wildcard the authed feed', async () => {
    // Asserting header absence, not a status: strictCors rejects via
    // callback(new Error(...)) and the app registers no error handler, so a
    // disallowed origin yields Express's default 500.
    const res = await request(app)
      .get('/api/announcements')
      .set('Origin', 'https://evil.example')
    expect(res.headers['access-control-allow-origin']).not.toBe('*')
  })
})

describe('GET /api/announcements/admin', () => {
  it('403s for non-admins, 200s for admins', async () => {
    expect((await request(app).get('/api/announcements/admin')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))).status).toBe(403)
    expect((await request(app).get('/api/announcements/admin')
      .set('Authorization', admin())).status).toBe(200)
  })

  it('includes hidden and archived rows', async () => {
    seedAnnouncement({ status: 'hidden' })
    seedAnnouncement({ status: 'archived' })
    seedLive()
    const res = await request(app).get('/api/announcements/admin').set('Authorization', admin())
    expect(res.body).toHaveLength(3)
  })

  it('computes effective_status for each state', async () => {
    seedAnnouncement({ status: 'hidden', slug: 'a' })
    seedAnnouncement({ status: 'published', publish_at: FUTURE, slug: 'b' })
    seedAnnouncement({ status: 'published', publish_at: PAST, slug: 'c' })
    seedAnnouncement({ status: 'published', publish_at: PAST, expires_at: PAST, slug: 'd' })

    const res = await request(app).get('/api/announcements/admin').set('Authorization', admin())
    const byslug = Object.fromEntries(res.body.map((r: any) => [r.slug, r.effective_status]))
    expect(byslug).toEqual({ a: 'hidden', b: 'scheduled', c: 'live', d: 'expired' })
  })

  it('filters by status and source', async () => {
    seedAnnouncement({ status: 'hidden' })
    seedLive()
    expect((await request(app).get('/api/announcements/admin?status=hidden')
      .set('Authorization', admin())).body).toHaveLength(1)
    expect((await request(app).get('/api/announcements/admin?source=portal')
      .set('Authorization', admin())).body).toHaveLength(0)
  })

  it('admin detail exposes the raw WP original alongside the override', async () => {
    const id = seedAnnouncement({ wp_title: 'WP Original', title_override: 'Overridden' })
    const res = await request(app).get(`/api/announcements/admin/${id}`)
      .set('Authorization', admin())
    expect(res.body.wp_title).toBe('WP Original')
    expect(res.body.title_override).toBe('Overridden')
    expect(res.body.title).toBe('Overridden')
  })
})

describe('POST /api/announcements (portal-authored)', () => {
  it('creates a hidden portal announcement', async () => {
    const res = await request(app).post('/api/announcements').set('Authorization', admin())
      .send({ title: 'Internal Notice', body_html_override: '<p>Hello</p>' })

    expect(res.status).toBe(201)
    expect(res.body.source).toBe('portal')
    expect(res.body.wp_id).toBeNull()
    expect(res.body.status).toBe('hidden')
    expect(res.body.slug).toBe('internal-notice')
    expect(res.body.created_by).toBe(adminId)
  })

  it('400s without a title and 403s for non-admins', async () => {
    expect((await request(app).post('/api/announcements')
      .set('Authorization', admin()).send({})).status).toBe(400)
    expect((await request(app).post('/api/announcements')
      .set('Authorization', bearerToken(tier1Id, 'tier1')).send({ title: 'x' })).status).toBe(403)
  })

  it('suffixes a colliding slug', async () => {
    await request(app).post('/api/announcements').set('Authorization', admin()).send({ title: 'Same' })
    const b = await request(app).post('/api/announcements').set('Authorization', admin()).send({ title: 'Same' })
    expect(b.body.slug).toBe('same-2')
  })

  it('ignores non-allowlisted fields (mass-assignment guard)', async () => {
    const res = await request(app).post('/api/announcements').set('Authorization', admin())
      .send({ title: 'Guarded', wp_id: 999, source: 'wordpress', notified_at: '2020-01-01 00:00:00' })

    expect(res.body.wp_id).toBeNull()
    expect(res.body.source).toBe('portal')
    expect(res.body.notified_at).toBeNull()
  })
})

describe('PUT /api/announcements/:id', () => {
  it('updates overrides and returns the full row', async () => {
    const id = seedAnnouncement({})
    const res = await request(app).put(`/api/announcements/${id}`).set('Authorization', admin())
      .send({ title_override: 'New Title', excerpt_override: 'New Excerpt' })

    expect(res.status).toBe(200)
    expect(res.body.title).toBe('New Title')
    expect(res.body.excerpt).toBe('New Excerpt')
  })

  it('clears an override when passed an empty string', async () => {
    const id = seedAnnouncement({ wp_title: 'WP Title', title_override: 'Override' })
    const res = await request(app).put(`/api/announcements/${id}`).set('Authorization', admin())
      .send({ title_override: '' })
    expect(res.body.title_override).toBeNull()
    expect(res.body.title).toBe('WP Title')
  })

  it('404s for unknown, 403s for non-admin, 400s on a bad timestamp', async () => {
    const id = seedAnnouncement({})
    expect((await request(app).put('/api/announcements/999999')
      .set('Authorization', admin()).send({ title_override: 'x' })).status).toBe(404)
    expect((await request(app).put(`/api/announcements/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1')).send({})).status).toBe(403)
    expect((await request(app).put(`/api/announcements/${id}`)
      .set('Authorization', admin()).send({ publish_at: 'tomorrow-ish' })).status).toBe(400)
  })
})

describe('visibility toggles are independent', () => {
  it('toggling portal visibility leaves public visibility alone', async () => {
    const id = seedAnnouncement({ show_in_portal: 0, show_on_public: 1 })

    const res = await request(app).put(`/api/announcements/${id}/portal-visibility`)
      .set('Authorization', admin()).send({})
    expect(res.body).toEqual({ id, show_in_portal: 1 })

    const row = db.prepare('SELECT show_on_public FROM announcements WHERE id = ?').get(id) as any
    expect(row.show_on_public).toBe(1)
  })

  it('toggling public visibility leaves portal visibility alone', async () => {
    const id = seedAnnouncement({ show_in_portal: 1, show_on_public: 0 })
    const res = await request(app).put(`/api/announcements/${id}/public-visibility`)
      .set('Authorization', admin()).send({})
    expect(res.body).toEqual({ id, show_on_public: 1 })
    const row = db.prepare('SELECT show_in_portal FROM announcements WHERE id = ?').get(id) as any
    expect(row.show_in_portal).toBe(1)
  })

  it('flips back off, accepts an explicit value, 404s unknown and 403s non-admin', async () => {
    const id = seedAnnouncement({ show_in_portal: 1 })
    expect((await request(app).put(`/api/announcements/${id}/portal-visibility`)
      .set('Authorization', admin()).send({})).body.show_in_portal).toBe(0)
    expect((await request(app).put(`/api/announcements/${id}/portal-visibility`)
      .set('Authorization', admin()).send({ show_in_portal: 1 })).body.show_in_portal).toBe(1)
    expect((await request(app).put('/api/announcements/999999/portal-visibility')
      .set('Authorization', admin()).send({})).status).toBe(404)
    expect((await request(app).put(`/api/announcements/${id}/portal-visibility`)
      .set('Authorization', bearerToken(tier1Id, 'tier1')).send({})).status).toBe(403)
  })

  it('pins and unpins', async () => {
    const id = seedAnnouncement({})
    expect((await request(app).put(`/api/announcements/${id}/pinned`)
      .set('Authorization', admin()).send({})).body).toEqual({ id, pinned: 1 })
  })
})

describe('PUT /api/announcements/:id/schedule', () => {
  it('normalizes an ISO timestamp into SQLite format', async () => {
    const id = seedAnnouncement({})
    await request(app).put(`/api/announcements/${id}/schedule`).set('Authorization', admin())
      .send({ status: 'published', publish_at: '2026-08-01T14:00:00.000Z' })

    const row = db.prepare('SELECT publish_at FROM announcements WHERE id = ?').get(id) as any
    expect(row.publish_at).toBe('2026-08-01 14:00:00')
    expect(row.publish_at).not.toContain('T')
  })

  it('a past publish_at goes live immediately; a future one does not', async () => {
    const live = seedAnnouncement({ show_in_portal: 1, slug: 'now' })
    const later = seedAnnouncement({ show_in_portal: 1, slug: 'later' })

    await request(app).put(`/api/announcements/${live}/schedule`).set('Authorization', admin())
      .send({ status: 'published', publish_at: '2020-06-01T00:00:00.000Z' })
    await request(app).put(`/api/announcements/${later}/schedule`).set('Authorization', admin())
      .send({ status: 'published', publish_at: '2099-06-01T00:00:00.000Z' })

    const feed = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(feed.body.map((a: any) => a.slug)).toEqual(['now'])
  })

  it('clears publish_at with null so it is live on publish', async () => {
    const id = seedAnnouncement({ show_in_portal: 1, publish_at: FUTURE, status: 'published' })
    await request(app).put(`/api/announcements/${id}/schedule`).set('Authorization', admin())
      .send({ publish_at: null })
    expect((await request(app).get('/api/announcements').set('Authorization', admin())).body)
      .toHaveLength(1)
  })

  it('rejects an invalid status or timestamp and an empty body', async () => {
    const id = seedAnnouncement({})
    for (const body of [
      { status: 'live' }, { publish_at: 'soon' }, {},
    ]) {
      expect((await request(app).put(`/api/announcements/${id}/schedule`)
        .set('Authorization', admin()).send(body)).status).toBe(400)
    }
  })

  it('notifies immediately on publish rather than waiting for the sweep', async () => {
    const id = seedAnnouncement({ show_in_portal: 1 })
    await request(app).put(`/api/announcements/${id}/schedule`).set('Authorization', admin())
      .send({ status: 'published' })

    const n = db.prepare(
      "SELECT COUNT(*) c FROM notifications WHERE type = 'new_announcement'"
    ).get() as any
    expect(n.c).toBeGreaterThan(0)
  })
})

describe('DELETE /api/announcements/:id', () => {
  it('archives a WordPress row instead of deleting it, preserving overrides', async () => {
    const id = seedAnnouncement({
      source: 'wordpress', title_override: 'Keep me', show_in_portal: 1, show_on_public: 1,
    })
    const res = await request(app).delete(`/api/announcements/${id}`).set('Authorization', admin())

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ ok: true, archived: true })

    // Deleting outright would just be undone by the next sync, losing the override.
    const row = db.prepare('SELECT * FROM announcements WHERE id = ?').get(id) as any
    expect(row).toBeDefined()
    expect(row.status).toBe('archived')
    expect(row.show_in_portal).toBe(0)
    expect(row.show_on_public).toBe(0)
    expect(row.title_override).toBe('Keep me')
  })

  it('hard-deletes a portal-authored row', async () => {
    const created = await request(app).post('/api/announcements')
      .set('Authorization', admin()).send({ title: 'Temp' })
    const res = await request(app).delete(`/api/announcements/${created.body.id}`)
      .set('Authorization', admin())

    expect(res.body).toEqual({ ok: true })
    expect(db.prepare('SELECT 1 FROM announcements WHERE id = ?').get(created.body.id)).toBeUndefined()
  })

  it('always returns a JSON body (api.delete parses it unconditionally)', async () => {
    const id = seedAnnouncement({})
    const res = await request(app).delete(`/api/announcements/${id}`).set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body).toBeTypeOf('object')
    expect(res.body.ok).toBe(true)
  })

  it('404s unknown and 403s non-admin', async () => {
    const id = seedAnnouncement({})
    expect((await request(app).delete('/api/announcements/999999')
      .set('Authorization', admin())).status).toBe(404)
    expect((await request(app).delete(`/api/announcements/${id}`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))).status).toBe(403)
  })
})

describe('admin sync endpoints', () => {
  it('sync status reports config and counts', async () => {
    seedAnnouncement({ status: 'hidden' })
    seedLive()
    const res = await request(app).get('/api/announcements/admin/sync/status')
      .set('Authorization', admin())

    expect(res.status).toBe(200)
    expect(res.body.config.categoryId).toBe(245)
    expect(res.body.config.cutoffDate).toBe('2025-01-01')
    expect(res.body.enabled).toBe(true)
    expect(res.body.counts.total).toBe(2)
    expect(res.body.counts.hidden).toBe(1)
    expect(res.body.counts.live).toBe(1)
  })

  it('403s all admin sync endpoints for non-admins', async () => {
    const t = bearerToken(tier1Id, 'tier1')
    expect((await request(app).get('/api/announcements/admin/sync/status').set('Authorization', t)).status).toBe(403)
    expect((await request(app).post('/api/announcements/admin/sync').set('Authorization', t)).status).toBe(403)
    expect((await request(app).post('/api/announcements/admin/test').set('Authorization', t)).status).toBe(403)
    expect((await request(app).put('/api/announcements/admin/settings').set('Authorization', t).send({})).status).toBe(403)
    expect((await request(app).post('/api/announcements/admin/reorder').set('Authorization', t).send({ order: [] })).status).toBe(403)
  })

  it('validates settings and persists them', async () => {
    expect((await request(app).put('/api/announcements/admin/settings')
      .set('Authorization', admin()).send({ baseUrl: 'not-a-url' })).status).toBe(400)
    expect((await request(app).put('/api/announcements/admin/settings')
      .set('Authorization', admin()).send({ cutoffDate: '01/01/2025' })).status).toBe(400)
    expect((await request(app).put('/api/announcements/admin/settings')
      .set('Authorization', admin()).send({ categoryId: 'abc' })).status).toBe(400)

    const ok = await request(app).put('/api/announcements/admin/settings')
      .set('Authorization', admin())
      .send({ baseUrl: 'https://staging.sliquid.com', categoryId: 300, cutoffDate: '2024-01-01' })
    expect(ok.body).toEqual({ ok: true })

    const status = await request(app).get('/api/announcements/admin/sync/status')
      .set('Authorization', admin())
    expect(status.body.config.baseUrl).toBe('https://staging.sliquid.com')
    expect(status.body.config.categoryId).toBe(300)
  })

  it('reorder assigns sort_order and 400s on a non-array', async () => {
    const a = seedLive({ slug: 'first' })
    const b = seedLive({ slug: 'second' })

    expect((await request(app).post('/api/announcements/admin/reorder')
      .set('Authorization', admin()).send({ order: 'nope' })).status).toBe(400)

    await request(app).post('/api/announcements/admin/reorder')
      .set('Authorization', admin()).send({ order: [b, a] })

    const feed = await request(app).get('/api/announcements').set('Authorization', admin())
    expect(feed.body.map((x: any) => x.slug)).toEqual(['second', 'first'])
  })
})

describe('pending users see the PUBLIC subset', () => {
  // A registration awaiting approval gets the same announcements anyone can
  // already read on the B2B marketing site — that information is public, so
  // withholding it serves no purpose. Partner-only announcements
  // (show_in_portal = 1, show_on_public = 0) must still be withheld from an
  // account nobody has vetted yet.
  const asPending = () => bearerToken(pendingId, 'tier1')

  it('shows an announcement that is on the public site', async () => {
    seedLive({ slug: 'public-news' })
    const res = await request(app).get('/api/announcements').set('Authorization', asPending())
    expect(res.status).toBe(200)
    expect(res.body.map((a: any) => a.slug)).toEqual(['public-news'])
  })

  it('HIDES a partner-only announcement that approved users can see', async () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST,
      show_in_portal: 1, show_on_public: 0, slug: 'partners-only',
    })

    const pending = await request(app).get('/api/announcements').set('Authorization', asPending())
    expect(pending.body).toHaveLength(0)

    // Same request as an approved tier1 user does see it.
    const approved = await request(app)
      .get('/api/announcements').set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(approved.body.map((a: any) => a.slug)).toEqual(['partners-only'])
  })

  it('404s the detail route for a partner-only announcement', async () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST,
      show_in_portal: 1, show_on_public: 0, slug: 'partners-only',
    })
    expect((await request(app)
      .get('/api/announcements/partners-only').set('Authorization', asPending())).status).toBe(404)
    expect((await request(app)
      .get('/api/announcements/partners-only')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))).status).toBe(200)
  })

  it('serves the detail route for a public announcement', async () => {
    seedLive({ slug: 'public-news', wp_content_html: '<p>Readable</p>' })
    const res = await request(app)
      .get('/api/announcements/public-news').set('Authorization', asPending())
    expect(res.status).toBe(200)
    expect(res.body.body_html).toContain('Readable')
  })

  it('still requires authentication', async () => {
    seedLive()
    expect((await request(app).get('/api/announcements')).status).toBe(401)
  })
})
