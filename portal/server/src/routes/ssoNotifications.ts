import { Router } from 'express'
import { requireAuth, requireRole, requireAdminViewer } from '../middleware/auth.js'
import { ADMIN_ROLES } from '../roles.js'
import {
  drainNotificationOutbox,
  getSsoNotifySettings,
  retryOutboxRow,
  sendTestEvent,
  setSsoNotifySettings,
  SsoSettingsError,
} from '../ssoNotify.js'

/**
 * /api/admin/sso-notifications — settings + outbox for the SSO notification
 * relay. Every route: requireAuth plus EXACTLY ONE role guard. The read guard
 * (Legal may view) is on the single GET only; every write is admin-only.
 */
const router = Router()
const requireAdmin = requireRole(...ADMIN_ROLES)

router.get('/', requireAuth, requireAdminViewer, (_req, res) => {
  res.json(getSsoNotifySettings())
})

router.put('/settings', requireAuth, requireAdmin, (req, res) => {
  const body = (req.body ?? {}) as { enabled?: unknown; routing?: unknown }
  try {
    setSsoNotifySettings({ enabled: body.enabled, routing: body.routing })
  } catch (err) {
    if (err instanceof SsoSettingsError) {
      res.status(400).json({ message: err.message })
      return
    }
    throw err
  }
  res.json(getSsoNotifySettings())
})

router.post('/test', requireAuth, requireAdmin, async (_req, res) => {
  res.json(await sendTestEvent())
})

router.post('/retry/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0 || !retryOutboxRow(id)) {
    res.status(404).json({ message: 'No undelivered notification with that id' })
    return
  }
  await drainNotificationOutbox()
  res.json(getSsoNotifySettings())
})

router.post('/drain', requireAuth, requireAdmin, async (_req, res) => {
  res.json({ delivered: await drainNotificationOutbox() })
})

export default router
