import { readFileSync, statSync } from 'fs'
import { fileURLToPath } from 'url'

/**
 * Admin-editable spam blocklist for the public forms.
 *
 * Lives in `src/assets/blocklist.json`, which the Dockerfile already copies to
 * `dist/assets/`, so `./assets/blocklist.json` resolves in both the source tree
 * and the container. `BLOCKLIST_PATH` overrides it if you ever want to point at
 * a mounted volume instead.
 *
 * Reloaded whenever the file's mtime changes, so an edit takes effect without a
 * restart. On Railway the file ships inside the image, so in practice an edit
 * still means a redeploy — the mtime check is what makes local editing painless
 * and costs one stat() per submission.
 */

export type BlockMode = 'reject' | 'silent'
export type RepeatScope = 'form' | 'all'
export type RepeatMatch = 'email-or-name' | 'email'

export interface RepeatLimit {
  maxSubmissions: number
  windowDays: number
  scope: RepeatScope
  /**
   * 'email-or-name' also counts a sender who keeps their name and rotates the
   * address — but it conflates two different people who share a common name,
   * so a second "John Smith" can be refused because of the first. 'email'
   * removes that false positive at the cost of being trivial to evade.
   */
  matchOn: RepeatMatch
}

export interface Blocklist {
  mode: BlockMode
  repeatLimit: RepeatLimit
  emails: string[]
  domains: string[]
  names: string[]
  messageContains: string[]
}

/**
 * Used when the file is missing or malformed. Deliberately permissive: a typo
 * in the blocklist must never take down every public form. The repeat limit is
 * kept, because it is the part that protects us when the file is unreadable.
 */
const FALLBACK: Blocklist = {
  mode: 'reject',
  repeatLimit: { maxSubmissions: 2, windowDays: 30, scope: 'form', matchOn: 'email-or-name' },
  emails: [], domains: [], names: [], messageContains: [],
}

const DEFAULT_PATH = fileURLToPath(new URL('./assets/blocklist.json', import.meta.url))

let cached: Blocklist = FALLBACK
let cachedMtime = -1
let cachedPath = ''

function norm(v: unknown): string {
  return typeof v === 'string' ? v.trim().toLowerCase() : ''
}

function normList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(norm).filter(Boolean) : []
}

function parse(raw: string): Blocklist {
  const j = JSON.parse(raw) as Partial<Blocklist>
  const rl = (j.repeatLimit ?? {}) as Partial<RepeatLimit>
  return {
    mode: j.mode === 'silent' ? 'silent' : 'reject',
    repeatLimit: {
      // A non-positive limit would block the very first submission and take
      // every form offline, so clamp it to at least 1.
      maxSubmissions: Number.isFinite(rl.maxSubmissions) ? Math.max(1, Number(rl.maxSubmissions)) : FALLBACK.repeatLimit.maxSubmissions,
      windowDays: Number.isFinite(rl.windowDays) ? Math.max(0, Number(rl.windowDays)) : FALLBACK.repeatLimit.windowDays,
      scope: rl.scope === 'all' ? 'all' : 'form',
      matchOn: rl.matchOn === 'email' ? 'email' : 'email-or-name',
    },
    emails: normList(j.emails),
    domains: normList(j.domains).map(d => d.replace(/^@/, '')),
    names: normList(j.names),
    messageContains: normList(j.messageContains),
  }
}

export function loadBlocklist(): Blocklist {
  const path = process.env.BLOCKLIST_PATH ?? DEFAULT_PATH
  try {
    const mtime = statSync(path).mtimeMs
    if (path === cachedPath && mtime === cachedMtime) return cached
    cached = parse(readFileSync(path, 'utf8'))
    cachedMtime = mtime
    cachedPath = path
    console.log(`[blocklist] loaded ${path} — ${cached.emails.length} emails, ${cached.domains.length} domains, ${cached.names.length} names, limit ${cached.repeatLimit.maxSubmissions}/${cached.repeatLimit.windowDays}d (${cached.repeatLimit.scope})`)
    return cached
  } catch (err) {
    // Loud, because silently reverting to "block nothing" after a typo is the
    // kind of thing nobody notices until the spam comes back.
    console.error(`[blocklist] could not read ${path} — using fallback (nothing listed):`, err instanceof Error ? err.message : err)
    cached = FALLBACK
    cachedMtime = -1
    cachedPath = ''
    return cached
  }
}

/** Test seam — forces the next loadBlocklist() to re-read from disk. */
export function resetBlocklistCache(): void {
  cachedMtime = -1
  cachedPath = ''
}

export interface Identity {
  email?: string
  name?: string
  message?: string
}

/** Which rule matched, for the server log. Never shown to the sender — telling
 *  a spammer *why* they were stopped just tells them what to change. */
export function matchBlocklist(id: Identity, list = loadBlocklist()): string | null {
  const email = norm(id.email)
  const name = norm(id.name)
  const message = norm(id.message)

  if (email && list.emails.includes(email)) return `email:${email}`

  const domain = email.split('@')[1]
  if (domain && list.domains.includes(domain)) return `domain:${domain}`

  if (name && list.names.includes(name)) return `name:${name}`

  const phrase = list.messageContains.find(p => message.includes(p))
  if (phrase) return `phrase:${phrase}`

  return null
}
