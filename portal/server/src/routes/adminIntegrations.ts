import { Router } from 'express'
import { requireAuth, requireAdminViewer, requireRole } from '../middleware/auth.js'
import { collectIntegrations, isIntegrationId, testIntegration, scrubSecrets } from '../integrations.js'
import { getRewardItemSettings, setRewardItemSettings } from '../rewardItemSettings.js'
import type { RewardItemSettings } from '../contracts.js'

// Mounted at /api/admin/integrations. Every route carries requireAuth plus
// exactly ONE guard: requireAdminViewer on GETs (Legal may read), and
// requireRole('tier5', 'admin') on every write — admin-route-table.test.ts
// enforces this. Nothing returned here may carry a secret (see integrations.ts).
const router = Router()

// GET /api/admin/integrations — one status card per external connection.
router.get('/', requireAuth, requireAdminViewer, (_req, res) => {
  res.json(collectIntegrations())
})

// GET /api/admin/integrations/reward-items — shirt + pin → Woo mapping.
router.get('/reward-items', requireAuth, requireAdminViewer, (_req, res) => {
  res.json(getRewardItemSettings())
})

// PUT /api/admin/integrations/reward-items — partial update.
router.put('/reward-items', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const body = req.body
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    res.status(400).json({ message: 'Body must be an object' }); return
  }
  try {
    res.json(setRewardItemSettings(body as Partial<RewardItemSettings>))
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? 'Invalid reward item settings' })
  }
})

// POST /api/admin/integrations/:id/test — live check where one exists.
// Live tests can reach an external system, so this is a write-guarded action.
router.post('/:id/test', requireAuth, requireRole('tier5', 'admin'), async (req, res) => {
  const { id } = req.params
  if (!isIntegrationId(id)) {
    res.status(404).json({ message: 'Unknown integration' }); return
  }
  try {
    res.json(await testIntegration(id))
  } catch (err: any) {
    // testIntegration never throws; this is belt and braces.
    res.status(500).json({ ok: false, message: scrubSecrets(err?.message ?? 'Test failed') })
  }
})

export default router
