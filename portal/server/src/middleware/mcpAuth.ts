import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose'
import { auditMcp } from '../mcpAudit.js'

/**
 * OAuth 2.1 RESOURCE SERVER auth for the MCP endpoint.
 *
 * This is a SEPARATE principal space from `requireAuth` (middleware/auth.ts):
 *   - it never mints or accepts a portal JWT
 *   - it never reads the `users` table
 *   - it populates `req.mcp`, never `req.user`
 *
 * ⚠️ THE CONFUSED-DEPUTY THREAT — why the audience check is the whole point.
 * The portal's own browser sessions and this MCP endpoint trust the SAME issuer
 * (the Sliquid SSO IdP). Without an audience check, an access token minted for
 * the portal client could simply be replayed against the MCP endpoint and would
 * verify perfectly — same issuer, same signing key, unexpired. RFC 8707 resource
 * indicators close that hole: the IdP stamps `aud` with the resource the token is
 * for, and we reject anything whose `aud` does not contain MCP_RESOURCE_URI.
 * Do not relax the `audience` option below, and do not fall back to accepting a
 * token when MCP_RESOURCE_URI is unset — that would silently reopen the replay.
 */

export interface McpPrincipal {
  subject: string
  email?: string
  clientId?: string
  scopes: string[]
}

declare global {
  namespace Express {
    interface Request {
      mcp?: McpPrincipal
    }
  }
}

// ─── Config ──────────────────────────────────────────────────────────────────

/**
 * The canonical URI of this MCP resource, e.g. https://api.example.com/mcp.
 * This is the value the IdP must stamp into `aud`. It is compared BYTE FOR BYTE
 * (no trailing-slash normalization) — it must match what the IdP issues exactly.
 */
export const MCP_RESOURCE_URI: string = (process.env.MCP_RESOURCE_URI ?? '').trim()

type AuthMode = 'oauth' | 'none'

/**
 * `oauth` (default) = full verification. `none` = pilot escape hatch.
 * Read per request rather than cached so a deploy-time flip is honoured and so
 * the validation code below stays exercised in tests under both modes.
 * NOTE the polarity: anything other than the literal 'none' means enforce.
 * A typo'd MCP_AUTH_MODE therefore fails CLOSED.
 */
function authMode(): AuthMode {
  return (process.env.MCP_AUTH_MODE ?? '').trim().toLowerCase() === 'none' ? 'none' : 'oauth'
}

export function isMcpAuthEnabled(): boolean {
  return authMode() === 'oauth'
}

function issuer(): string {
  return (process.env.SSO_ISSUER ?? '').trim()
}

function jwksUrl(): string {
  return (process.env.SSO_JWKS_URL ?? '').trim()
}

/** Scopes advertised in the RFC 9728 metadata document. */
function scopesSupported(): string[] {
  // Must match the scope the MCP router actually enforces (`assets:read`) — this list is
  // advertised in the RFC 9728 metadata, so a mismatch sends clients to request a scope the
  // IdP will never map to anything, and every call then 403s with insufficient_scope.
  const raw = (process.env.MCP_SCOPES_SUPPORTED ?? 'assets:read').trim()
  return raw.split(/[\s,]+/).filter(Boolean)
}

function allowedOrigins(): string[] {
  // Mirrors app.ts so the MCP endpoint and the REST API share one allowlist.
  return process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
    : ['http://localhost:5173', 'http://localhost:4173']
}

/** Where the RFC 9728 document lives: the resource's ORIGIN + /.well-known/… */
function resourceMetadataUrl(): string {
  const path = '/.well-known/oauth-protected-resource'
  try {
    return new URL(MCP_RESOURCE_URI).origin + path
  } catch {
    return path
  }
}

// ─── Loud startup warning for the pilot escape hatch ─────────────────────────

let bypassWarned = false

function warnBypass() {
  if (bypassWarned) return
  bypassWarned = true
  console.warn('[mcp-auth] ****************************************************************')
  console.warn('[mcp-auth] * MCP_AUTH_MODE=none — MCP ENDPOINT IS UNAUTHENTICATED.        *')
  console.warn('[mcp-auth] * Every caller is served as the anonymous principal with a     *')
  console.warn('[mcp-auth] * wildcard scope. PILOT DEPLOYS ONLY — never leave this set    *')
  console.warn('[mcp-auth] * in production.                                               *')
  console.warn('[mcp-auth] ****************************************************************')
}

// Fires at import time (i.e. server startup) when the hatch is already open.
// `warnBypass` is also called on the first bypassed request, so a late-set env
// var still produces the warning exactly once.
if (authMode() === 'none') warnBypass()

// ─── JWKS (cached — never refetched per request) ──────────────────────────────

/**
 * jose's remote key set does its own caching, rotation and cooldown, so the ONE
 * thing we must not do is build a new one per request — that would refetch the
 * JWKS on every call. Cached per URL so a config change is picked up without a
 * restart while steady state stays a single shared instance.
 */
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(url: string) {
  let set = jwksCache.get(url)
  if (!set) {
    set = createRemoteJWKSet(new URL(url))
    jwksCache.set(url, set)
  }
  return set
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Bearer token from the Authorization HEADER ONLY.
 * Query-string and cookie tokens are deliberately unsupported: query strings
 * land in access logs and referrers, and a cookie would make the endpoint
 * CSRF-reachable from a browser. RFC 9728 `bearer_methods_supported: ['header']`
 * advertises exactly this.
 */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization
  if (typeof header !== 'string') return null
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim())
  return match ? (match[1] as string) : null
}

/** `scope` (space-delimited string) or `scp` (array, or string) — both are seen in the wild. */
function parseScopes(payload: JWTPayload): string[] {
  const out = new Set<string>()

  const scope = (payload as Record<string, unknown>)['scope']
  if (typeof scope === 'string') {
    for (const s of scope.split(/\s+/)) if (s) out.add(s)
  }

  const scp = (payload as Record<string, unknown>)['scp']
  if (Array.isArray(scp)) {
    for (const s of scp) if (typeof s === 'string' && s) out.add(s)
  } else if (typeof scp === 'string') {
    for (const s of scp.split(/\s+/)) if (s) out.add(s)
  }

  return [...out]
}

function stringClaim(payload: JWTPayload, key: string): string | undefined {
  const v = (payload as Record<string, unknown>)[key]
  return typeof v === 'string' && v ? v : undefined
}

/**
 * DNS-rebinding defense required by the MCP spec: a browser page on an attacker
 * origin that has rebound DNS to this host would still send its Origin. A request
 * with NO Origin (server-to-server — what ChatGPT sends) is normal and allowed.
 */
function originAllowed(req: Request): boolean {
  const origin = req.headers.origin
  if (typeof origin !== 'string' || origin === '') return true
  return allowedOrigins().includes(origin)
}

function denyUnauthorized(res: Response, scope: string, subject: string, detail: string) {
  res.setHeader(
    'WWW-Authenticate',
    `Bearer resource_metadata="${resourceMetadataUrl()}", scope="${scope}"`,
  )
  auditMcp({ principal: subject, tool: 'mcp:auth', result: 'denied', detail })
  res.status(401).json({ message: 'Unauthorized' })
}

// ─── The middleware ──────────────────────────────────────────────────────────

export function requireMcpScope(scope: string): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // (8) Origin check runs in EVERY mode — it is a transport-level defense and
    // has nothing to do with whether tokens are being verified.
    if (!originAllowed(req)) {
      auditMcp({ principal: 'unknown', tool: 'mcp:auth', result: 'denied', detail: 'origin_not_allowed' })
      res.status(403).json({ message: 'Origin not allowed' })
      return
    }

    // Pilot escape hatch. Short-circuits BEFORE any scope check so a wildcard
    // scope never has to be honoured on the real verification path.
    if (!isMcpAuthEnabled()) {
      warnBypass()
      req.mcp = { subject: 'anonymous', scopes: ['*'] }
      next()
      return
    }

    // Fail CLOSED when misconfigured. Serving traffic with no audience to bind
    // to is exactly the confused-deputy condition this module exists to prevent.
    if (!MCP_RESOURCE_URI || !issuer() || !jwksUrl()) {
      console.error('[mcp-auth] Refusing requests: MCP_RESOURCE_URI, SSO_ISSUER and SSO_JWKS_URL must all be set')
      auditMcp({ principal: 'unknown', tool: 'mcp:auth', result: 'error', detail: 'not_configured' })
      res.status(503).json({ message: 'MCP auth is not configured' })
      return
    }

    const token = bearerToken(req)
    if (!token) {
      denyUnauthorized(res, scope, 'anonymous', 'missing_bearer_token')
      return
    }

    let payload: JWTPayload
    try {
      // (2)(3)(4) signature + iss + aud + exp/nbf, RS256 only.
      // `audience` is the RFC 8707 binding — see the header comment.
      const verified = await jwtVerify(token, getJwks(jwksUrl()), {
        issuer: issuer(),
        audience: MCP_RESOURCE_URI,
        algorithms: ['RS256'],
      })
      payload = verified.payload
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'invalid_token'
      const claim = (err as { claim?: string }).claim
      // Never echo the token or the raw error text back to the caller.
      denyUnauthorized(res, scope, 'unknown', claim ? `${code}:${claim}` : code)
      return
    }

    const subject = stringClaim(payload, 'sub')
    if (!subject) {
      denyUnauthorized(res, scope, 'unknown', 'missing_sub')
      return
    }

    const scopes = parseScopes(payload)
    if (!scopes.includes(scope)) {
      // (5) Authenticated but not authorized → 403, per RFC 6750.
      res.setHeader('WWW-Authenticate', `Bearer error="insufficient_scope", scope="${scope}"`)
      auditMcp({ principal: subject, tool: 'mcp:auth', result: 'denied', detail: `insufficient_scope:${scope}` })
      res.status(403).json({ message: 'Insufficient scope' })
      return
    }

    const principal: McpPrincipal = { subject, scopes }
    const email = stringClaim(payload, 'email')
    if (email) principal.email = email
    const clientId =
      stringClaim(payload, 'client_id') ?? stringClaim(payload, 'azp') ?? stringClaim(payload, 'cid')
    if (clientId) principal.clientId = clientId

    req.mcp = principal
    next()
  }
}

// ─── RFC 9728 protected resource metadata ────────────────────────────────────

export function protectedResourceMetadata(): Record<string, unknown> {
  const as = issuer()
  return {
    resource: MCP_RESOURCE_URI,
    authorization_servers: as ? [as] : [],
    scopes_supported: scopesSupported(),
    bearer_methods_supported: ['header'],
  }
}
