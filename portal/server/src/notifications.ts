import { db } from './database.js'

function insertForUsers(userIds: number[], type: string, title: string, message: string, link?: string) {
  if (userIds.length === 0) return
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?, ?, ?, ?, ?)'
  )
  for (const id of userIds) {
    stmt.run(id, type, title, message, link ?? null)
  }
}

/** Notify all tier5 / admin users (e.g. stock alerts). */
export function notifyAdmins(type: string, title: string, message: string, link?: string) {
  const rows = db.prepare(
    "SELECT id FROM users WHERE role IN ('tier5', 'admin')"
  ).all() as { id: number }[]
  insertForUsers(rows.map(r => r.id), type, title, message, link)
}

/** Notify all non-admin users (tier1–tier4) — e.g. new product library items. */
export function notifyUsers(type: string, title: string, message: string, link?: string) {
  const rows = db.prepare(
    "SELECT id FROM users WHERE role NOT IN ('tier5', 'admin')"
  ).all() as { id: number }[]
  insertForUsers(rows.map(r => r.id), type, title, message, link)
}

/** Notify a single specific user by ID — e.g. account approval/decline. */
export function notifyUser(userId: number, type: string, title: string, message: string, link?: string) {
  insertForUsers([userId], type, title, message, link)
}
