import { Router } from 'express'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.get('/overview', requireAuth, (req, res) => {
  const totalProducts = (db.prepare('SELECT COUNT(*) as c FROM products').get() as any).c
  const totalAssets = (db.prepare('SELECT COUNT(*) as c FROM assets').get() as any).c
  const pendingInvoices = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status = 'pending'").get() as any).c
  const overdueInvoices = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE status = 'overdue'").get() as any).c
  const lowStock = (db.prepare("SELECT COUNT(*) as c FROM inventory WHERE status = 'low_stock'").get() as any).c
  const outOfStock = (db.prepare("SELECT COUNT(*) as c FROM inventory WHERE status = 'out_of_stock'").get() as any).c
  const totalRevenue = (db.prepare("SELECT SUM(amount) as s FROM invoices WHERE status = 'paid'").get() as any).s ?? 0
  const userRows = db.prepare(
    "SELECT role, COUNT(*) as count FROM users WHERE status != 'declined' GROUP BY role"
  ).all() as { role: string; count: number }[]
  const usersByRole: Record<string, number> = {}
  for (const row of userRows) usersByRole[row.role] = row.count

  res.json({
    totalProducts,
    totalAssets,
    pendingInvoices,
    overdueInvoices,
    lowStock,
    outOfStock,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    distributors: 15,
    usersByRole,
  })
})

router.get('/orders', requireAuth, (req, res) => {
  // Mock monthly order data for charts
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const data = months.map((month, i) => ({
    month,
    orders: Math.floor(40 + Math.sin(i * 0.5) * 20 + Math.random() * 15),
    revenue: Math.floor(4000 + Math.sin(i * 0.5) * 1500 + Math.random() * 800),
  }))
  res.json(data)
})

router.get('/revenue', requireAuth, (req, res) => {
  const byBrand = [
    { brand: 'Sliquid', revenue: 48200, units: 3840 },
    { brand: 'RIDE', revenue: 22600, units: 1820 },
    { brand: 'Ride Rocco', revenue: 14800, units: 1240 },
  ]
  const byCategory = [
    { category: 'Water-Based', value: 38 },
    { category: 'Silicone-Based', value: 22 },
    { category: 'Organic', value: 18 },
    { category: 'Hybrid', value: 12 },
    { category: 'Flavored', value: 10 },
  ]
  res.json({ byBrand, byCategory })
})

export default router
