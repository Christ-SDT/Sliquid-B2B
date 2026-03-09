import { db } from '../../database.js'
import bcrypt from 'bcryptjs'

export { db }

export function resetDb(): void {
  db.exec(`
    DELETE FROM notifications;
    DELETE FROM quiz_results;
    DELETE FROM retailer_applications;
    DELETE FROM inventory;
    DELETE FROM woo_sync_log;
    DELETE FROM woo_settings;
    DELETE FROM creatives;
    DELETE FROM assets;
    DELETE FROM invoices;
    DELETE FROM distributors;
    DELETE FROM products;
    DELETE FROM stores;
    DELETE FROM trainings;
    DELETE FROM marketing_items;
    DELETE FROM users;
  `)
  db.exec('DELETE FROM sqlite_sequence')
}

export function seedTestUsers() {
  const h = (p: string) => bcrypt.hashSync(p, 10)
  const ins = db.prepare('INSERT INTO users (name, email, password_hash, role, company) VALUES (?, ?, ?, ?, ?)')
  const admin = ins.run('Test Admin', 'admin@test.com', h('Admin1234!'), 'tier5', 'Sliquid')
  const t1 = ins.run('Tier1 User', 'tier1@test.com', h('Tier1234!'), 'tier1', 'Demo Store')
  const t2 = ins.run('Tier2 User', 'tier2@test.com', h('Tier2234!'), 'tier2', 'Demo Store')
  const t4 = ins.run('Prospect', 'tier4@test.com', h('Tier4234!'), 'tier4', 'Prospect Co')
  return {
    adminId: admin.lastInsertRowid as number,
    tier1Id: t1.lastInsertRowid as number,
    tier2Id: t2.lastInsertRowid as number,
    tier4Id: t4.lastInsertRowid as number,
  }
}

export function seedInventoryItem(overrides: Partial<{
  product_name: string; sku: string; brand: string; quantity: number; reorder_level: number; status: string
}> = {}) {
  const row = {
    product_name: 'Test Product',
    sku: 'TST001',
    brand: 'Sliquid',
    quantity: 10,
    reorder_level: 5,
    status: 'in_stock',
    ...overrides,
  }
  const result = db.prepare(
    'INSERT INTO inventory (product_name, sku, brand, quantity, reorder_level, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.product_name, row.sku, row.brand, row.quantity, row.reorder_level, row.status)
  return result.lastInsertRowid as number
}
