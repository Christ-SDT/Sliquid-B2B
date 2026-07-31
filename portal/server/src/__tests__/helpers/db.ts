import { db } from '../../database.js'
import bcrypt from 'bcryptjs'

export { db }

export function resetDb(): void {
  db.exec(`
    DELETE FROM announcement_sync_log;
    DELETE FROM announcements;
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
    DELETE FROM ai_images;
    DELETE FROM media;
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

/**
 * A registration awaiting admin approval.
 *
 * Deliberately NOT part of seedTestUsers() — several existing tests assert exact
 * counts of active/pending users, so adding one to that shared fixture breaks
 * them. Call this only from tests that need a pending account.
 */
export function seedPendingUser(overrides: Partial<{
  name: string; email: string; role: string; company: string
}> = {}) {
  const row = {
    name: 'Pending User',
    email: 'pending@test.com',
    role: 'tier1',
    company: 'New Store',
    ...overrides,
  }
  const result = db.prepare(
    "INSERT INTO users (name, email, password_hash, role, company, status) VALUES (?, ?, ?, ?, ?, 'pending')"
  ).run(row.name, row.email, bcrypt.hashSync('Pend1234!', 10), row.role, row.company)
  return result.lastInsertRowid as number
}

export function seedMediaItem(overrides: Partial<{
  label: string; brand: string; mime_type: string; file_size: string; uploaded_by: string
}> = {}) {
  const row = {
    filename: 'test-image.png',
    label: 'Test Image',
    brand: 'Sliquid',
    s3_key: `portal-assets/media/test-${Date.now()}.png`,
    file_url: 'https://test-bucket.s3.us-east-1.amazonaws.com/portal-assets/media/test.png',
    file_size: '120 KB',
    mime_type: 'image/png',
    uploaded_by: 'Test Admin',
    ...overrides,
  }
  const result = db.prepare(
    'INSERT INTO media (filename, label, brand, s3_key, file_url, file_size, mime_type, uploaded_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(row.filename, row.label, row.brand, row.s3_key, row.file_url, row.file_size, row.mime_type, row.uploaded_by)
  return result.lastInsertRowid as number
}

/**
 * Seed an announcement. Defaults to a WordPress-sourced row in the state a
 * fresh sync leaves it in: hidden, invisible on both surfaces.
 *
 * Pass `publish_at` / `expires_at` as literal 'YYYY-MM-DD HH:MM:SS' strings
 * (e.g. '2020-01-01 00:00:00' for the past, '2099-01-01 00:00:00' for the
 * future). Do NOT use vi.useFakeTimers() for schedule assertions — it does not
 * move SQLite's datetime('now').
 */
export function seedAnnouncement(overrides: Partial<{
  source: string; wp_id: number | null; wp_slug: string; wp_link: string
  wp_date_gmt: string; wp_modified: string; wp_title: string; wp_excerpt_html: string
  wp_content_html: string; wp_featured_image_url: string; content_shape: string
  slug: string; title_override: string | null; excerpt_override: string | null
  body_html_override: string | null; status: string
  publish_at: string | null; expires_at: string | null
  show_in_portal: number; show_on_public: number; pinned: number; sort_order: number
  notified_at: string | null
}> = {}) {
  const n = (db.prepare('SELECT COUNT(*) AS c FROM announcements').get() as { c: number }).c + 1
  const row = {
    source: 'wordpress',
    wp_id: 1000 + n,
    wp_slug: `test-post-${n}`,
    wp_link: `https://sliquid.com/test-post-${n}/`,
    wp_date_gmt: '2026-01-01 00:00:00',
    wp_modified: '2026-01-01 00:00:00',
    wp_title: `Test Announcement ${n}`,
    wp_excerpt_html: '<p>Test excerpt</p>',
    wp_content_html: '<p>Test body</p>',
    wp_featured_image_url: null as string | null,
    content_shape: 'rich',
    slug: `test-post-${n}`,
    title_override: null,
    excerpt_override: null,
    body_html_override: null,
    status: 'hidden',
    publish_at: null,
    expires_at: null,
    show_in_portal: 0,
    show_on_public: 0,
    pinned: 0,
    sort_order: 0,
    notified_at: null,
    ...overrides,
  }
  const result = db.prepare(`
    INSERT INTO announcements (
      source, wp_id, wp_slug, wp_link, wp_date_gmt, wp_modified, wp_title,
      wp_excerpt_html, wp_content_html, wp_featured_image_url, content_shape,
      slug, title_override, excerpt_override, body_html_override, status,
      publish_at, expires_at, show_in_portal, show_on_public, pinned,
      sort_order, notified_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.source, row.wp_id, row.wp_slug, row.wp_link, row.wp_date_gmt, row.wp_modified,
    row.wp_title, row.wp_excerpt_html, row.wp_content_html, row.wp_featured_image_url,
    row.content_shape, row.slug, row.title_override, row.excerpt_override,
    row.body_html_override, row.status, row.publish_at, row.expires_at,
    row.show_in_portal, row.show_on_public, row.pinned, row.sort_order, row.notified_at,
  )
  return result.lastInsertRowid as number
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
