import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'
import enCommon from './locales/en/common.json'

// Keep in step with SUPPORTED_LANGUAGES in portal/server/src/routes/auth.ts and
// src/i18n/index.ts (marketing site).
export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr'] as const
export type Language = (typeof SUPPORTED_LANGUAGES)[number]

// Each language's own name for itself — never translated, so a visitor who
// can't read the current language can still find theirs.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
}

export const LANGUAGE_STORAGE_KEY = 'sliquid_language'

export function isSupportedLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(value)
}

/** Explicit user choice: switches the language and remembers it for next visit. */
export function setLanguage(lng: Language) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lng)
  } catch {
    // Storage blocked (private mode etc.) — the switch still applies for this visit.
  }
  return i18n.changeLanguage(lng)
}

// WCAG 3.1.1 Language of Page — screen readers pick pronunciation from <html lang>.
function syncHtmlLang(lng: string | undefined) {
  document.documentElement.lang = isSupportedLanguage(lng) ? lng : 'en'
}
i18n.on('languageChanged', () => syncHtmlLang(i18n.resolvedLanguage))

// English ships in the main bundle (no flash for the default); every other
// language is a separate content-hashed chunk fetched only when chosen. English
// is excluded here so Vite doesn't also emit it as a (never-loaded) lazy chunk.
const lazyLocales = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*/*.json',
  '!./locales/en/*.json',
])

i18n
  .use(resourcesToBackend((lng: string, ns: string) => {
    const load = lazyLocales[`./locales/${lng}/${ns}.json`]
    return load ? load() : Promise.reject(new Error(`[i18n] no ${lng}/${ns} translations`))
  }))
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: { common: enCommon } },
    partialBundledLanguages: true,
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true, // browser 'fr-CA' / 'es-MX' -> 'fr' / 'es'
    load: 'languageOnly',
    fallbackLng: 'en',
    ns: ['common'],
    defaultNS: 'common',
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      // Only an explicit pick (setLanguage) is persisted. Caching the detected
      // browser language would freeze it, so a later browser-language change
      // would never be noticed.
      caches: [],
    },
    interpolation: { escapeValue: false }, // React already escapes
    react: { useSuspense: false },
  })

syncHtmlLang(i18n.resolvedLanguage)

export default i18n

/**
 * Apply the language saved on the user's account (users.preferred_language).
 * Called after login and on session restore so the choice follows the user
 * across devices. A null/unknown value leaves the current language alone.
 */
export function applyAccountLanguage(value: unknown) {
  if (isSupportedLanguage(value) && value !== i18n.resolvedLanguage) {
    void setLanguage(value)
  }
}
