import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

// Must be mocked at module scope: email.ts calls its own sendEmail internally,
// so an ESM namespace spy applied after import cannot intercept it. Every
// export is stubbed to reject, standing in for an EmailJS outage.
vi.mock('../../email.js', () => {
  const boom = () => Promise.reject(new Error('EmailJS down'))
  return {
    sendEmail: boom,
    sendRetailerCheckInEmails: boom,
    sendHPApplicationEmail: boom,
    sendContactFormEmails: boom,
    sendRetailerApplicationEmails: boom,
  }
})

const request = (await import('supertest')).default
const { app } = await import('../../app.js')
const { db, resetDb } = await import('../helpers/db.js')

beforeEach(() => resetDb())
afterAll(() => db.close())

/**
 * The window must start only once the submission actually landed. Recording it
 * up front would mean a transient outage locks the sender out for an hour from
 * a message that reached nobody — the same failure the hp-apply row rollback
 * was written to undo.
 */
describe('a failed send never starts the cooldown', () => {
  it('retailer-checkin: no cooldown row, and the checkin row is rolled back', async () => {
    const res = await request(app).post('/api/b2b/retailer-checkin')
      .send({ company: 'Shop', contactName: 'Ann', email: 'ann@shop.example' })
    expect(res.status).toBe(500)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM retailer_checkins').get()).toEqual({ c: 0 })
  })

  it('hp-apply: no cooldown row, and the application row is rolled back', async () => {
    const res = await request(app).post('/api/b2b/hp-apply')
      .send({ practiceType: 'Clinic', practiceName: 'C', contactName: 'Ann', contactPhone: '555', email: 'ann@shop.example' })
    expect(res.status).toBe(500)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
    expect(db.prepare('SELECT COUNT(*) c FROM hp_applications').get()).toEqual({ c: 0 })
  })

  it('contact: no cooldown row', async () => {
    const res = await request(app).post('/api/b2b/contact')
      .send({ fromName: 'Ann', fromEmail: 'ann@shop.example', subject: 'retailer', message: 'Hi' })
    expect(res.status).toBe(500)
    expect(db.prepare('SELECT COUNT(*) c FROM form_submissions').get()).toEqual({ c: 0 })
  })

  it('the sender can retry immediately rather than waiting out an hour', async () => {
    const body = { company: 'Shop', contactName: 'Ann', email: 'ann@shop.example' }
    await request(app).post('/api/b2b/retailer-checkin').send(body)
    const retry = await request(app).post('/api/b2b/retailer-checkin').send(body)
    expect(retry.status).not.toBe(429)
  })
})
