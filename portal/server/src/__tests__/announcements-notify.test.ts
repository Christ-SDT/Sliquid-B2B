import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../app.js'
import { db, resetDb, seedTestUsers, seedAnnouncement, seedPendingUser } from './helpers/db.js'
import { bearerToken } from './helpers/auth.js'
import { sweepScheduledAnnouncements } from '../announcements.js'

let adminId: number
let tier1Id: number
let tier4Id: number
let pendingId: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier4Id } = seedTestUsers())
  pendingId = seedPendingUser()
})

afterAll(() => db.close())

const PAST = '2020-01-01 00:00:00'
const FUTURE = '2099-01-01 00:00:00'

function notifCount(userId: number, type = 'new_announcement') {
  return (db.prepare(
    'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND type = ?'
  ).get(userId, type) as { c: number }).c
}

describe('sweepScheduledAnnouncements', () => {
  it('notifies every user, including admins, for a live announcement', () => {
    seedAnnouncement({ status: 'published', publish_at: PAST, show_in_portal: 1 })

    expect(sweepScheduledAnnouncements()).toBe(1)
    // notifyUsers alone would skip admins; notifyEveryone must cover both.
    expect(notifCount(tier1Id)).toBe(1)
    expect(notifCount(tier4Id)).toBe(1)
    expect(notifCount(adminId)).toBe(1)
  })

  it('is idempotent — a second sweep notifies nobody again', () => {
    seedAnnouncement({ status: 'published', publish_at: PAST, show_in_portal: 1 })

    expect(sweepScheduledAnnouncements()).toBe(1)
    expect(sweepScheduledAnnouncements()).toBe(0)
    expect(notifCount(tier1Id)).toBe(1)
  })

  it('stamps notified_at', () => {
    const id = seedAnnouncement({ status: 'published', publish_at: PAST, show_in_portal: 1 })
    sweepScheduledAnnouncements()
    const row = db.prepare('SELECT notified_at FROM announcements WHERE id = ?').get(id) as { notified_at: string | null }
    expect(row.notified_at).toBeTruthy()
  })

  it('does not notify for a future publish_at', () => {
    seedAnnouncement({ status: 'published', publish_at: FUTURE, show_in_portal: 1 })
    expect(sweepScheduledAnnouncements()).toBe(0)
    expect(notifCount(tier1Id)).toBe(0)
  })

  it('does not notify for a hidden announcement', () => {
    seedAnnouncement({ status: 'hidden', show_in_portal: 1 })
    expect(sweepScheduledAnnouncements()).toBe(0)
  })

  it('does not notify for an archived announcement', () => {
    seedAnnouncement({ status: 'archived', show_in_portal: 1 })
    expect(sweepScheduledAnnouncements()).toBe(0)
  })

  it('does not notify when the announcement is not portal-visible', () => {
    seedAnnouncement({ status: 'published', publish_at: PAST, show_in_portal: 0, show_on_public: 1 })
    expect(sweepScheduledAnnouncements()).toBe(0)
  })

  it('does not notify for an expired announcement', () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, expires_at: PAST, show_in_portal: 1,
    })
    expect(sweepScheduledAnnouncements()).toBe(0)
  })

  it('treats a NULL publish_at as immediately live', () => {
    seedAnnouncement({ status: 'published', publish_at: null, show_in_portal: 1 })
    expect(sweepScheduledAnnouncements()).toBe(1)
  })

  it('links to the slug so the notification deep-links correctly', () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, slug: 'my-press-release',
    })
    sweepScheduledAnnouncements()
    const row = db.prepare(
      "SELECT link FROM notifications WHERE type = 'new_announcement' LIMIT 1"
    ).get() as { link: string }
    expect(row.link).toBe('/announcements/my-press-release')
  })
})

describe('BLOCKER regression — announcements reach non-admin feeds', () => {
  // routes/notifications.ts filters non-admins to an allowlist of types. Before
  // 'new_announcement' was added, the sweep inserted rows for tier1–tier4 that
  // were then silently filtered out of their feed — the feature would look
  // completely broken for everyone except admins, with no error anywhere.
  it('a swept announcement appears in a tier1 notification feed', async () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, wp_title: 'Big News',
    })
    sweepScheduledAnnouncements()

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    expect(res.status).toBe(200)
    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.notifications[0].type).toBe('new_announcement')
    expect(res.body.notifications[0].message).toBe('Big News')
    expect(res.body.unreadCount).toBe(1)
  })

  it('also reaches a tier4 prospect feed', async () => {
    seedAnnouncement({ status: 'published', publish_at: PAST, show_in_portal: 1 })
    sweepScheduledAnnouncements()

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier4Id, 'tier4'))

    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.unreadCount).toBe(1)
  })
})

describe('pending users are not notified about partner-only announcements', () => {
  // Their feed is narrowed to the public subset, so a bell for a portal-only
  // announcement would open a 404.
  it('notifies pending users when the announcement is also public', () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, show_on_public: 1,
    })
    sweepScheduledAnnouncements()
    expect(notifCount(pendingId)).toBe(1)
    expect(notifCount(tier1Id)).toBe(1)
  })

  it('skips pending users for a partner-only announcement', () => {
    seedAnnouncement({
      status: 'published', publish_at: PAST, show_in_portal: 1, show_on_public: 0,
    })
    sweepScheduledAnnouncements()
    expect(notifCount(pendingId)).toBe(0)
    // Approved users and admins are still notified.
    expect(notifCount(tier1Id)).toBe(1)
    expect(notifCount(tier4Id)).toBe(1)
    expect(notifCount(adminId)).toBe(1)
  })
})
