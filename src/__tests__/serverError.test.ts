import { describe, it, expect, afterEach } from 'vitest'
import i18n from '@/i18n'
import { serverErrorText } from '@/utils/serverError'

describe('serverErrorText', () => {
  afterEach(() => i18n.changeLanguage('en'))

  it('returns the server message untouched in English (per-form wording preserved)', () => {
    const data = { message: "We've already received your check-in — our team is on it.", code: 'forms.cooldown', params: { count: 5 } }
    expect(serverErrorText(data, 'fallback')).toBe(data.message)
  })

  it('translates by code in Spanish and French, with params', async () => {
    await i18n.changeLanguage('es')
    expect(serverErrorText({ message: 'Email already in use', code: 'auth.emailInUse' }, 'x')).toBe('Este correo electrónico ya está en uso')
    expect(serverErrorText({ message: 'x', code: 'forms.cooldown', params: { count: 1 } }, 'x')).toMatch(/aproximadamente 1 minuto\.$/)
    await i18n.changeLanguage('fr')
    expect(serverErrorText({ message: 'x', code: 'forms.cooldown', params: { count: 12 } }, 'x')).toMatch(/environ 12 minutes\.$/)
  })

  it('falls back to the server message for an unknown code, then to the fallback', async () => {
    await i18n.changeLanguage('es')
    expect(serverErrorText({ message: 'Something new', code: 'forms.notYetTranslated' }, 'fb')).toBe('Something new')
    expect(serverErrorText({}, 'fb')).toBe('fb')
    expect(serverErrorText(null, 'fb')).toBe('fb')
  })
})
