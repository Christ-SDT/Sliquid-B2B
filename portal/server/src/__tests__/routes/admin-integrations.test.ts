import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'

// ─── Module mocks (hoisted) ──────────────────────────────────────────────────
// EmailJS SDK, so nothing is ever sent.
vi.mock('@emailjs/nodejs', () => ({ default: { send: vi.fn(async () => ({ status: 200, text: 'OK' })) } }))

// S3: HeadBucket is controlled per test; never reaches AWS.
const s3Send = vi.hoisted(() => vi.fn())
vi.mock('@aws-sdk/client-s3', async (orig) => {
  const real = await orig<typeof import('@aws-sdk/client-s3')>()
  class FakeS3Client {
    send = s3Send
    destroy() {}
  }
  return { ...real, S3Client: FakeS3Client }
})

// SSO relay (Stream D's module): keep the real exports, control the two this
// endpoint calls. The test event echoes the client secret to prove scrubbing.
const relay = vi.hoisted(() => ({
  status: vi.fn(),
  test: vi.fn(),
}))
vi.mock('../../ssoNotify.js', async (orig) => {
  const real = await orig<typeof import('../../ssoNotify.js')>()
  return { ...real, getRelayStatus: relay.status, sendTestEvent: relay.test }
})

const request = (await import('supertest')).default
const { app } = await import('../../app.js')
const { db, resetDb, seedTestUsers, seedLegalUser } = await import('../helpers/db.js')
const { bearerToken } = await import('../helpers/auth.js')
const { _resetIntegrationTestResults, scrubSecrets } = await import('../../integrations.js')

// ─── Sentinels ───────────────────────────────────────────────────────────────

const SECRETS = {
  WC_CONSUMER_KEY: 'ck_SENTINEL_KEY_abc123456',
  WC_CONSUMER_SECRET: 'cs_SENTINEL_SECRET_123',
  EMAILJS_PRIVATE_KEY: 'EJS_PRIVATE_SENTINEL_999',
  EMAILJS_PUBLIC_KEY: 'EJS_PUBLIC_SENTINEL_888',
  SSO_CLIENT_SECRET: 'SSO_CLIENT_SECRET_SENTINEL_777',
  AWS_ACCESS_KEY_ID: 'AKIASENTINELKEYID0001',
  AWS_SECRET_ACCESS_KEY: 'AWS_SECRET_SENTINEL_666',
  MAILCHIMP_API_KEY: 'mcSENTINELKEY555abcdef-us21',
  GEMINI_API_KEY: 'GEMINI_SENTINEL_444',
  WP_APP_PASSWORD: 'WP_APP_PASSWORD_SENTINEL_333',
}
const SAVED_SECRETS = {
  wc_consumer_key: 'ck_SAVED_SENTINEL_KEY_222',
  wc_consumer_secret: 'cs_SAVED_SENTINEL_SECRET_111',
}
const ALL_SENTINELS = [...Object.values(SECRETS), ...Object.values(SAVED_SECRETS)]

const ENV_KEYS = [
  ...Object.keys(SECRETS),
  'WC_URL', 'EMAILJS_SERVICE_ID', 'SSO_ENABLED', 'SSO_ISSUER', 'SSO_AUTHORIZE_URL', 'SSO_TOKEN_URL',
  'SSO_JWKS_URL', 'SSO_CLIENT_ID', 'SSO_REDIRECT_URI', 'S3_BUCKET', 'AWS_REGION', 'MCP_RESOURCE_URI',
  'WP_BASE_URL', 'WP_APP_USER', 'WP_ANNOUNCEMENTS_CATEGORY_ID', 'WP_ANNOUNCEMENTS_CUTOFF',
]
const savedEnv: Record<string, string | undefined> = {}
for (const k of ENV_KEYS) savedEnv[k] = process.env[k]

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k]
}

function setAllEnv() {
  Object.assign(process.env, SECRETS)
  process.env.WC_URL = 'https://shopuser:shoppass@shop.example.com/store?token=abc'
  process.env.EMAILJS_SERVICE_ID = 'service_x'
  process.env.SSO_ENABLED = 'true'
  process.env.SSO_ISSUER = 'https://sso-api.example.com'
  process.env.SSO_AUTHORIZE_URL = 'https://sso-api.example.com/oauth2/authorize'
  process.env.SSO_TOKEN_URL = 'https://sso-api.example.com/oauth2/token'
  process.env.SSO_JWKS_URL = 'https://sso-api.example.com/oauth2/jwks'
  process.env.SSO_CLIENT_ID = 'partner-portal'
  process.env.SSO_REDIRECT_URI = 'https://api.example.com/auth/google/callback?x=1'
  process.env.S3_BUCKET = 'sliquid-test-bucket'
  process.env.AWS_REGION = 'us-east-2'
  process.env.MCP_RESOURCE_URI = 'https://api.example.com/mcp'
  process.env.WP_APP_USER = 'wpuser'
}

function saveWooSettings() {
  const up = db.prepare('INSERT OR REPLACE INTO woo_settings (key, value) VALUES (?, ?)')
  up.run('wc_url', 'https://saved.example.com')
  up.run('wc_consumer_key', SAVED_SECRETS.wc_consumer_key)
  up.run('wc_consumer_secret', SAVED_SECRETS.wc_consumer_secret)
}

function expectNoSecrets(body: unknown) {
  const s = JSON.stringify(body)
  for (const secret of ALL_SENTINELS) expect(s, `leaked ${secret}`).not.toContain(secret)
  // Mailchimp data-centre suffix is part of the key.
  expect(s).not.toContain('us21')
  expect(s).not.toContain('shoppass')
  expect(s).not.toContain('token=abc')
}

type FetchHandler = (url: string, init?: RequestInit) => Response | Promise<Response>
function stubFetch(handler: FetchHandler) {
  const fn = vi.fn(async (input: any, init?: RequestInit) => handler(String(input?.url ?? input), init))
  vi.stubGlobal('fetch', fn)
  return fn
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })

// ─── Fixtures ────────────────────────────────────────────────────────────────

let adminId: number
let tier1Id: number
let legalId: number
const admin = () => bearerToken(adminId, 'tier5')
const legal = () => bearerToken(legalId, 'tier8')
const tier1 = () => bearerToken(tier1Id, 'tier1')

beforeEach(() => {
  resetDb()
  ;({ adminId, tier1Id } = seedTestUsers())
  legalId = seedLegalUser()
  clearEnv()
  _resetIntegrationTestResults()
  s3Send.mockReset()
  relay.status.mockReset().mockReturnValue({
    configured: false, enabled: false, url: null, lastDeliveredAt: null, lastError: null, pending: 0, failing: 0,
  })
  relay.test.mockReset().mockResolvedValue({ ok: false, message: 'Not configured' })
  // Default: any unexpected network call fails loudly.
  stubFetch(url => { throw new Error(`unexpected fetch ${url}`) })
})

afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k]
    else process.env[k] = savedEnv[k]
  }
})

afterAll(() => db.close())

const IDS = ['woocommerce', 'wordpress', 'emailjs', 'sso', 'sso_notifications', 'mcp', 's3', 'gemini', 'mailchimp']

// ─── GET / ───────────────────────────────────────────────────────────────────

describe('GET /api/admin/integrations', () => {
  it('returns every integration, in order, with the contract shape', async () => {
    const res = await request(app).get('/api/admin/integrations').set('Authorization', admin())
    expect(res.status).toBe(200)
    expect(res.body.map((s: any) => s.id)).toEqual(IDS)
    for (const s of res.body) {
      expect(typeof s.name).toBe('string')
      expect(typeof s.configured).toBe('boolean')
      expect(['env', 'saved', 'default', 'mixed', 'none']).toContain(s.source)
      expect(typeof s.details).toBe('object')
      expect(typeof s.testable).toBe('boolean')
      expect(['dashboard', 'env', 'page']).toContain(s.manage)
    }
  })

  it('never returns a secret with everything configured (env + saved)', async () => {
    setAllEnv()
    saveWooSettings()
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('ai_model', 'imagen-4.0-generate-001')").run()
    db.prepare("INSERT INTO woo_sync_log (direction, status, products_updated, message) VALUES ('pull', 'error', 0, ?)")
      .run(`failed with key ${SECRETS.WC_CONSUMER_SECRET} at https://u:shoppass@shop.example.com/?token=abc`)
    relay.status.mockReturnValue({
      configured: true, enabled: true,
      url: 'https://relayuser:shoppass@sso-api.example.com/integrations/notifications?token=abc',
      lastDeliveredAt: '2026-10-01 10:00:00',
      lastError: `401 for ${SECRETS.SSO_CLIENT_SECRET}`,
      pending: 1, failing: 0,
    })

    const res = await request(app).get('/api/admin/integrations').set('Authorization', legal())
    expect(res.status).toBe(200)
    expectNoSecrets(res.body)

    const byId = Object.fromEntries(res.body.map((s: any) => [s.id, s]))
    expect(byId.woocommerce.details.store).toBe('shop.example.com')
    expect(byId.emailjs.details).toEqual({ publicKeySet: true, privateKeySet: true, serviceIdSet: true })
    expect(byId.sso.details.redirectUri).toBe('https://api.example.com/auth/google/callback')
    expect(byId.sso.details.clientSecretSet).toBe(true)
    expect(byId.sso_notifications.details.url).toBe('https://sso-api.example.com/integrations/notifications')
    expect(byId.s3.details.bucket).toBe('sliquid-test-bucket')
    // The audience (list) id is an identifier, not a credential; the API key never appears.
    expect(byId.mailchimp.details).toEqual({ apiKeySet: true, listId: '88a27ac60c' })
    expect(byId.mcp.details.resourceUri).toBe('https://api.example.com/mcp')
  })

  it('detects WooCommerce source: none → saved → env', async () => {
    const woo = async () => (await request(app).get('/api/admin/integrations').set('Authorization', admin()))
      .body.find((s: any) => s.id === 'woocommerce')

    let s = await woo()
    expect(s.configured).toBe(false)
    expect(s.source).toBe('none')

    saveWooSettings()
    s = await woo()
    expect(s.configured).toBe(true)
    expect(s.source).toBe('saved')
    expect(s.details.store).toBe('saved.example.com')
    expect(s.details.savedOverriddenByEnv).toBe(false)

    process.env.WC_URL = 'https://env.example.com'
    process.env.WC_CONSUMER_KEY = SECRETS.WC_CONSUMER_KEY
    process.env.WC_CONSUMER_SECRET = SECRETS.WC_CONSUMER_SECRET
    s = await woo()
    expect(s.source).toBe('env')
    expect(s.details.store).toBe('env.example.com')
    expect(s.details.savedOverriddenByEnv).toBe(true)
  })

  it('reports WordPress as default, saved, or mixed', async () => {
    const wpStatus = async () => (await request(app).get('/api/admin/integrations').set('Authorization', admin()))
      .body.find((s: any) => s.id === 'wordpress')

    let s = await wpStatus()
    expect(s.source).toBe('default')
    expect(s.details).toMatchObject({ baseUrl: 'https://sliquid.com', categoryId: 245, cutoffDate: '2025-01-01', syncEnabled: true })

    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('wp_base_url', 'https://wp.example.com')").run()
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('wp_category_id', '12')").run()
    db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('wp_cutoff_date', '2024-01-01')").run()
    s = await wpStatus()
    expect(s.source).toBe('saved')
    expect(s.details.baseUrl).toBe('https://wp.example.com')

    process.env.WP_ANNOUNCEMENTS_CATEGORY_ID = '99'
    s = await wpStatus()
    expect(s.source).toBe('mixed')
    expect(s.details.categoryId).toBe(99)
  })

  it('uses announcement_sync_log and woo_sync_log for last activity', async () => {
    saveWooSettings()
    db.prepare("INSERT INTO woo_sync_log (synced_at, direction, status, products_updated) VALUES ('2026-10-01 09:00:00', 'pull', 'ok', 3)").run()
    db.prepare("INSERT INTO announcement_sync_log (synced_at, trigger_source, status, posts_seen) VALUES ('2026-10-02 09:00:00', 'manual', 'ok', 4)").run()
    const res = await request(app).get('/api/admin/integrations').set('Authorization', admin())
    const byId = Object.fromEntries(res.body.map((s: any) => [s.id, s]))
    expect(byId.woocommerce.lastActivity).toBe('2026-10-01 09:00:00')
    expect(byId.woocommerce.lastResult).toBe('ok')
    expect(byId.wordpress.lastActivity).toBe('2026-10-02 09:00:00')
    expect(byId.wordpress.lastResult).toBe('ok')
  })

  it('uses the most recent SSO login as SSO last activity', async () => {
    db.prepare("UPDATE users SET sso_sub = 'abc', last_login = '2026-09-30 08:00:00' WHERE id = ?").run(adminId)
    const res = await request(app).get('/api/admin/integrations').set('Authorization', admin())
    expect(res.body.find((s: any) => s.id === 'sso').lastActivity).toBe('2026-09-30 08:00:00')
  })

  it('403s tier1 and 401s without a token', async () => {
    expect((await request(app).get('/api/admin/integrations').set('Authorization', tier1())).status).toBe(403)
    expect((await request(app).get('/api/admin/integrations')).status).toBe(401)
  })
})

// ─── POST /:id/test ──────────────────────────────────────────────────────────

describe('POST /api/admin/integrations/:id/test', () => {
  const post = (id: string, auth = admin()) =>
    request(app).post(`/api/admin/integrations/${id}/test`).set('Authorization', auth).send({})

  it('404s an unknown id', async () => {
    expect((await post('nope')).status).toBe(404)
  })

  it.each(IDS)('Legal gets 403 on %s and tier1 gets 403', async (id) => {
    expect((await post(id, legal())).status).toBe(403)
    expect((await post(id, tier1())).status).toBe(403)
  })

  it.each(IDS)('%s returns a result without secrets when nothing is configured', async (id) => {
    const res = await post(id)
    expect(res.status).toBe(200)
    expect(typeof res.body.ok).toBe('boolean')
    expect(typeof res.body.message).toBe('string')
    expectNoSecrets(res.body)
  })

  it('woocommerce: success and error paths never leak', async () => {
    setAllEnv()
    const fetchFn = stubFetch(url => {
      expect(url).toContain('/wp-json/wc/v3/system_status')
      return json({ environment: {} })
    })
    let res = await post('woocommerce')
    expect(res.body).toEqual({ ok: true, message: 'Connected to shop.example.com.' })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expectNoSecrets(res.body)

    stubFetch(() => { throw new Error(`connect failed for ${process.env.WC_URL} with ${SECRETS.WC_CONSUMER_SECRET}`) })
    res = await post('woocommerce')
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)

    // And the stored last result surfaces on GET without leaking either.
    const status = await request(app).get('/api/admin/integrations').set('Authorization', admin())
    expect(status.body.find((s: any) => s.id === 'woocommerce').lastResult).toBe('error')
    expectNoSecrets(status.body)
  })

  it('woocommerce: saved-credential error path never leaks', async () => {
    saveWooSettings()
    stubFetch(() => { throw new Error(`bad ${SAVED_SECRETS.wc_consumer_secret} ${SAVED_SECRETS.wc_consumer_key}`) })
    const res = await post('woocommerce')
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)
  })

  it('wordpress: reuses wp.testConnection (success + HTTP error + throw)', async () => {
    setAllEnv()
    stubFetch(url => {
      expect(url).toContain('/wp-json/wp/v2/posts')
      return json([], 200, { 'x-wp-total': '7' })
    })
    let res = await post('wordpress')
    expect(res.body.ok).toBe(true)
    expect(res.body.message).toContain('7 published post(s)')
    expectNoSecrets(res.body)

    stubFetch(() => json({}, 401))
    res = await post('wordpress')
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('HTTP 401')

    stubFetch(() => { throw new Error(`boom ${SECRETS.WP_APP_PASSWORD} https://u:shoppass@x.example.com/?token=abc`) })
    res = await post('wordpress')
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)
  })

  it('sso: fetches the discovery document and checks the issuer', async () => {
    setAllEnv()
    const fetchFn = stubFetch(() => json({ issuer: 'https://sso-api.example.com', jwks_uri: 'x' }))
    let res = await post('sso')
    expect(res.body.ok).toBe(true)
    expect(fetchFn.mock.calls[0][0]).toBe('https://sso-api.example.com/.well-known/openid-configuration')

    stubFetch(() => json({ issuer: 'https://evil.example.com' }))
    res = await post('sso')
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('Issuer mismatch')

    stubFetch(() => json({}, 500))
    res = await post('sso')
    expect(res.body).toMatchObject({ ok: false })
    expect(res.body.message).toContain('HTTP 500')

    stubFetch(() => { throw new Error(`net down ${SECRETS.SSO_CLIENT_SECRET}`) })
    res = await post('sso')
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)
  })

  it('sso_notifications: calls sendTestEvent and scrubs its message', async () => {
    setAllEnv()
    relay.test.mockResolvedValue({ ok: false, message: `rejected secret ${SECRETS.SSO_CLIENT_SECRET}` })
    const res = await post('sso_notifications')
    expect(relay.test).toHaveBeenCalledTimes(1)
    expect(res.body.ok).toBe(false)
    expect(res.body.message).toContain('[redacted]')
    expectNoSecrets(res.body)
  })

  it('sso_notifications: a throwing sendTestEvent becomes a scrubbed failure', async () => {
    setAllEnv()
    relay.test.mockRejectedValue(new Error(`thrown ${SECRETS.SSO_CLIENT_SECRET}`))
    const res = await post('sso_notifications')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)
  })

  it('s3: HeadBucket success and failure', async () => {
    setAllEnv()
    s3Send.mockResolvedValue({})
    let res = await post('s3')
    expect(res.body.ok).toBe(true)
    expect(s3Send).toHaveBeenCalledTimes(1)
    expect(s3Send.mock.calls[0][0].input).toEqual({ Bucket: 'sliquid-test-bucket' })

    const err: any = new Error(`denied for ${SECRETS.AWS_ACCESS_KEY_ID} ${SECRETS.AWS_SECRET_ACCESS_KEY}`)
    err.name = 'Forbidden'
    err.$metadata = { httpStatusCode: 403 }
    s3Send.mockRejectedValue(err)
    res = await post('s3')
    expect(res.body).toEqual({ ok: false, message: 'HeadBucket failed: Forbidden (HTTP 403).' })
    expectNoSecrets(res.body)
  })

  it('mailchimp: pings the data centre from the key, never echoes it', async () => {
    setAllEnv()
    const fetchFn = stubFetch(() => json({ health_status: "Everything's Chimpy!" }))
    let res = await post('mailchimp')
    expect(res.body.ok).toBe(true)
    expect(fetchFn.mock.calls[0][0]).toBe('https://us21.api.mailchimp.com/3.0/ping')
    expectNoSecrets(res.body)

    stubFetch(() => json({}, 401))
    res = await post('mailchimp')
    expect(res.body.ok).toBe(false)
    expectNoSecrets(res.body)

    stubFetch(() => { throw new Error('getaddrinfo ENOTFOUND us21.api.mailchimp.com') })
    res = await post('mailchimp')
    expect(res.body).toEqual({ ok: false, message: 'Could not reach Mailchimp.' })
  })

  it.each(['emailjs', 'gemini', 'mcp'])('%s is a config-only check with no network call', async (id) => {
    setAllEnv()
    const fetchFn = stubFetch(() => { throw new Error('should not fetch') })
    const res = await post(id)
    expect(res.body.ok).toBe(true)
    expect(res.body.message).toContain('No live test is performed')
    expect(fetchFn).not.toHaveBeenCalled()
    expectNoSecrets(res.body)
  })
})

// ─── reward items ────────────────────────────────────────────────────────────

describe('/api/admin/integrations/reward-items', () => {
  it('round-trips through GET and PUT', async () => {
    let res = await request(app).get('/api/admin/integrations/reward-items').set('Authorization', legal())
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      shirt_product_id: null, shirt_size_variations: {}, pin_product_id: null,
      shipping_method_id: 'free_shipping', shipping_method_title: 'Free shipping',
    })

    res = await request(app).put('/api/admin/integrations/reward-items').set('Authorization', admin())
      .send({ shirt_product_id: 501, pin_product_id: 777, shirt_size_variations: { S: 601, M: 602 }, shipping_method_id: 'flat_rate', shipping_method_title: 'Flat' })
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      shirt_product_id: 501, shirt_size_variations: { S: 601, M: 602 }, pin_product_id: 777,
      shipping_method_id: 'flat_rate', shipping_method_title: 'Flat',
    })

    res = await request(app).get('/api/admin/integrations/reward-items').set('Authorization', admin())
    expect(res.body.shirt_product_id).toBe(501)

    res = await request(app).put('/api/admin/integrations/reward-items').set('Authorization', admin())
      .send({ pin_product_id: null })
    expect(res.body.pin_product_id).toBeNull()
    expect(res.body.shirt_product_id).toBe(501)
  })

  it('400s on malformed input with the thrown message', async () => {
    const res = await request(app).put('/api/admin/integrations/reward-items').set('Authorization', admin())
      .send({ shirt_product_id: -3 })
    expect(res.status).toBe(400)
    expect(res.body.message).toContain('shirt_product_id')

    const res2 = await request(app).put('/api/admin/integrations/reward-items').set('Authorization', admin())
      .send({ shirt_size_variations: { S: 'abc' } })
    expect(res2.status).toBe(400)
    expect(res2.body.message).toContain('size S')
  })

  it('Legal and tier1 cannot write; tier1 cannot read', async () => {
    expect((await request(app).put('/api/admin/integrations/reward-items').set('Authorization', legal()).send({ pin_product_id: 1 })).status).toBe(403)
    expect((await request(app).put('/api/admin/integrations/reward-items').set('Authorization', tier1()).send({ pin_product_id: 1 })).status).toBe(403)
    expect((await request(app).get('/api/admin/integrations/reward-items').set('Authorization', tier1())).status).toBe(403)
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'reward_pin_product_id'").get()
    expect(row).toBeUndefined()
  })
})

// ─── scrubber unit ───────────────────────────────────────────────────────────

describe('scrubSecrets', () => {
  it('strips credentials, query strings and key shapes', () => {
    const out = scrubSecrets('see https://a:b@x.example.com/p?q=1 and ck_abcdefgh12345 and Basic QWxhZGRpbjpvcGVu', ['zzzz'])
    expect(out).toBe('see https://x.example.com/p and [redacted] and Basic [redacted]')
  })
})
