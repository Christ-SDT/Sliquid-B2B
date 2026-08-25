import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../database.js'
import { canViewAdmin } from '../roles.js'

const secret = process.env.JWT_SECRET
if (!secret) throw new Error('JWT_SECRET environment variable is not set')
export const JWT_SECRET = secret

// Tokens issued before this server started are rejected — all sessions reset on every deploy
export const SERVER_BOOT_TIME = Math.floor(Date.now() / 1000)

export interface JwtPayload {
  userId: number
  role: string
  iat?: number
}

declare global {
  namespace Express {
    interface Request {
      user?: { id: number; role: string; email: string; name: string; company?: string; status?: string }
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload
    // Reject tokens issued before this server boot — forces re-login after every deploy
    if ((payload.iat ?? 0) < SERVER_BOOT_TIME) {
      res.status(401).json({ message: 'Session expired after server update — please log in again' })
      return
    }
    const user = db.prepare('SELECT id, name, email, role, company, status FROM users WHERE id = ?').get(payload.userId) as any
    if (!user) { res.status(401).json({ message: 'User not found' }); return }
    req.user = user
    next()
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' })
  }
}
// Tag so a route-table test can classify this middleware as the authentication step
// (as opposed to a role/authorization guard).
;(requireAuth as any).__roleGuard = 'authenticate'

export function requireRole(...roles: string[]) {
  const handler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    next()
  }
  // Tags read by a route-table test to classify every guard in the route tables.
  ;(handler as any).__roleGuard = 'write'
  ;(handler as any).__roles = roles
  return handler
}

/**
 * ⚠️ GET/HEAD ONLY. Nothing in the type system enforces this — attaching
 * `requireAdminViewer` to a POST/PUT/PATCH/DELETE route silently hands the
 * read-only Legal (tier8) role a write, and it will return 200. This guard
 * exists to let `ADMIN_VIEWER_ROLES` (see `roles.ts`) see every admin surface
 * without ever being able to change one — that boundary lives entirely in
 * "which route this middleware is attached to," so attach it with care.
 */
export function requireAdminViewer(req: Request, res: Response, next: NextFunction) {
  if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
  if (!canViewAdmin(req.user.role)) {
    res.status(403).json({ message: 'Forbidden' })
    return
  }
  next()
}
;(requireAdminViewer as any).__roleGuard = 'read'

/**
 * Like `requireRole`, but also admits any `canViewAdmin` role (full admins plus
 * the read-only viewer roles). For GET routes that are shared between a specific
 * write-capable tier (e.g. tier6 on the medical-marketing catalog) and the
 * read-only admin viewer — so both keep their access without a second guard
 * chained on the route.
 *
 * ⚠️ GET/HEAD ONLY — same caveat as `requireAdminViewer` above.
 */
export function requireRoleOrAdminViewer(...roles: string[]) {
  const handler = (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
    if (!roles.includes(req.user.role) && !canViewAdmin(req.user.role)) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    next()
  }
  ;(handler as any).__roleGuard = 'read'
  ;(handler as any).__roles = roles
  return handler
}
