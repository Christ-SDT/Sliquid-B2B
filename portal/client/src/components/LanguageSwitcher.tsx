import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { LANGUAGE_NAMES, SUPPORTED_LANGUAGES, isSupportedLanguage, setLanguage } from '@/i18n'

// Native <select> for free keyboard/screen-reader/mobile behaviour. Border uses
// on-canvas-muted, not portal-border: portal-border is ~1.2–1.6:1 against the
// surface in both themes, under the 3:1 a control boundary needs; muted is 3.5:1.
export default function LanguageSwitcher() {
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const current = isSupportedLanguage(i18n.resolvedLanguage) ? i18n.resolvedLanguage : 'en'

  function handleChange(value: string) {
    if (!isSupportedLanguage(value)) return
    void setLanguage(value)
    // Saved to the account so it follows the user to other devices. A failed save
    // is non-fatal — the switch already applied locally.
    if (user) {
      api.put('/auth/me/language', { language: value }).catch(err =>
        console.warn('[i18n] could not save language preference', err))
    }
  }

  return (
    <div className="flex items-center gap-1.5 text-on-canvas-subtle">
      <Globe className="w-4 h-4" aria-hidden="true" />
      <label htmlFor="portal-language-switcher" className="sr-only">{t('language.label')}</label>
      <select
        id="portal-language-switcher"
        value={current}
        onChange={e => handleChange(e.target.value)}
        className="bg-surface text-on-canvas-subtle text-sm border border-on-canvas-muted rounded-md
                   px-1.5 py-1 hover:text-on-canvas focus:outline-none focus:ring-2 focus:ring-portal-accent"
      >
        {SUPPORTED_LANGUAGES.map(lng => (
          <option key={lng} value={lng} lang={lng}>{LANGUAGE_NAMES[lng]}</option>
        ))}
      </select>
    </div>
  )
}
