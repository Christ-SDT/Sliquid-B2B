import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * SQLite stores timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC, with no zone
 * marker — so `new Date()` would read them as LOCAL time and shift them by the
 * viewer's offset. Normalize to a form the Date constructor treats as UTC.
 */
function parseServerDate(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z')
}

/** Date + time of day, e.g. "Aug 1, 2026, 2:00 PM". */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

function humanizeSeconds(total: number): string {
  if (total < 60) return `${total}s`
  const mins = Math.floor(total / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

/** "3h ago". Returns 'just now' under a minute. */
export function timeAgo(value?: string | null): string {
  if (!value) return '—'
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return 'just now'
  return `${humanizeSeconds(diff)} ago`
}

/**
 * "in 2h" for a FUTURE timestamp — needed for scheduled announcements.
 *
 * The existing timeAgo variants scattered across TopBar/UsersPage/
 * GDPRRequestsPage all compute `now - date` and so render "-42s ago" for
 * anything in the future.
 */
export function timeUntil(value?: string | null): string {
  if (!value) return '—'
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Math.floor((d.getTime() - Date.now()) / 1000)
  if (diff <= 0) return 'now'
  return `in ${humanizeSeconds(diff)}`
}

/** Signed relative time — dispatches to timeAgo or timeUntil. */
export function relativeTime(value?: string | null): string {
  if (!value) return '—'
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.getTime() > Date.now() ? timeUntil(value) : timeAgo(value)
}

/**
 * Value for `<input type="datetime-local">`, which expects a ZONE-LESS string
 * in the viewer's local time.
 *
 * ⚠️ `iso.slice(0, 16)` is the obvious-looking and wrong conversion: it shows a
 * UTC wall-clock time labelled as local, so the picker is off by the viewer's
 * UTC offset. Build it from local date parts instead.
 */
export function toLocalInputValue(value?: string | null): string {
  if (!value) return ''
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * Read a `datetime-local` value back as an ISO instant. `new Date(v)` correctly
 * interprets a zone-less string as local time, which is what the picker means.
 */
export function fromLocalInputValue(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}
