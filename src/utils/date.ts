import i18n from '@/i18n'

/**
 * Date formatting for API-supplied timestamps.
 *
 * The API returns SQLite timestamps as 'YYYY-MM-DD HH:MM:SS' in UTC with no
 * zone marker, so `new Date()` would read them as LOCAL time and shift them by
 * the viewer's offset. Normalize before parsing.
 */
function parseServerDate(value: string): Date {
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)
  return new Date(hasZone ? value : value.replace(' ', 'T') + 'Z')
}

// Intl locale per UI language. English stays en-US so existing output is unchanged;
// French uses Canadian conventions to match our French audience.
const INTL_LOCALE: Record<string, string> = { en: 'en-US', es: 'es', fr: 'fr-CA' }

/**
 * "June 30, 2026" / "30 de junio de 2026" / "30 juin 2026". Defaults to the
 * current UI language; callers should be inside a component that uses
 * useTranslation so the date re-renders on a language switch.
 */
export function formatDate(value?: string | null, locale?: string): string {
  if (!value) return ''
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return ''
  const lng = locale ?? i18n.resolvedLanguage ?? 'en'
  return d.toLocaleDateString(INTL_LOCALE[lng] ?? lng, { year: 'numeric', month: 'long', day: 'numeric' })
}

/** ISO date for a `<time dateTime>` attribute. */
export function isoDate(value?: string | null): string | undefined {
  if (!value) return undefined
  const d = parseServerDate(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
