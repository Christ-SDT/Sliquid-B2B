import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import i18n, { intlLocale } from '@/i18n'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// All formatters below follow the UI language via intlLocale() (en-US / es /
// fr-CA). Call them during render inside a component that uses
// useTranslation, so output re-renders when the language changes.

/** Prices are always USD; only the number formatting follows the language. */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(intlLocale(), { style: 'currency', currency: 'USD' }).format(amount)
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(intlLocale(), { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * SQLite stores timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC, with no zone
 * marker — so `new Date()` would read them as LOCAL time and shift them by the
 * viewer's offset. Normalize to a form the Date constructor treats as UTC.
 */
export function parseServerDate(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z')
}

/** Date + time of day, e.g. "Aug 1, 2026, 2:00 PM". */
export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(intlLocale(), {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

/**
 * "3h ago" / "hace 3 h" / "il y a 3 h" from a signed number of seconds
 * (negative = past). English uses the narrow style, which reproduces the
 * portal's original "3h ago" / "in 2d" exactly; es/fr use short, because
 * French narrow renders a bare "-3 h".
 */
function relativeFromSeconds(seconds: number): string {
  const locale = intlLocale()
  const rtf = new Intl.RelativeTimeFormat(locale, { style: locale === 'en-US' ? 'narrow' : 'short', numeric: 'always' })
  const abs = Math.abs(seconds)
  const sign = Math.sign(seconds) || 1
  if (abs < 60) return rtf.format(sign * abs, 'second')
  const mins = Math.floor(abs / 60)
  if (mins < 60) return rtf.format(sign * mins, 'minute')
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return rtf.format(sign * hrs, 'hour')
  return rtf.format(sign * Math.floor(hrs / 24), 'day')
}

/** "3h ago" for a past timestamp; "just now" under a minute. Any date string or Date. */
export function timeAgo(value?: string | Date | null): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : parseServerDate(value)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Math.floor((Date.now() - d.getTime()) / 1000)
  if (diff < 60) return i18n.t('common:time.justNow')
  return relativeFromSeconds(-diff)
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
  if (diff <= 0) return new Intl.RelativeTimeFormat(intlLocale(), { numeric: 'auto' }).format(0, 'second')
  return relativeFromSeconds(diff)
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
