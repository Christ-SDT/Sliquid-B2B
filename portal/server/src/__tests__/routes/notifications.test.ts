import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'

let adminId: number
let tier1Id: number
let tier2Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id, tier2Id } = seedTestUsers())
})

afterAll(() => db.close())

// Must seed a type non-admins are allowed to see (see USER_VISIBLE_TYPES in
// routes/notifications.ts) — an arbitrary type is filtered out for tier1–tier4
// and every assertion below would see an empty feed.
function insertNotification(userId: number, read = 0, type = 'new_asset') {
  const result = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message) VALUES (?, ?, ?, ?)'
  ).run(userId, type, 'Test', 'Test message')
  if (read) {
    db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(result.lastInsertRowid)
  }
  return result.lastInsertRowid as number
}

describe('GET /api/notifications', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/notifications')
    expect(res.status).toBe(401)
  })

  it('returns only own notifications', async () => {
    insertNotification(tier1Id)
    insertNotification(tier2Id)

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.unreadCount).toBe(1)
  })

  it('returns unread count correctly', async () => {
    insertNotification(tier1Id, 0)
    insertNotification(tier1Id, 0)
    insertNotification(tier1Id, 1)

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.unreadCount).toBe(2)
  })
})

describe('GET /api/notifications — type visibility filter', () => {
  // Non-admins see an allowlist of types. A new user-facing type that is not
  // added to USER_VISIBLE_TYPES is inserted and then silently filtered out of
  // their feed, which looks exactly like "notifications are broken".
  it('shows new_announcement to non-admins', async () => {
    insertNotification(tier1Id, 0, 'new_announcement')

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.notifications).toHaveLength(1)
    expect(res.body.unreadCount).toBe(1)
  })

  it('hides admin-only types from non-admins', async () => {
    insertNotification(tier1Id, 0, 'low_stock')
    insertNotification(tier1Id, 0, 'announcement_review')

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.body.notifications).toHaveLength(0)
    expect(res.body.unreadCount).toBe(0)
  })

  it('shows every type to admins', async () => {
    insertNotification(adminId, 0, 'low_stock')
    insertNotification(adminId, 0, 'new_announcement')

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(adminId, 'tier5'))
    expect(res.body.notifications).toHaveLength(2)
    expect(res.body.unreadCount).toBe(2)
  })
})

describe('PUT /api/notifications/read-all', () => {
  it('marks all own notifications as read', async () => {
    insertNotification(tier1Id)
    insertNotification(tier1Id)

    await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.body.unreadCount).toBe(0)
  })

  it('does not mark other users notifications as read', async () => {
    insertNotification(tier2Id)

    await request(app)
      .put('/api/notifications/read-all')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier2Id, 'tier2'))
    expect(res.body.unreadCount).toBe(1)
  })
})

describe('PUT /api/notifications/:id/read', () => {
  it('marks a single notification as read', async () => {
    const notifId = insertNotification(tier1Id)

    const res = await request(app)
      .put(`/api/notifications/${notifId}/read`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)

    const check = await request(app)
      .get('/api/notifications')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(check.body.unreadCount).toBe(0)
  })

  it('returns 403 when trying to mark another user\'s notification', async () => {
    const notifId = insertNotification(tier2Id)

    const res = await request(app)
      .put(`/api/notifications/${notifId}/read`)
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(403)
  })

  it('returns 404 for unknown notification', async () => {
    const res = await request(app)
      .put('/api/notifications/99999/read')
      .set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(404)
  })
})
