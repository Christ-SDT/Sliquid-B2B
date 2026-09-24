import { db } from './database.js'

/**
 * Lets the client show a notification in the viewer's language: `key` names an
 * entry under the portal's `notifications` namespace (title + message), and
 * `params` fills its placeholders. The English title/message are still stored
 * and remain the fallback. Omit for admin-only notifications (English UI).
 */
export interface NotificationI18n {
  key: string
  params?: Record<string, string | number>
}

function insertForUsers(userIds: number[], type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  if (userIds.length === 0) return
  const stmt = db.prepare(
    'INSERT INTO notifications (user_id, type, title, message, link, i18n_key, i18n_params) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const key = i18n?.key ?? null
  const params = i18n?.params ? JSON.stringify(i18n.params) : null
  for (const id of userIds) {
    stmt.run(id, type, title, message, link ?? null, key, params)
  }
}

/** Notify all tier5 / admin users (e.g. stock alerts). */
export function notifyAdmins(type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  const rows = db.prepare(
    "SELECT id FROM users WHERE role IN ('tier5', 'admin')"
  ).all() as { id: number }[]
  insertForUsers(rows.map(r => r.id), type, title, message, link, i18n)
}

/** Notify all non-admin users (tier1–tier4) — e.g. new product library items. */
export function notifyUsers(type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  const rows = db.prepare(
    "SELECT id FROM users WHERE role NOT IN ('tier5', 'admin')"
  ).all() as { id: number }[]
  insertForUsers(rows.map(r => r.id), type, title, message, link, i18n)
}

/** Notify every user regardless of tier — e.g. a company-wide announcement. */
export function notifyEveryone(type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  const rows = db.prepare('SELECT id FROM users').all() as { id: number }[]
  insertForUsers(rows.map(r => r.id), type, title, message, link, i18n)
}

/**
 * Notify an explicit set of user ids — for audiences the helpers above don't
 * express, e.g. "everyone except users still awaiting approval".
 */
export function notifyUserIds(userIds: number[], type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  insertForUsers(userIds, type, title, message, link, i18n)
}

/** Notify a single specific user by ID — e.g. account approval/decline. */
export function notifyUser(userId: number, type: string, title: string, message: string, link?: string, i18n?: NotificationI18n) {
  insertForUsers([userId], type, title, message, link, i18n)
}
