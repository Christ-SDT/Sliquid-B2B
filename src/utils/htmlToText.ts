/**
 * Plain text from a WordPress HTML fragment (announcement excerpts).
 *
 * Tags become spaces first so "<p>A</p><p>B</p>" reads "A B", not "AB"; the
 * browser's own parser then decodes every entity (&#8217; &hellip; &amp; …).
 * Stripping tags alone left those entities showing literally on the page.
 * A DOMParser document is inert — no scripts run, no images load — and only its
 * textContent is read, which React renders as text.
 */
export function htmlToText(html?: string | null): string {
  if (!html) return ''
  const spaced = html.replace(/<[^>]*>/g, ' ')
  const decoded = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? ''
  return decoded.replace(/\s+/g, ' ').trim()
}
