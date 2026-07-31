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

/** "June 30, 2026" */
export function formatDate(value?: string | null): string {
  if (!value) return ''
  const d = parseServerDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** ISO date for a `<time dateTime>` attribute. */
export function isoDate(value?: string | null): string | undefined {
  if (!value) return undefined
  const d = parseServerDate(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}
