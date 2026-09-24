import i18n from '@/i18n'

/** Error body the portal API sends: an English `message`, plus a stable `code` (and `params`) for user-visible errors. */
export interface ServerError {
  message?: string
  code?: string
  params?: Record<string, unknown>
}

/**
 * Text for a server error in the current UI language.
 *
 * English returns the server's own message untouched — it stays the source of
 * truth, including wording that varies per form ("your application", "your
 * check-in"). Other languages translate by `code` via the `errors` namespace;
 * an unknown or missing code falls back to the server message, then `fallback`.
 */
export function serverErrorText(data: ServerError | null | undefined, fallback: string): string {
  const message = data?.message || fallback
  const code = data?.code
  // Pass params to exists(): plural keys (e.g. forms.cooldown_one/_other) only resolve with `count`.
  if (!code || i18n.resolvedLanguage === 'en' || !i18n.exists(`errors:${code}`, data?.params)) return message
  return i18n.t(`errors:${code}`, { ...(data?.params ?? {}) })
}
