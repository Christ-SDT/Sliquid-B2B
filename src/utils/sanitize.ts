import DOMPurify from 'dompurify'

/**
 * Sanitizes user-provided strings to plain text — strips all HTML tags.
 * Used for search inputs and contact form fields to prevent stored XSS.
 * React already escapes rendered values, but this provides a belt-and-suspenders
 * defense for values that may later be stored and retrieved from a CMS/API.
 */
export function sanitizeText(input: string): string {
  return DOMPurify.sanitize(input, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    FORCE_BODY: false,
  })
}

/**
 * Validates and sanitizes a URL — only allows http/https protocols.
 * Returns '#' for any invalid or non-http(s) URL.
 */
export function sanitizeUrl(url: string): string {
  const sanitized = DOMPurify.sanitize(url, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  })
  try {
    const parsed = new URL(sanitized)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return sanitized
    }
  } catch {
    // invalid URL — fall through to safe default
  }
  return '#'
}

/**
 * Sanitizes all string fields of a form data object.
 * Iterates over entries; non-string values are passed through unchanged.
 */
export function sanitizeFormData<T extends object>(data: T): T {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [
      key,
      typeof value === 'string' ? sanitizeText(value) : value,
    ]),
  ) as T
}
