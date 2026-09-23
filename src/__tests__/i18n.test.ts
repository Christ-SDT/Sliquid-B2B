import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import i18n, { setLanguage, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES } from '@/i18n'

describe('i18n setup', () => {
  beforeEach(async () => {
    window.localStorage.clear()
    await i18n.changeLanguage('en')
  })

  it('defaults to English, with <html lang> in step', () => {
    expect(i18n.resolvedLanguage).toBe('en')
    expect(i18n.t('skipToContent')).toBe('Skip to main content')
    expect(document.documentElement.lang).toBe('en')
  })

  it('setLanguage lazy-loads the language, updates <html lang>, and remembers the choice', async () => {
    await setLanguage('fr')
    expect(i18n.resolvedLanguage).toBe('fr')
    expect(i18n.t('skipToContent')).toBe('Passer au contenu principal')
    expect(document.documentElement.lang).toBe('fr')
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('fr')
  })

  it('maps regional browser codes onto the base language', async () => {
    await i18n.changeLanguage('es-MX')
    expect(i18n.resolvedLanguage).toBe('es')
    expect(i18n.t('language.label')).toBe('Idioma')
    await i18n.changeLanguage('fr-CA')
    expect(i18n.resolvedLanguage).toBe('fr')
  })

  it('falls back to English for an unsupported language', async () => {
    await i18n.changeLanguage('de')
    expect(i18n.resolvedLanguage).toBe('en')
    expect(document.documentElement.lang).toBe('en')
  })
})

// Both apps keep their own copy of the locale files. Every language must carry
// exactly the English key set, so a missing translation fails here rather than
// silently falling back to English in production.
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  ).sort()
}

describe.each([
  ['marketing site', 'src/i18n/locales'],
  ['portal client', 'portal/client/src/i18n/locales'],
])('%s locale files', (_app, dir) => {
  const load = (lng: string) =>
    JSON.parse(readFileSync(resolve(process.cwd(), dir, lng, 'common.json'), 'utf8')) as Record<string, unknown>
  const englishKeys = keyPaths(load('en'))

  it.each(SUPPORTED_LANGUAGES.filter(l => l !== 'en'))('%s has exactly the English keys, none empty', (lng) => {
    const translated = load(lng)
    expect(keyPaths(translated)).toEqual(englishKeys)
    for (const path of englishKeys) {
      const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], translated)
      expect(typeof value === 'string' && value.trim().length > 0, `${lng}: "${path}" is empty`).toBe(true)
    }
  })
})
