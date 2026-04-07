import { Router, Request, Response, NextFunction } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { getRecentLogs, addSubscriber, removeSubscriber } from '../logger.js'

const router = Router()

// Middleware that accepts token from Authorization header OR ?token= query param.
// EventSource (SSE) cannot send custom headers, so we fall back to the query param.
function requireAuthOrToken(req: Request, res: Response, next: NextFunction) {
  const queryToken = req.query.token as string | undefined
  if (queryToken && !req.headers.authorization) {
    req.headers.authorization = `Bearer ${queryToken}`
  }
  requireAuth(req, res, next)
}

// GET /api/logs — last N entries (default 200)
router.get('/', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? '200', 10), 500)
  res.json({ logs: getRecentLogs(limit) })
})

// GET /api/logs/stream — SSE live stream
router.get('/stream', requireAuthOrToken, requireRole('tier5', 'admin'), (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable nginx buffering on Railway
  res.flushHeaders()

  // Send a heartbeat comment every 20s to keep the connection alive through proxies
  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n') } catch { /* connection closed */ }
  }, 20_000)

  addSubscriber(res)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeSubscriber(res)
  })
})

export default router
