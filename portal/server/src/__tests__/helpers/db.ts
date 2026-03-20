import { db } from '../../database.js'
import bcrypt from 'bcryptjs'

export { db }

export function resetDb(): void {
  db.exec(`
    DELETE FROM cert_rewards;
    DELETE FROM certificates;
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

export function seedTraining(quizId: string, overrides: Partial<{
  title: string; passing_score: number; sort_order: number
}> = {}) {
  const row = { title: `Training: ${quizId}`, passing_score: 70, sort_order: 0, ...overrides }
  const result = db.prepare(
    'INSERT INTO trainings (quiz_id, title, passing_score, estimated_minutes, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).run(quizId, row.title, row.passing_score, 15, row.sort_order)
  return result.lastInsertRowid as number
}

export function seedQuizResult(userId: number, quizId: string, passed: boolean, score = 85) {
  const result = db.prepare(
    'INSERT INTO quiz_results (user_id, quiz_id, score, passed) VALUES (?, ?, ?, ?)'
  ).run(userId, quizId, score, passed ? 1 : 0)
  return result.lastInsertRowid as number
}

export function seedCertReward(userId: number, overrides: Partial<{
  product: string; shirtSize: string; address1: string; city: string; state: string; zip: string
}> = {}) {
  const row = {
    product: 'Sliquid H2O',
    shirtSize: 'M',
    address1: '123 Main St',
    address2: null,
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    ...overrides,
  }
  const user = db.prepare('SELECT name FROM users WHERE id = ?').get(userId) as { name: string }
  const result = db.prepare(
    'INSERT INTO cert_rewards (user_id, full_name, product, shirt_size, address1, address2, city, state, zip) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(userId, user.name, row.product, row.shirtSize, row.address1, row.address2, row.city, row.state, row.zip)
  return result.lastInsertRowid as number
}

export function seedCertificate(userId: number, userName: string, certNumber?: string) {
  const cn = certNumber ?? `SLQ-2025-TEST${userId}`
  const result = db.prepare(
    'INSERT INTO certificates (certificate_number, user_id, issued_to) VALUES (?, ?, ?)'
  ).run(cn, userId, userName)
  return { id: result.lastInsertRowid as number, certNumber: cn }
}

export function seedUser(overrides: {
  name?: string; email?: string; password?: string
  role?: string; company?: string; status?: string
} = {}) {
  const h = (p: string) => bcrypt.hashSync(p, 10)
  const row = {
    name: 'Test User',
    email: `user_${Date.now()}@test.com`,
    password: 'Pass1234!',
    role: 'tier1',
    company: 'Test Co',
    status: 'active',
    ...overrides,
  }
  const result = db.prepare(
    'INSERT INTO users (name, email, password_hash, role, company, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(row.name, row.email, h(row.password), row.role, row.company, row.status)
  return { id: result.lastInsertRowid as number, ...row }
}

export function seedTestUsers() {
  const h = (p: string) => bcrypt.hashSync(p, 10)
  const ins = db.prepare('INSERT INTO users (name, email, password_hash, role, company, status) VALUES (?, ?, ?, ?, ?, ?)')
  const admin = ins.run('Test Admin', 'admin@test.com', h('Admin1234!'), 'tier5', 'Sliquid', 'active')
  const t1 = ins.run('Tier1 User', 'tier1@test.com', h('Tier1234!'), 'tier1', 'Demo Store', 'active')
  const t2 = ins.run('Tier2 User', 'tier2@test.com', h('Tier2234!'), 'tier2', 'Demo Store', 'active')
  const t4 = ins.run('Prospect', 'tier4@test.com', h('Tier4234!'), 'tier4', 'Prospect Co', 'active')
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
