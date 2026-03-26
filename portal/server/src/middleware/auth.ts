import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { db } from '../database.js'

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

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) { res.status(401).json({ message: 'Unauthorized' }); return }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: 'Forbidden' })
      return
    }
    next()
  }
}
