import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
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
// exactly the English key set for every namespace file, so a missing translation
// fails here rather than silently falling back to English in production.
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`],
  ).sort()
}

const LOCALE_DIRS = [
  ['marketing site', 'src/i18n/locales'],
  ['portal client', 'portal/client/src/i18n/locales'],
] as const

const cases = LOCALE_DIRS.flatMap(([app, dir]) =>
  readdirSync(resolve(process.cwd(), dir, 'en'))
    .filter(f => f.endsWith('.json'))
    .flatMap(file => SUPPORTED_LANGUAGES.filter(l => l !== 'en').map(lng => [app, dir, file, lng] as const)),
)

describe('locale files', () => {
  const load = (dir: string, lng: string, file: string) =>
    JSON.parse(readFileSync(resolve(process.cwd(), dir, lng, file), 'utf8')) as Record<string, unknown>

  it.each(cases)('%s: %s/%s matches English for %s', (_app, dir, file, lng) => {
    const englishKeys = keyPaths(load(dir, 'en', file))
    const translated = load(dir, lng, file)
    expect(keyPaths(translated)).toEqual(englishKeys)
    for (const path of englishKeys) {
      const value = path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], translated)
      expect(typeof value === 'string' && value.trim().length > 0, `${lng}/${file}: "${path}" is empty`).toBe(true)
    }
  })

  it('no language has a namespace file English lacks', () => {
    for (const [, dir] of LOCALE_DIRS) {
      const english = readdirSync(resolve(process.cwd(), dir, 'en')).sort()
      for (const lng of SUPPORTED_LANGUAGES) {
        expect(readdirSync(resolve(process.cwd(), dir, lng)).sort(), `${dir}/${lng}`).toEqual(english)
      }
    }
  })
})
