import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest'
import request from 'supertest'
import bcrypt from 'bcryptjs'
import { app } from '../../app.js'
import { db, resetDb, seedUser } from '../helpers/db.js'
import { upsertSsoUser, ssoRoleToTier } from '../../routes/sso.js'

beforeEach(() => resetDb())
afterAll(() => db.close())

describe('migration v50 add_sso_sub', () => {
  it('adds the sso_sub column to users', () => {
    const cols = (db.prepare("SELECT name FROM pragma_table_info('users')").all() as { name: string }[]).map(c => c.name)
    expect(cols).toContain('sso_sub')
  })
})

describe('ssoRoleToTier', () => {
  it('maps the admin claim to tier5', () => {
    expect(ssoRoleToTier('admin')).toBe('tier5')
    expect(ssoRoleToTier('Admin')).toBe('tier5')
    expect(ssoRoleToTier('  admin  ')).toBe('tier5')
  })

  it('maps employees to tier1', () => {
    expect(ssoRoleToTier('employee')).toBe('tier1')
  })

  it('falls back to tier1 for an absent or unrecognized role, never tier5', () => {
    // Least privilege: nobody has reviewed the account at this point, so an
    // unknown IdP role must not mint an admin.
    expect(ssoRoleToTier(undefined)).toBe('tier1')
    expect(ssoRoleToTier('')).toBe('tier1')
    expect(ssoRoleToTier('sliquid_super_admin')).toBe('tier1') // granular role, not the coarse claim
    expect(ssoRoleToTier('administrator')).toBe('tier1')
  })
})

describe('upsertSsoUser', () => {
  it('creates a new active tier1 user with sso_sub and an unusable password', () => {
    const user = upsertSsoUser({ email: 'New.Employee@sliquid.com', name: 'New Employee', sub: 'sso-abc', role: 'employee' })
    expect(user.role).toBe('tier1')
    expect(user.status).toBe('active')

    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
    expect(row.email).toBe('new.employee@sliquid.com') // normalized to lowercase
    expect(row.sso_sub).toBe('sso-abc')
    expect(row.company).toBe('Sliquid')
    // Password hash exists but no real password matches it → password login impossible
    expect(row.password_hash).toBeTruthy()
    expect(bcrypt.compareSync('', row.password_hash)).toBe(false)
    // The row itself, not just the return value — the INSERT is what grants access.
    expect(row.role).toBe('tier1')
  })

  it('provisions an admin claim as tier5', () => {
    const user = upsertSsoUser({ email: 'it@sliquid.com', name: 'IT', sub: 'sso-admin', role: 'admin' })
    expect(user.role).toBe('tier5')
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
    expect(row.role).toBe('tier5')
  })

  it('provisions tier1 when the role claim is missing entirely', () => {
    // A token with no role claim must not silently become an admin.
    const user = upsertSsoUser({ email: 'noclaim@sliquid.com', name: 'No Claim', sub: 'sso-none' })
    expect(user.role).toBe('tier1')
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
    expect(row.role).toBe('tier1')
  })

  it('links an existing user without changing their role (never downgrade)', () => {
    const existing = seedUser({ email: 'boss@sliquid.com', role: 'tier7', status: 'pending' })
    const user = upsertSsoUser({ email: 'boss@sliquid.com', name: 'Boss', sub: 'sso-xyz', role: 'admin' })

    expect(user.id).toBe(existing.id)
    expect(user.role).toBe('tier7') // preserved, not bumped to tier5
    const row = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as any
    expect(row.sso_sub).toBe('sso-xyz')
    expect(row.status).toBe('active') // reactivated
  })

  it('does not create a duplicate user on repeat sign-in', () => {
    upsertSsoUser({ email: 'dupe@sliquid.com', name: 'Dupe', sub: 's1' })
    upsertSsoUser({ email: 'dupe@sliquid.com', name: 'Dupe', sub: 's2' })
    const { c } = db.prepare("SELECT COUNT(*) c FROM users WHERE email = 'dupe@sliquid.com'").get() as { c: number }
    expect(c).toBe(1)
  })

  it('blocks password login for an SSO-provisioned account', async () => {
    upsertSsoUser({ email: 'sso-only@sliquid.com', name: 'SSO Only', sub: 's3' })
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'sso-only@sliquid.com', password: 'anything' })
    expect(res.status).toBe(401)
    // (password login is the /api/auth route — unchanged by the SSO path move)
  })
})

describe('GET /auth/google/login', () => {
  const SSO_ENV = {
    SSO_ENABLED: 'true',
    SSO_AUTHORIZE_URL: 'https://sso-api.sliquid.com/oauth2/authorize',
    SSO_TOKEN_URL: 'https://sso-api.sliquid.com/oauth2/token',
    SSO_JWKS_URL: 'https://sso-api.sliquid.com/oauth2/jwks',
    SSO_ISSUER: 'https://sso-api.sliquid.com',
    SSO_CLIENT_ID: 'partner-portal',
    SSO_CLIENT_SECRET: 'shh-secret',
    SSO_REDIRECT_URI: 'https://api.example.com/auth/google/callback',
  }

  afterEach(() => {
    for (const k of Object.keys(SSO_ENV)) delete process.env[k]
  })

  it('returns 503 when SSO is not configured', async () => {
    const res = await request(app).get('/auth/google/login')
    expect(res.status).toBe(503)
  })

  it('redirects to a well-formed authorize URL and sets the sso_tx cookie when configured', async () => {
    Object.assign(process.env, SSO_ENV)
    const res = await request(app).get('/auth/google/login')

    expect(res.status).toBe(302)
    const loc = new URL(res.headers.location)
    expect(loc.origin + loc.pathname).toBe('https://sso-api.sliquid.com/oauth2/authorize')
    expect(loc.searchParams.get('response_type')).toBe('code')
    expect(loc.searchParams.get('client_id')).toBe('partner-portal')
    expect(loc.searchParams.get('redirect_uri')).toBe('https://api.example.com/auth/google/callback')
    expect(loc.searchParams.get('code_challenge_method')).toBe('S256')
    expect(loc.searchParams.get('code_challenge')).toBeTruthy()
    expect(loc.searchParams.get('state')).toBeTruthy()

    const setCookie = res.headers['set-cookie'][0]
    expect(setCookie).toContain('sso_tx=')
    expect(setCookie).toContain('HttpOnly')
  })
})
