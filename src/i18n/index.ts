import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import resourcesToBackend from 'i18next-resources-to-backend'

// Keep in step with SUPPORTED_LANGUAGES in portal/server/src/routes/auth.ts and
// portal/client/src/i18n/index.ts.
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

// One JSON file per namespace: `common` for site chrome shared by every page,
// then one per page (`contact`, `catalog`, …) so a translator can work on a
// page in isolation and a visitor only downloads the pages they open.
//
// English ships in the main bundle, eagerly (no flash for the default, and
// tests render synchronously); every other language is a separate
// content-hashed chunk fetched only when chosen. English is excluded from the
// lazy set so Vite doesn't also emit it as a never-loaded chunk.
const englishModules = import.meta.glob<Record<string, unknown>>('./locales/en/*.json', {
  eager: true,
  import: 'default',
})
const englishResources = Object.fromEntries(
  Object.entries(englishModules).map(([path, data]) => [path.replace(/^.*\/(.+)\.json$/, '$1'), data]),
)

const lazyLocales = import.meta.glob<{ default: Record<string, unknown> }>([
  './locales/*/*.json',
  '!./locales/en/*.json',
])

// Every namespace, preloaded for whichever language is active (at init and on
// each changeLanguage). Loading per page on demand made a first visit in es/fr
// render English — and raw keys inside <Trans> — for a few hundred ms until
// that page's chunk arrived. The files are small; loading them together removes
// the flash.
export const NAMESPACES = Object.keys(englishResources)

/**
 * Resolves once the active language's namespaces are loaded. main.tsx waits on
 * it before the first render, so an es/fr visitor never sees English first.
 * Instant for English (bundled).
 */
export const i18nReady: Promise<unknown> = i18n
  .use(resourcesToBackend((lng: string, ns: string) => {
    const load = lazyLocales[`./locales/${lng}/${ns}.json`]
    return load ? load() : Promise.reject(new Error(`[i18n] no ${lng}/${ns} translations`))
  }))
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: { en: englishResources },
    partialBundledLanguages: true,
    supportedLngs: SUPPORTED_LANGUAGES,
    nonExplicitSupportedLngs: true, // browser 'fr-CA' / 'es-MX' -> 'fr' / 'es'
    load: 'languageOnly',
    fallbackLng: 'en',
    ns: NAMESPACES,
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
