import { useTranslation } from 'react-i18next'
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isSupportedLanguage, setLanguage } from '@/i18n'

// A native <select>: keyboard, screen-reader and mobile-picker behaviour for free.
// Styled for the dark TopBar (bg-footer); gray-500 border is 3.04:1 there (≥3:1).
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const current = isSupportedLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en'

  return (
    <div className="flex items-center gap-1.5">
      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2}
        viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
      <label htmlFor="language-switcher" className="sr-only">{t('language.label')}</label>
      <select
        id="language-switcher"
        value={current}
        onChange={(e) => { if (isSupportedLanguage(e.target.value)) void setLanguage(e.target.value) }}
        className="bg-footer text-gray-300 text-sm border border-gray-500 rounded-md px-1.5 py-0.5
                   hover:text-white focus:outline-none focus:ring-2 focus:ring-sliquid-blue-on-dark"
      >
        {SUPPORTED_LANGUAGES.map((lng) => (
          <option key={lng} value={lng} lang={lng}>{LANGUAGE_NAMES[lng]}</option>
        ))}
      </select>
    </div>
  )
}
