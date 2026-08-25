import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { randomBytes, createHash } from 'crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { db } from '../database.js'
import { JWT_SECRET } from '../middleware/auth.js'

const router = Router()

// ─── Config ─────────────────────────────────────────────────────────────────
// All values come from env so the same code works in local dev and prod.
// See the Sliquid SSO Portal README for the canonical endpoint list.

const cfg = () => ({
  enabled: process.env.SSO_ENABLED === 'true',
  issuer: process.env.SSO_ISSUER ?? '',
  authorizeUrl: process.env.SSO_AUTHORIZE_URL ?? '',
  tokenUrl: process.env.SSO_TOKEN_URL ?? '',
  jwksUrl: process.env.SSO_JWKS_URL ?? '',
  clientId: process.env.SSO_CLIENT_ID ?? '',
  clientSecret: process.env.SSO_CLIENT_SECRET ?? '',
  redirectUri: process.env.SSO_REDIRECT_URI ?? '',
  scope: process.env.SSO_SCOPE ?? 'openid profile email',
  // Where the SPA lives — the post-login #token= handoff and error redirects land here.
  successRedirect: (process.env.SSO_SUCCESS_REDIRECT ?? 'http://localhost:5173').replace(/\/$/, ''),
})

function isConfigured(c = cfg()): boolean {
  return c.enabled && Boolean(c.authorizeUrl && c.tokenUrl && c.jwksUrl && c.clientId && c.clientSecret && c.redirectUri)
}

const base64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

const TX_COOKIE = 'sso_tx'

function txCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 5 * 60 * 1000, // 5 minutes — only needs to survive the round trip
    path: '/auth/google',
  }
}

// ─── User provisioning ────────────────────────────────────────────────────────

export interface SsoClaims {
  email: string
  name?: string
  sub: string
  role?: string // coarse IdP role: "admin" | "employee" (see ssoRoleToTier)
}

interface PortalUser {
  id: number
  name: string
  email: string
  role: string
  company: string | null
  status: string
}

/**
 * Map the IdP's coarse `role` claim onto a portal tier.
 *
 * The SSO IdP collapses its nine internal roles to `admin` | `employee` via
 * `externalRole()` before emitting the claim, so those two values are all we
 * ever see. `admin` covers three IdP roles — `sliquid_super_admin`,
 * `sliquid_owner` and `sliquid_development` — so any of those becomes a portal
 * admin here.
 *
 * Anything else — an absent claim, a new IdP role, a typo — lands on tier1. That
 * default is deliberate: this function runs before any human has looked at the
 * account, so an unrecognized role must yield the LEAST access, never the most.
 *
 * ⚠️ tier5 grants admin powers across the whole portal, which now includes
 * publishing brand assets to the external ChatGPT agent (see
 * PackshotApprovalPanel). Do not widen this mapping to floor everyone at tier5
 * for convenience — that is exactly the bug this replaced.
 *
 * ⚠️ SECTION B CAVEAT — Legal (tier8) has no SSO mapping yet, and a Legal user
 * arriving over SSO today lands on tier5 (full write admin), not tier8. The
 * IdP's coarse `role` claim only ever emits `admin` | `employee` — `sliquid_legal`
 * is one of the IdP roles `externalRole()` levels UP into `admin` (see the
 * `sliquid-sso` repo's `packages/shared/src/roles.ts`), so this function cannot
 * distinguish "Legal" from "super admin" using the claim it receives today.
 * Closing that gap needs a THIRD claim value (e.g. `admin_readonly`) minted on
 * the IdP side — a coordinated change in the `sliquid-sso` repo, not something
 * to fabricate here from a claim value the IdP does not emit. Until that lands,
 * tier8 must be assigned manually by an admin via `PUT /api/admin/users/:id/role`.
 */
export function ssoRoleToTier(role?: string): string {
  return role?.trim().toLowerCase() === 'admin' ? 'tier5' : 'tier1'
}

/**
 * Find-or-create a portal user from verified SSO claims.
 * - New users are provisioned active, with an unusable password hash, at the tier
 *   `ssoRoleToTier()` derives from the IdP's role claim — tier5 for `admin`,
 *   tier1 for everyone else.
 * - Existing users keep their current role (never downgrade) but are reactivated and
 *   have their sso_sub linked + last_login stamped.
 */
export function upsertSsoUser(claims: SsoClaims): PortalUser {
  const email = claims.email.trim().toLowerCase()
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any

  if (existing) {
    db.prepare("UPDATE users SET sso_sub = ?, status = 'active', last_login = datetime('now') WHERE id = ?")
      .run(claims.sub, existing.id)
    return {
      id: existing.id,
      name: existing.name,
      email: existing.email,
      role: existing.role, // keep existing role — SSO promotes, never demotes
      company: existing.company,
      status: 'active',
    }
  }

  const unusableHash = bcrypt.hashSync(randomBytes(32).toString('hex'), 10)
  const name = claims.name?.trim() || email
  const role = ssoRoleToTier(claims.role)
  const result = db.prepare(
    "INSERT INTO users (name, email, company, password_hash, role, status, sso_sub, last_login) " +
    "VALUES (?, ?, ?, ?, ?, 'active', ?, datetime('now'))"
  ).run(name, email, 'Sliquid', unusableHash, role, claims.sub)

  return {
    id: result.lastInsertRowid as number,
    name,
    email,
    role,
    company: 'Sliquid',
    status: 'active',
  }
}

// ─── Routes ─────────────────────────────────────────────────────────────────

// GET /auth/google/login — start the OIDC Authorization Code + PKCE flow
router.get('/login', (req, res) => {
  const c = cfg()
  if (!isConfigured(c)) {
    res.status(503).json({ message: 'SSO is not configured' })
    return
  }

  const verifier = base64url(randomBytes(32))
  const challenge = base64url(createHash('sha256').update(verifier).digest())
  const state = randomBytes(16).toString('hex')

  // Stash {state, verifier} in a short-lived signed cookie (stateless across instances)
  const tx = jwt.sign({ state, verifier }, JWT_SECRET, { expiresIn: '5m' })
  res.cookie(TX_COOKIE, tx, txCookieOptions())

  const url = new URL(c.authorizeUrl)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', c.clientId)
  url.searchParams.set('redirect_uri', c.redirectUri)
  url.searchParams.set('scope', c.scope)
  url.searchParams.set('state', state)
  url.searchParams.set('code_challenge', challenge)
  url.searchParams.set('code_challenge_method', 'S256')

  res.redirect(url.toString())
})

// Lazily-built JWKS set (jose caches keys + handles rotation)
let jwks: ReturnType<typeof createRemoteJWKSet> | null = null
function getJwks(jwksUrl: string) {
  if (!jwks) jwks = createRemoteJWKSet(new URL(jwksUrl))
  return jwks
}

// GET /auth/google/callback — exchange code, verify id_token, mint portal session
router.get('/callback', async (req, res) => {
  const c = cfg()
  const fail = (reason: string) => {
    res.clearCookie(TX_COOKIE, { path: '/auth/google' })
    res.redirect(`${c.successRedirect}/employee-login?sso_error=${encodeURIComponent(reason)}`)
  }

  if (!isConfigured(c)) return fail('sso_unavailable')

  const { code, state, error } = req.query as Record<string, string>
  if (error) return fail(error)
  if (!code || !state) return fail('missing_code')

  // 1. Verify state against the transaction cookie
  const txRaw = (req as any).cookies?.[TX_COOKIE]
  if (!txRaw) return fail('missing_state')
  let verifier: string
  try {
    const tx = jwt.verify(txRaw, JWT_SECRET) as { state: string; verifier: string }
    if (tx.state !== state) return fail('state_mismatch')
    verifier = tx.verifier
  } catch {
    return fail('invalid_state')
  }

  try {
    // 2. Exchange the code for tokens (confidential client → HTTP Basic auth)
    const basic = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString('base64')
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: c.redirectUri,
      code_verifier: verifier,
    })
    const tokenRes = await fetch(c.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
      },
      body,
    })
    if (!tokenRes.ok) {
      console.error('[sso] Token exchange failed:', tokenRes.status, await tokenRes.text().catch(() => ''))
      return fail('token_exchange_failed')
    }
    const tokens = (await tokenRes.json()) as { id_token?: string }
    if (!tokens.id_token) return fail('no_id_token')

    // 3. Verify the id_token (RS256) against the JWKS, with iss/aud checks
    const { payload } = await jwtVerify(tokens.id_token, getJwks(c.jwksUrl), {
      issuer: c.issuer,
      audience: c.clientId,
    })

    const email = typeof payload.email === 'string' ? payload.email : ''
    if (!email) return fail('no_email')

    // 4. Find-or-create the portal user, then mint our own session JWT
    const user = upsertSsoUser({
      email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      sub: String(payload.sub ?? ''),
      role: typeof payload.role === 'string' ? payload.role : undefined,
    })

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' })

    // 5. Hand the session to the SPA via the existing #token= handoff (AuthContext reads it)
    res.clearCookie(TX_COOKIE, { path: '/auth/google' })
    res.redirect(`${c.successRedirect}/dashboard#token=${encodeURIComponent(token)}`)
  } catch (err) {
    console.error('[sso] Callback error:', err)
    return fail('verification_failed')
  }
})

export default router
