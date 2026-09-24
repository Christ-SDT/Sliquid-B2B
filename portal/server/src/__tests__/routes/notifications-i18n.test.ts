import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import request from 'supertest'
import { app } from '../../app.js'
import { db, resetDb, seedTestUsers, seedPendingUser } from '../helpers/db.js'
import { bearerToken } from '../helpers/auth.js'
import { notifyUsers, notifyUser } from '../../notifications.js'

let adminId: number
let tier1Id: number

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
})

afterAll(() => db.close())

const feed = async (userId: number, role: string) =>
  (await request(app).get('/api/notifications').set('Authorization', bearerToken(userId, role))).body

describe('notification i18n (migration v63)', () => {
  it('stores the key + params and returns params as an object, English text kept as fallback', async () => {
    notifyUsers('new_asset', 'New in Product Library', 'Satin Banner (Sliquid) has been added to the Product Library.', '/assets',
      { key: 'productLibraryItem', params: { name: 'Satin Banner', brand: 'Sliquid' } })
    const { notifications } = await feed(tier1Id, 'tier1')
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({
      title: 'New in Product Library',
      message: 'Satin Banner (Sliquid) has been added to the Product Library.',
      i18n_key: 'productLibraryItem',
      i18n_params: { name: 'Satin Banner', brand: 'Sliquid' },
    })
  })

  it('leaves key/params null when none are given (admin-only notifications)', async () => {
    notifyUsers('new_asset', 'Title', 'Message', '/assets')
    const { notifications } = await feed(tier1Id, 'tier1')
    expect(notifications[0].i18n_key).toBeNull()
    expect(notifications[0].i18n_params).toBeNull()
  })

  it('returns null params for a malformed stored value instead of failing the feed', async () => {
    notifyUser(tier1Id, 'new_asset', 'T', 'M', '/assets', { key: 'productLibraryItem' })
    db.prepare("UPDATE notifications SET i18n_params = '{not json'").run()
    const res = await request(app).get('/api/notifications').set('Authorization', bearerToken(tier1Id, 'tier1'))
    expect(res.status).toBe(200)
    expect(res.body.notifications[0].i18n_params).toBeNull()
  })
})

describe('account_approved notice reaches the partner', () => {
  it('an approved partner sees their approval notification (it used to be filtered out)', async () => {
    const pendingId = seedPendingUser({ email: 'newpartner@test.com' })
    const approve = await request(app)
      .post(`/api/admin/users/${pendingId}/approve`)
      .set('Authorization', bearerToken(adminId, 'tier5'))
      .send({ role: 'tier1' })
    expect(approve.status).toBe(200)

    const { notifications, unreadCount } = await feed(pendingId, 'tier1')
    const approved = notifications.find((n: { type: string }) => n.type === 'account_approved')
    expect(approved).toBeDefined()
    expect(approved.i18n_key).toBe('accountApproved')
    expect(unreadCount).toBeGreaterThanOrEqual(1)
  })
})
