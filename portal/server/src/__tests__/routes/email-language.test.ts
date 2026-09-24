import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

// Capture what email.ts actually hands EmailJS. Mocked at the SDK boundary (not
// email.ts) so the real senders — and the params they build — are exercised.
const send = vi.fn(async (..._args: unknown[]) => ({ status: 200, text: 'OK' }))
vi.mock('@emailjs/nodejs', () => ({ default: { send } }))

process.env.EMAILJS_PUBLIC_KEY = 'test-public'
process.env.EMAILJS_PRIVATE_KEY = 'test-private'
process.env.EMAILJS_SERVICE_ID = 'test-service'

const request = (await import('supertest')).default
const { app } = await import('../../app.js')
const { db, resetDb, seedTestUsers, seedUser } = await import('../helpers/db.js')
const { bearerToken } = await import('../helpers/auth.js')

type Params = Record<string, string>
/** Params of the most recent send to `templateId`, waiting for fire-and-forget sends. */
async function paramsFor(templateId: string): Promise<Params> {
  let found: Params | undefined
  await vi.waitFor(() => {
    const call = [...send.mock.calls].reverse().find(c => c[1] === templateId)
    expect(call, `no email sent with template ${templateId}`).toBeTruthy()
    found = call![2] as Params
  })
  return found!
}

let adminId: number
beforeEach(() => {
  resetDb()
  send.mockClear()
  ;({ adminId } = seedTestUsers())
})
afterAll(() => db.close())

describe('registration', () => {
  const body = { name: 'Ana Prueba', email: 'ana@example.com', company: 'Tienda', password: 'Password123!' }

  it('stores a supported language and sends the confirmation in it', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...body, language: 'es' })
    expect(res.status).toBe(201)
    const row = db.prepare('SELECT preferred_language FROM users WHERE email = ?').get(body.email) as { preferred_language: string | null }
    expect(row.preferred_language).toBe('es')

    const p = await paramsFor('portal_register_confirm')
    expect(p.lang).toBe('es')
    expect(p.t_subject).toBe('Su registro en el Portal B2B de Sliquid')
    expect(p.t_heading).toBe('¡Bienvenido, Ana Prueba!')
    expect(p.user_name).toBe('Ana Prueba') // existing variables untouched
  })

  it('stores NULL for an unsupported language and sends English', async () => {
    await request(app).post('/api/auth/register').send({ ...body, language: 'de' })
    const row = db.prepare('SELECT preferred_language FROM users WHERE email = ?').get(body.email) as { preferred_language: string | null }
    expect(row.preferred_language).toBeNull()
    expect((await paramsFor('portal_register_confirm')).lang).toBe('en')
  })

  it('leaves the admin copy English and free of translated variables', async () => {
    await request(app).post('/api/auth/register').send({ ...body, language: 'fr' })
    const admin = await paramsFor('portal_register_admin')
    expect(Object.keys(admin).some(k => k === 'lang' || k.startsWith('t_'))).toBe(false)
  })
})

describe('forgot-password', () => {
  it('uses the language of the page the request came from', async () => {
    seedUser({ email: 'reset@example.com', name: 'Reset User' })
    await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com', language: 'fr' })
    const p = await paramsFor('portal_password_reset')
    expect(p.lang).toBe('fr')
    expect(p.t_subject).toBe('Réinitialisez votre mot de passe du portail partenaires Sliquid')
  })

  it('falls back to the saved preference when the request names none', async () => {
    const { id } = seedUser({ email: 'saved@example.com', name: 'Saved User' })
    db.prepare("UPDATE users SET preferred_language = 'es' WHERE id = ?").run(id)
    await request(app).post('/api/auth/forgot-password').send({ email: 'saved@example.com' })
    expect((await paramsFor('portal_password_reset')).lang).toBe('es')
  })
})

describe('admin approval', () => {
  it("emails the user in their saved language, with a translated role label", async () => {
    const { id } = seedUser({ email: 'pending@example.com', name: 'Pierre', status: 'pending', role: 'tier4' })
    db.prepare("UPDATE users SET preferred_language = 'fr' WHERE id = ?").run(id)
    const res = await request(app).post(`/api/admin/users/${id}/approve`)
      .set('Authorization', bearerToken(adminId, 'tier5')).send({ role: 'tier2' })
    expect(res.status).toBe(200)
    const p = await paramsFor('portal_approved')
    expect(p.lang).toBe('fr')
    expect(p.t_role_label).toBe('Direction de magasin')
    expect(p.role_label).toBe('Retail Management') // old variable unchanged for un-updated templates
  })
})

describe('public forms', () => {
  it('contact: the auto-reply follows the submitted language; the admin copy does not', async () => {
    const res = await request(app).post('/api/b2b/contact').send({
      fromName: 'Lucía', fromEmail: 'lucia@example.com', subject: 'general',
      message: 'Hola, me gustaría recibir más información sobre sus productos.', language: 'es',
    })
    expect(res.status).toBe(200)
    const reply = await paramsFor('b2b_contact_reply')
    expect(reply.lang).toBe('es')
    expect(reply.t_heading).toBe('¡Gracias por escribirnos, Lucía!')
    const admin = await paramsFor('b2b_contact_admin')
    expect(Object.keys(admin).some(k => k.startsWith('t_'))).toBe(false)
  })

  it('retailer check-in: translated fallbacks for unanswered optional fields', async () => {
    const res = await request(app).post('/api/b2b/retailer-checkin')
      .send({ company: 'Boutique', contactName: 'Anne', email: 'anne@example.com', language: 'fr' })
    expect(res.status).toBe(200)
    const p = await paramsFor('b2b_retailer_checkin_confirm')
    expect(p.lang).toBe('fr')
    expect(p.t_point_of_contact).toBe('Un membre de notre équipe des ventes')
    expect(p.t_interests).toBe('Aucune sélection')
    expect(p.t_subject).toMatch(/^Merci pour votre suivi, Anne — SRC-\d{4}$/)
  })
})
