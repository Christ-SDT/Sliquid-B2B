import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import express, { type Express } from 'express'
import { SignJWT, generateKeyPair } from 'jose'

/**
 * Tests for the MCP resource-server auth layer.
 *
 * The JWKS is mocked: we generate a real RS256 keypair in-process and stub
 * `createRemoteJWKSet` so it resolves to that public key. Everything else —
 * signature verification, iss/aud/exp/nbf checking — is the REAL jose code path,
 * so these tests exercise the same verification production runs.
 */

const keys = vi.hoisted(() => ({ publicKey: null as unknown }))

vi.mock('jose', async importOriginal => {
  const actual = await importOriginal<typeof import('jose')>()
  return {
    ...actual,
    // jose's remote key set is just a key-resolver function; hand back our local one.
    createRemoteJWKSet: () => async () => keys.publicKey,
  }
})

const ISSUER = 'https://sso-api.sliquid.com'
const JWKS_URL = 'https://sso-api.sliquid.com/oauth2/jwks'
const RESOURCE = 'https://api.sliquid.example/mcp'
/** The audience a normal PORTAL login token carries — the confused-deputy case. */
const PORTAL_CLIENT = 'partner-portal'
const ALLOWED_ORIGIN = 'https://portal.sliquid.com'
const SCOPE = 'mcp:read'

// MCP_RESOURCE_URI is captured at module load, so env must be set BEFORE the
// dynamic import below (static imports are hoisted above these assignments).
process.env['MCP_RESOURCE_URI'] = RESOURCE
process.env['SSO_ISSUER'] = ISSUER
process.env['SSO_JWKS_URL'] = JWKS_URL
process.env['ALLOWED_ORIGINS'] = ALLOWED_ORIGIN
delete process.env['MCP_AUTH_MODE']

const { requireMcpScope, protectedResourceMetadata, isMcpAuthEnabled, MCP_RESOURCE_URI } =
  await import('../middleware/mcpAuth.js')
const { auditMcp } = await import('../mcpAudit.js')
const { wellKnownRouter } = await import('../routes/wellKnown.js')

const { publicKey, privateKey } = await generateKeyPair('RS256')
keys.publicKey = publicKey

// ─── helpers ─────────────────────────────────────────────────────────────────

interface TokenOpts {
  aud?: string | string[]
  scope?: string
  scp?: string[]
  sub?: string | null
  expiresIn?: number // seconds from now; negative = already expired
  extra?: Record<string, unknown>
}

async function makeToken(opts: TokenOpts = {}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiresIn = opts.expiresIn ?? 300

  const claims: Record<string, unknown> = { ...(opts.extra ?? {}) }
  if (opts.scope !== undefined) claims['scope'] = opts.scope
  else if (opts.scp === undefined) claims['scope'] = SCOPE
  if (opts.scp !== undefined) claims['scp'] = opts.scp

  let jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(ISSUER)
    .setAudience(opts.aud ?? RESOURCE)
    .setIssuedAt(now - 10)
    .setExpirationTime(now + expiresIn)

  if (opts.sub !== null) jwt = jwt.setSubject(opts.sub ?? 'sso-subject-123')

  return jwt.sign(privateKey)
}

function makeApp(scope = SCOPE): Express {
  const app = express()
  app.get('/mcp', requireMcpScope(scope), (req, res) => {
    res.json({ ok: true, mcp: req.mcp })
  })
  return app
}

beforeEach(() => {
  process.env['MCP_RESOURCE_URI'] = RESOURCE
  process.env['SSO_ISSUER'] = ISSUER
  process.env['SSO_JWKS_URL'] = JWKS_URL
  process.env['ALLOWED_ORIGINS'] = ALLOWED_ORIGIN
  delete process.env['MCP_AUTH_MODE']
  delete process.env['MCP_SCOPES_SUPPORTED']
})

// ─── 401s ────────────────────────────────────────────────────────────────────

describe('requireMcpScope — unauthenticated', () => {
  it('401s with a resource_metadata challenge when no Authorization header is sent', async () => {
    const res = await request(makeApp()).get('/mcp')

    expect(res.status).toBe(401)
    // The 401 advertises the full set a client must REQUEST (scopesSupported()),
    // NOT the single scope this resource enforces. A narrow challenge would make
    // ChatGPT's connector build an authorize request without `openid`, which the
    // Sliquid IdP rejects with invalid_scope.
    expect(res.headers['www-authenticate']).toBe(
      'Bearer resource_metadata="https://api.sliquid.example/.well-known/oauth-protected-resource", scope="openid assets:read"',
    )
  })

  it('advertises scopesSupported() on the 401, mirroring the RFC 9728 document', async () => {
    process.env['MCP_SCOPES_SUPPORTED'] = 'openid assets:read extra:scope'

    const res = await request(makeApp()).get('/mcp')

    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toContain('scope="openid assets:read extra:scope"')
    // One source of truth: the challenge and the discovery document must agree.
    expect(protectedResourceMetadata()['scopes_supported']).toEqual([
      'openid', 'assets:read', 'extra:scope',
    ])
  })

  it('always includes openid in the 401 challenge — the IdP rejects authorize without it', async () => {
    const res = await request(makeApp()).get('/mcp')

    const challenge = res.headers['www-authenticate'] as string
    const advertised = /scope="([^"]*)"/.exec(challenge)?.[1]?.split(' ') ?? []
    expect(advertised).toContain('openid')
    expect(advertised).toContain('assets:read')
  })

  it('401s on a malformed token', async () => {
    const res = await request(makeApp())
      .get('/mcp')
      .set('Authorization', 'Bearer not-a-jwt-at-all')

    expect(res.status).toBe(401)
    expect(res.headers['www-authenticate']).toContain('resource_metadata=')
  })

  it('401s on a token signed by the wrong key', async () => {
    const attacker = await generateKeyPair('RS256')
    const forged = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(RESOURCE)
      .setSubject('attacker')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(attacker.privateKey)

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(401)
  })

  it('401s on a token from a different issuer', async () => {
    const token = await makeToken()
    process.env['SSO_ISSUER'] = 'https://evil.example'
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('401s on an expired token', async () => {
    const token = await makeToken({ expiresIn: -60 })
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
    expect(res.body.ok).toBeUndefined()
  })

  it('401s on a not-yet-valid (nbf in the future) token', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setAudience(RESOURCE)
      .setSubject('future-user')
      .setIssuedAt(now)
      .setNotBefore(now + 600)
      .setExpirationTime(now + 1200)
      .sign(privateKey)

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('401s when the token has no sub claim', async () => {
    const token = await makeToken({ sub: null })
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })
})

// ─── THE CONFUSED-DEPUTY CASE ────────────────────────────────────────────────

describe('requireMcpScope — audience binding (confused deputy)', () => {
  /**
   * ⚠️ THIS IS THE CENTRAL SECURITY TEST.
   * The portal's SSO sessions and this MCP endpoint trust the SAME issuer and
   * the SAME signing key. This token is completely valid — right issuer, right
   * key, unexpired, and it even carries the required scope. The ONLY thing wrong
   * with it is that it was minted for the portal client, not for this resource.
   * If this test ever goes green on a 200, any portal user's access token can be
   * replayed against the MCP endpoint.
   */
  it('rejects a token whose audience is the portal client, not the MCP resource', async () => {
    const portalToken = await makeToken({ aud: PORTAL_CLIENT, scope: SCOPE })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${portalToken}`)

    expect(res.status).toBe(401)
    expect(res.body.ok).toBeUndefined()
    expect(res.headers['www-authenticate']).toContain('resource_metadata=')
  })

  it('rejects a token with no aud claim at all', async () => {
    const now = Math.floor(Date.now() / 1000)
    const token = await new SignJWT({ scope: SCOPE })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(ISSUER)
      .setSubject('no-aud')
      .setIssuedAt(now)
      .setExpirationTime(now + 300)
      .sign(privateKey)

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
  })

  it('accepts a multi-valued aud that CONTAINS the MCP resource (RFC 8707)', async () => {
    const token = await makeToken({ aud: [PORTAL_CLIENT, RESOURCE] })
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})

// ─── scopes ──────────────────────────────────────────────────────────────────

describe('requireMcpScope — scopes', () => {
  it('403s with insufficient_scope when a valid token lacks the required scope', async () => {
    const token = await makeToken({ scope: 'mcp:read profile' })

    const res = await request(makeApp('mcp:write'))
      .get('/mcp')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.headers['www-authenticate']).toBe(
      'Bearer error="insufficient_scope", scope="mcp:write"',
    )
  })

  it('calls next() and populates req.mcp for a valid, correctly-scoped token', async () => {
    const token = await makeToken({
      scope: `openid ${SCOPE} mcp:write`,
      extra: { email: 'employee@sliquid.com', client_id: 'chatgpt-connector' },
    })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.mcp).toEqual({
      subject: 'sso-subject-123',
      email: 'employee@sliquid.com',
      clientId: 'chatgpt-connector',
      scopes: ['openid', SCOPE, 'mcp:write'],
    })
  })

  it('reads scopes from an scp array claim', async () => {
    const token = await makeToken({ scope: undefined, scp: ['mcp:read', 'mcp:write'] })
    const res = await request(makeApp('mcp:write')).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.mcp.scopes).toContain('mcp:write')
  })

  it('does not honour a wildcard scope on a real token', async () => {
    const token = await makeToken({ scope: '*' })
    const res = await request(makeApp('mcp:write')).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(403)
  })
})

// ─── token transport ─────────────────────────────────────────────────────────

describe('requireMcpScope — token transport', () => {
  it('ignores a token supplied in the query string', async () => {
    const token = await makeToken()
    const res = await request(makeApp()).get(`/mcp?access_token=${token}`)
    expect(res.status).toBe(401)
  })

  it('ignores a token supplied in a cookie', async () => {
    const token = await makeToken()
    const res = await request(makeApp()).get('/mcp').set('Cookie', `access_token=${token}`)
    expect(res.status).toBe(401)
  })
})

// ─── Origin / DNS rebinding ──────────────────────────────────────────────────

describe('requireMcpScope — Origin validation', () => {
  it('403s when Origin is present and not in ALLOWED_ORIGINS', async () => {
    const token = await makeToken()
    const res = await request(makeApp())
      .get('/mcp')
      .set('Origin', 'https://attacker.example')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.body.message).toBe('Origin not allowed')
  })

  it('allows a request with NO Origin header (server-to-server, what ChatGPT sends)', async () => {
    const token = await makeToken()
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it('allows an Origin that is in ALLOWED_ORIGINS', async () => {
    const token = await makeToken()
    const res = await request(makeApp())
      .get('/mcp')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  it('rejects a disallowed Origin even in MCP_AUTH_MODE=none', async () => {
    process.env['MCP_AUTH_MODE'] = 'none'
    const res = await request(makeApp()).get('/mcp').set('Origin', 'https://attacker.example')
    expect(res.status).toBe(403)
  })
})

// ─── escape hatch ────────────────────────────────────────────────────────────

describe('MCP_AUTH_MODE escape hatch', () => {
  afterEach(() => {
    delete process.env['MCP_AUTH_MODE']
  })

  it('defaults to oauth enforcement when unset', () => {
    expect(isMcpAuthEnabled()).toBe(true)
  })

  it('does not treat an unrecognised value as a bypass (fails closed)', async () => {
    process.env['MCP_AUTH_MODE'] = 'off'
    expect(isMcpAuthEnabled()).toBe(true)
    const res = await request(makeApp()).get('/mcp')
    expect(res.status).toBe(401)
  })

  it('bypasses verification and populates an anonymous principal when set to none', async () => {
    process.env['MCP_AUTH_MODE'] = 'none'
    expect(isMcpAuthEnabled()).toBe(false)

    const res = await request(makeApp('mcp:write')).get('/mcp')

    expect(res.status).toBe(200)
    expect(res.body.mcp).toEqual({ subject: 'anonymous', scopes: ['*'] })
  })

  it('logs a loud banner exactly once when serving in bypass mode', async () => {
    process.env['MCP_AUTH_MODE'] = 'none'
    await request(makeApp()).get('/mcp')

    // setup.ts installs a persistent console.warn spy, so its call history covers
    // the whole file — including the first bypassed request in the test above.
    const calls = (console.warn as unknown as { mock: { calls: unknown[][] } }).mock.calls
    const banner = calls.map(c => String(c[0])).filter(m => m.includes('MCP_AUTH_MODE=none'))

    expect(banner.join('\n')).toContain('UNAUTHENTICATED')
    expect(banner).toHaveLength(1) // once per process, not once per request
  })
})

// ─── misconfiguration ────────────────────────────────────────────────────────

describe('requireMcpScope — misconfiguration fails closed', () => {
  it('503s rather than serving traffic when SSO_JWKS_URL is missing', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    delete process.env['SSO_JWKS_URL']

    const token = await makeToken()
    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(503)
    err.mockRestore()
  })
})

// ─── RFC 9728 metadata ───────────────────────────────────────────────────────

describe('protectedResourceMetadata', () => {
  it('exports MCP_RESOURCE_URI from the environment', () => {
    expect(MCP_RESOURCE_URI).toBe(RESOURCE)
  })

  it('returns the RFC 9728 shape', () => {
    const meta = protectedResourceMetadata()
    expect(meta['resource']).toBe(RESOURCE)
    expect(meta['authorization_servers']).toEqual([ISSUER])
    // `assets:read` must stay in step with the scope `createMcpRouter()` enforces —
    // advertising a scope nothing checks sends clients to request something the IdP
    // never maps, and every call then 403s.
    //
    // `openid` is not enforced here; it is advertised because the Sliquid IdP returns
    // `invalid_scope` for any authorize request whose effective scope set lacks it, so
    // a client that requested only `assets:read` from this document could never
    // complete the flow.
    expect(meta['scopes_supported']).toEqual(['openid', 'assets:read'])
    expect(meta['bearer_methods_supported']).toEqual(['header'])
  })

  it('honours MCP_SCOPES_SUPPORTED', () => {
    process.env['MCP_SCOPES_SUPPORTED'] = 'mcp:read, mcp:assets'
    expect(protectedResourceMetadata()['scopes_supported']).toEqual(['mcp:read', 'mcp:assets'])
  })
})

describe('GET /.well-known/oauth-protected-resource', () => {
  function metadataApp(): Express {
    const app = express()
    app.use('/.well-known', wellKnownRouter)
    return app
  }

  it('serves the metadata publicly with a cache header', async () => {
    const res = await request(metadataApp()).get('/.well-known/oauth-protected-resource')

    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toContain('max-age=')
    expect(res.body.resource).toBe(RESOURCE)
    expect(res.body.bearer_methods_supported).toEqual(['header'])
  })

  it('answers the path-suffixed discovery form too', async () => {
    const res = await request(metadataApp()).get('/.well-known/oauth-protected-resource/mcp')
    expect(res.status).toBe(200)
    expect(res.body.resource).toBe(RESOURCE)
  })
})

// ─── audit logging ───────────────────────────────────────────────────────────

describe('auditMcp', () => {
  it('logs principal, tool, asset id, result, checksum and a timestamp', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})

    auditMcp({ principal: 'sso-subject-123', tool: 'get_asset', assetId: 'asset-42', result: 'ok', sha256: 'abc123' })

    const line = String(log.mock.calls.at(-1)?.[0])
    expect(line.startsWith('[mcp-audit] ')).toBe(true)
    const parsed = JSON.parse(line.slice('[mcp-audit] '.length))
    expect(parsed).toMatchObject({
      principal: 'sso-subject-123',
      tool: 'get_asset',
      assetId: 'asset-42',
      result: 'ok',
      sha256: 'abc123',
    })
    expect(typeof parsed.ts).toBe('string')
    log.mockRestore()
  })

  it('redacts tokens and email addresses out of detail', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    auditMcp({
      principal: 'sub-1',
      tool: 'get_asset',
      result: 'denied',
      detail: 'rejected eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.c2lnbmF0dXJlX2hlcmU for user someone@sliquid.com',
    })

    const line = String(warn.mock.calls.at(-1)?.[0])
    expect(line).not.toContain('@sliquid.com')
    expect(line).not.toContain('eyJhbGciOiJSUzI1NiJ9')
    expect(line).toContain('[redacted-token]')
    expect(line).toContain('[redacted-email]')
    warn.mockRestore()
  })

  it('routes errors to console.error', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    auditMcp({ principal: 'sub-1', tool: 'get_asset', result: 'error', detail: 'boom' })
    expect(String(err.mock.calls.at(-1)?.[0])).toContain('"result":"error"')
    err.mockRestore()
  })
})

// ─── Cross-repo contract ─────────────────────────────────────────────────────

/**
 * These pin the exact ACCESS-token shape the Sliquid IdP emits
 * (`Christ-SDT/Sliquid-SSO-Portal`, see `apps/api/src/lib/oidcTokens.ts`).
 *
 * That IdP is a separate repo with its own deploy, so nothing here fails at
 * compile time when it changes — this is the only place the assumption is
 * checked. If one of these breaks, the IdP's token format moved and
 * `parseScopes` / the audience check need revisiting, not the test.
 */
describe('Sliquid IdP token contract', () => {
  it('accepts a token carrying ONLY iss, sub, aud, scope, iat, exp', async () => {
    // Deliberately minimal: the IdP emits no email, client_id, role, nbf, jti or azp.
    const token = await makeToken({ scope: `openid ${SCOPE}` })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.mcp.subject).toBe('sso-subject-123')
    expect(res.body.mcp.scopes).toEqual(expect.arrayContaining(['openid', SCOPE]))
    // Absent because the IdP does not emit them — expected, not a defect.
    expect(res.body.mcp.email).toBeUndefined()
    expect(res.body.mcp.clientId).toBeUndefined()
  })

  it('accepts aud as a single string, which is what accessTokenAudience() returns', async () => {
    const token = await makeToken({ aud: RESOURCE, scope: SCOPE })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
  })

  it('rejects the client-id fallback aud used when oauth_clients.audience is blank', async () => {
    // accessTokenAudience() returns client.clientId when no audience is pinned. That
    // token is valid and correctly signed — it is simply not for us. Forgetting the
    // audience field on the ChatGPT client is the likeliest misconfiguration, and it
    // must fail rather than be waved through.
    const token = await makeToken({ aud: 'chatgpt-brand-agent-a1b2', scope: SCOPE })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(401)
  })

  it('403s when the IdP silently dropped assets:read from the granted scopes', async () => {
    // The IdP filters unknown/ungranted scopes with no error, so a client that was
    // never granted assets:read still completes the flow and gets a token like this.
    const token = await makeToken({ scope: 'openid profile email' })

    const res = await request(makeApp()).get('/mcp').set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(403)
    expect(res.headers['www-authenticate']).toContain('insufficient_scope')
  })
})
