import { db } from './database.js'

// Must match SUPPORTED_LANGUAGES in both clients' i18n setup
// (src/i18n/index.ts and portal/client/src/i18n/index.ts).
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'nl', 'pt', 'zh'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/** Anything a client sends (or nothing) → a supported language; unknown → English. */
export function resolveLanguage(value: unknown): Language {
  return isSupportedLanguage(value) ? value : 'en'
}

/** BCP 47 tag for Intl formatting — same mapping the clients use. */
export const INTL_LOCALE: Record<Language, string> = {
  en: 'en-US', es: 'es', fr: 'fr-CA', de: 'de-DE', nl: 'nl-NL', pt: 'pt-BR', zh: 'zh-CN',
}

/**
 * BCP 47 tag for an email's `<html lang>` — same as the clients' HTML_LANG.
 * Portuguese is Brazilian and Chinese Simplified (decided); a bare `pt`/`zh`
 * leaves screen readers and email clients guessing the variant.
 */
export const HTML_LANG: Record<Language, string> = {
  en: 'en', es: 'es', fr: 'fr', de: 'de', nl: 'nl', pt: 'pt-BR', zh: 'zh-Hans',
}

/** A portal user's saved language (users.preferred_language); English when unset or unknown. */
export function preferredLanguageOf(userId: number): Language {
  const row = db.prepare('SELECT preferred_language FROM users WHERE id = ?').get(userId) as
    { preferred_language: string | null } | undefined
  return resolveLanguage(row?.preferred_language)
}
