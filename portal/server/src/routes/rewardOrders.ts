import { Router, type Request, type Response } from 'express'
import { requireAuth, requireRole, requireAdminViewer } from '../middleware/auth.js'
import { woo } from '../woocommerce.js'
import {
  RewardOrderError, sanitizeError, getDetail, buildDraft, updateDraft, push, setStatus,
  refresh, remove, emailPartner, summary,
} from '../rewardOrders.js'

/**
 * /api/reward-orders — a certification reward claim → a free WooCommerce order.
 *
 * Every route: requireAuth plus exactly one guard, attached per route —
 * requireAdminViewer on GETs (Legal reads), requireRole('tier5','admin') on
 * every write (admin-route-table.test.ts enforces this). Every write answers
 * with the fresh RewardOrderDetail so the client never has to guess.
 *
 * /meta/* is registered BEFORE /:rewardId so 'meta' is never read as an id.
 */
const router = Router()
const adminWrite = requireRole('tier5', 'admin')
const adminRead = requireAdminViewer

function rewardIdOf(req: Request, res: Response): number | null {
  const id = Number(req.params.rewardId)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ message: 'Invalid reward id' })
    return null
  }
  return id
}

function fail(res: Response, e: unknown): void {
  if (e instanceof RewardOrderError) {
    res.status(e.status).json({ message: e.message, ...(e.issues ? { issues: e.issues } : {}) })
    return
  }
  const message = sanitizeError((e as Error)?.message)
  console.error('[reward-orders]', message)
  res.status(500).json({ message })
}

/** Wraps a handler that resolves to the response body. */
function handle(fn: (req: Request, res: Response) => Promise<unknown> | unknown) {
  return async (req: Request, res: Response) => {
    try {
      const body = await fn(req, res)
      if (!res.headersSent) res.json(body)
    } catch (e) {
      fail(res, e)
    }
  }
}

// ─── Meta (reads) ─────────────────────────────────────────────────────────────

router.get('/meta/statuses', requireAuth, adminRead, handle(() => woo.getOrderStatuses()))

router.get('/meta/summary', requireAuth, adminRead, handle(() => summary()))

router.get('/meta/products', requireAuth, adminRead, handle(async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
  if (q.length < 2) { res.status(400).json({ message: 'Type at least 2 characters to search' }); return }
  if (!woo.isConfigured()) { res.status(503).json({ message: 'WooCommerce is not configured' }); return }
  try {
    return await woo.searchProducts(q.slice(0, 100))
  } catch (e) {
    res.status(502).json({ message: sanitizeError((e as Error)?.message) })
  }
}))

router.get('/meta/products/:id/variations', requireAuth, adminRead, handle(async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) { res.status(400).json({ message: 'Invalid product id' }); return }
  if (!woo.isConfigured()) { res.status(503).json({ message: 'WooCommerce is not configured' }); return }
  try {
    return await woo.getVariations(id)
  } catch (e) {
    res.status(502).json({ message: sanitizeError((e as Error)?.message) })
  }
}))

// ─── One claim's order ────────────────────────────────────────────────────────

router.get('/:rewardId', requireAuth, adminRead, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return getDetail(id)
}))

router.post('/:rewardId/draft', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return buildDraft(id, req.user!.id)
}))

router.put('/:rewardId', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return updateDraft(id, req.body, req.user!.id)
}))

// Always answers JSON — api.delete parses the body unconditionally.
router.delete('/:rewardId', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return remove(id, req.user!.id)
}))

// A Woo-side failure is not an HTTP error here: the order is stored as
// state 'failed' with last_error, and the detail comes back with 200.
router.post('/:rewardId/push', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return push(id, req.user!.id)
}))

router.put('/:rewardId/status', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return setStatus(id, (req.body as { status?: unknown } | undefined)?.status, req.user!.id)
}))

router.post('/:rewardId/refresh', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return refresh(id, req.user!.id)
}))

router.post('/:rewardId/email', requireAuth, adminWrite, handle(async (req, res) => {
  const id = rewardIdOf(req, res)
  if (id === null) return
  return emailPartner(id, (req.body as { message?: unknown } | undefined)?.message, req.user!.id)
}))

export default router
