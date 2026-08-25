import { describe, it, expect } from 'vitest'
import { app } from '../../app.js'

/**
 * Express has no Fastify-style `onRoute` hook, so this walks the mounted
 * router stack directly. Every guard middleware in `middleware/auth.ts` is
 * tagged with `__roleGuard: 'authenticate' | 'read' | 'write'` (see the
 * `;(handler as any).__roleGuard = …` lines there) specifically so a test
 * like this one can classify every route in the app without hand-maintaining
 * a parallel list that inevitably drifts from the real router.
 */

interface RouteEntry {
  method: string
  url: string
  guards: string[]
}

// Express 4: `app._router.stack` is the top-level middleware/route stack.
// If this ever moves to Express 5, `app._router` is removed in favor of
// `app.router` — swap the accessor below and this comment can stay as the
// breadcrumb for whoever hits the resulting empty table.
function getRootStack(expressApp: typeof app): any[] {
  const router = (expressApp as any)._router ?? (expressApp as any).router
  if (!router?.stack) {
    throw new Error(
      'Could not find the Express router stack on `app` (checked ._router and .router). ' +
      'If this project has moved to Express 5, update getRootStack() in admin-route-table.test.ts.'
    )
  }
  return router.stack
}

// Best-effort mount-prefix extraction from an Express-generated mount regexp,
// e.g. /^\/api\/admin\/?(?=\/|$)/i -> '/api/admin'. Only used for cosmetic
// path reconstruction in failure messages; matching logic below always works
// off the literal `url` strings this produces, never off the regexp itself.
function extractMountPrefix(regexp: RegExp | undefined): string {
  if (!regexp) return ''
  const src = regexp.source
  const m = src.match(/^\^\\\/(.+?)\\\/\?\(/)
  if (!m) return ''
  return '/' + m[1].replace(/\\\//g, '/')
}

function walk(stack: any[], prefix: string, out: RouteEntry[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const routePath: string = layer.route.path
      const methods = Object.keys(layer.route.methods).filter(m => (layer.route.methods as any)[m])
      const handlers = layer.route.stack.map((s: any) => s.handle)
      const guards = handlers.map((h: any) => h.__roleGuard).filter(Boolean)
      const url = prefix + (routePath === '/' ? '' : routePath)
      for (const m of methods) {
        out.push({ method: m.toUpperCase(), url, guards })
      }
    } else if (layer.handle?.stack) {
      // A mounted sub-router (or the app's own root router when nested).
      const mount = extractMountPrefix(layer.regexp)
      walk(layer.handle.stack, prefix + mount, out)
    }
  }
}

function buildRouteTable(expressApp: typeof app): RouteEntry[] {
  const out: RouteEntry[] = []
  walk(getRootStack(expressApp), '', out)
  out.sort((a, b) => a.url.localeCompare(b.url) || a.method.localeCompare(b.method))
  return out
}

const ROUTE_TABLE = buildRouteTable(app)

function fmt(r: RouteEntry): string {
  return `${r.method} ${r.url} [${r.guards.join(',')}]`
}

// Sanity: the walker actually found the real app, not an empty stub.
describe('admin-route-table.test.ts — sanity', () => {
  it('discovered a substantial number of routes', () => {
    expect(ROUTE_TABLE.length).toBeGreaterThan(50)
  })

  it('discovered at least one known route with its known guards (canary)', () => {
    const row = ROUTE_TABLE.find(r => r.method === 'GET' && r.url === '/api/admin/users')
    expect(row).toBeTruthy()
    expect(row!.guards).toEqual(['authenticate', 'read'])
  })
})

// ─── Assertion 1 + 2 ──────────────────────────────────────────────────────
// No route carrying the 'read' guard is a non-GET/HEAD method, and the
// 'read' guard is actually used somewhere (so assertion 1 can't pass emptily).

describe('admin-route-table.test.ts — the read guard is GET/HEAD-only', () => {
  it('the read guard (requireAdminViewer / requireRoleOrAdminViewer) is used at least once', () => {
    const readRoutes = ROUTE_TABLE.filter(r => r.guards.includes('read'))
    expect(readRoutes.length).toBeGreaterThan(0)
  })

  it('no route with the read guard has a non-GET/HEAD method', () => {
    const offenders = ROUTE_TABLE.filter(
      r => r.guards.includes('read') && r.method !== 'GET' && r.method !== 'HEAD'
    )
    const message = offenders.length
      ? `Found ${offenders.length} route(s) with the read-only guard on a mutating method:\n` +
        offenders.map(fmt).join('\n')
      : ''
    expect(offenders, message).toHaveLength(0)
  })
})

// ─── Assertion 3 ──────────────────────────────────────────────────────────
// Every admin route carries `authenticate` plus exactly one role guard.
//
// "Admin route" = any route whose guard list already contains 'read' or
// 'write' (self-evidently admin-gated), UNION every route mounted under
// /api/admin (that whole router is admin-only). /api/media is NOT blanket
// included: `GET /api/media/proxy-download` is deliberately `requireAuth`
// only (any authenticated user, not just admins) — see the SSRF-sink warning
// in CLAUDE.md ("Do not route the MCP principal anywhere near
// GET /api/media/proxy-download ... It is behind requireAuth, so the MCP
// principal cannot reach it today. Keep it that way."). Folding all of
// /api/media into "must have a role guard" would make this test fail against
// intended, documented behavior. Every *other* /api/media route already has
// a read/write tag and is caught by the guard-list branch on its own.

const ADMIN_ONLY_MOUNT_PREFIXES = ['/api/admin']
const KNOWN_UNGUARDED_EXCEPTIONS = new Set(['GET /api/media/proxy-download'])

function isAdminRoute(r: RouteEntry): boolean {
  if (r.guards.includes('read') || r.guards.includes('write')) return true
  return ADMIN_ONLY_MOUNT_PREFIXES.some(p => r.url === p || r.url.startsWith(p + '/'))
}

describe('admin-route-table.test.ts — every admin route is authenticate + exactly one role guard', () => {
  it('every admin route has authenticate and exactly one of read/write', () => {
    const adminRoutes = ROUTE_TABLE.filter(isAdminRoute)
    expect(adminRoutes.length).toBeGreaterThan(0) // sanity: the filter isn't vacuous

    const offenders = adminRoutes.filter(r => {
      const key = `${r.method} ${r.url}`
      if (KNOWN_UNGUARDED_EXCEPTIONS.has(key)) return false
      const hasAuth = r.guards.includes('authenticate')
      const roleGuardCount = r.guards.filter(g => g === 'read' || g === 'write').length
      return !hasAuth || roleGuardCount !== 1
    })

    const message = offenders.length
      ? `Found ${offenders.length} admin route(s) missing authenticate or a single role guard:\n` +
        offenders.map(fmt).join('\n')
      : ''
    expect(offenders, message).toHaveLength(0)
  })

  it('every route under /api/admin has a role guard (nothing ships open under that mount)', () => {
    const underAdmin = ROUTE_TABLE.filter(r => r.url === '/api/admin' || r.url.startsWith('/api/admin/'))
    expect(underAdmin.length).toBeGreaterThan(0)

    const offenders = underAdmin.filter(r => !r.guards.includes('read') && !r.guards.includes('write'))
    const message = offenders.length
      ? `Found ${offenders.length} route(s) under /api/admin with NO role guard at all — this would ship open:\n` +
        offenders.map(fmt).join('\n')
      : ''
    expect(offenders, message).toHaveLength(0)
  })
})

// ─── Assertion 4 ──────────────────────────────────────────────────────────
// Every mutating route (POST/PUT/PATCH/DELETE) whose guard list contains a
// role guard uses 'write', never 'read'. (This is the mirror image of
// assertion 1 — assertion 1 catches 'read' attached to a mutating route by
// looking for 'read' first; this one arrives at the same offenders by
// starting from "is this route mutating and role-guarded" instead, so a
// change to either filter still leaves the other as a check.)

describe('admin-route-table.test.ts — mutating + role-guarded routes always use write', () => {
  it('no mutating route with a role guard uses read instead of write', () => {
    const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
    const roleGuarded = ROUTE_TABLE.filter(
      r => MUTATING.has(r.method) && (r.guards.includes('read') || r.guards.includes('write'))
    )
    expect(roleGuarded.length).toBeGreaterThan(0) // sanity: not vacuous

    const offenders = roleGuarded.filter(r => r.guards.includes('read'))
    const message = offenders.length
      ? `Found ${offenders.length} mutating route(s) using the read-only guard:\n` +
        offenders.map(fmt).join('\n')
      : ''
    expect(offenders, message).toHaveLength(0)
  })
})
