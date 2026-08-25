/**
 * Canonical role classification for the portal server.
 *
 * Every place that needs to know "is this an admin?" or "can this role see the
 * admin surfaces?" must import from here rather than hand-rolling its own
 * `role === 'tier5' || role === 'admin'` check. A second copy of that logic is
 * how the Legal (tier8) read-only role would quietly turn into a write role, or
 * vice versa.
 *
 * ── Invariant 1 ──────────────────────────────────────────────────────────────
 * `ADMIN_VIEWER_ROLES` is deliberately NOT a member of `ADMIN_ROLES`. Every
 * existing write guard in the codebase is `requireRole('tier5', 'admin')` (or
 * checks `role === 'tier5' || role === 'admin'` directly) — none of those were
 * written with tier8 in mind, and none needed to be: because tier8 is absent
 * from `ADMIN_ROLES`, every write guard rejects a tier8 caller exactly as it
 * always has, with zero changes to the write path. `canViewAdmin()` widens
 * *read* access only, via a dedicated guard (`requireAdminViewer` /
 * `requireRoleOrAdminViewer` in `middleware/auth.ts`) that call sites opt into
 * explicitly on GET/HEAD routes.
 */

/** Write-capable admin roles. 'admin' is the legacy DB value — never remove it. */
export const ADMIN_ROLES: ReadonlySet<string> = new Set(['tier5', 'admin'])

/** Read-only oversight roles. Deliberately NOT a member of ADMIN_ROLES. */
export const ADMIN_VIEWER_ROLES: ReadonlySet<string> = new Set(['tier8'])

/** True for a role that can write through admin-only endpoints. */
export function isAdminRole(role?: string | null): boolean {
  return !!role && ADMIN_ROLES.has(role)
}

/**
 * True for any role allowed to READ admin surfaces — full admins plus the
 * read-only viewer roles. Always derived from the two sets above (never a
 * hand-copied list), so `canViewAdmin` is guaranteed to be a strict superset
 * of `isAdminRole`.
 */
export function canViewAdmin(role?: string | null): boolean {
  return isAdminRole(role) || (!!role && ADMIN_VIEWER_ROLES.has(role))
}

/** True only for a role that can view admin surfaces but cannot write to them. */
export function isReadOnlyAdminRole(role?: string | null): boolean {
  return !isAdminRole(role) && !!role && ADMIN_VIEWER_ROLES.has(role)
}
