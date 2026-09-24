import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { EMAIL_COPY, ROLE_LABELS, DEFAULTS, emailVars, interpolate, type EmailTemplateId } from '../emailCopy.js'
import { SUPPORTED_LANGUAGES } from '../languages.js'

const TEMPLATE_DIR = resolve(__dirname, '../../../email-templates')
const TEMPLATES = Object.keys(EMAIL_COPY) as EmailTemplateId[]

// t_* variables a sender computes itself rather than reading from EMAIL_COPY.
const COMPUTED: Partial<Record<EmailTemplateId, string[]>> = {
  portal_approved: ['t_role_label'],
  portal_cert_issued: ['t_completion_date'],
  b2b_retailer_checkin_confirm: ['t_point_of_contact', 't_interests'],
}

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort()

describe('email copy', () => {
  it.each(TEMPLATES)('%s: every language has exactly the English keys, none empty', (id) => {
    const english = Object.keys(EMAIL_COPY[id].en).sort()
    for (const lng of SUPPORTED_LANGUAGES) {
      const copy: Record<string, string> = EMAIL_COPY[id][lng]
      expect(Object.keys(copy).sort(), `${id}/${lng}`).toEqual(english)
      for (const [key, value] of Object.entries(copy)) {
        expect(value.trim().length, `${id}/${lng}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })

  it.each(TEMPLATES)('%s: translations use exactly the English {placeholders}', (id) => {
    const en: Record<string, string> = EMAIL_COPY[id].en
    for (const lng of SUPPORTED_LANGUAGES) {
      const copy: Record<string, string> = EMAIL_COPY[id][lng]
      for (const key of Object.keys(en)) {
        expect(placeholders(copy[key]), `${id}/${lng}.${key}`).toEqual(placeholders(en[key]))
      }
    }
  })

  it.each(TEMPLATES)('%s.html uses every t_* key it is sent, and nothing it is not', (id) => {
    const html = readFileSync(resolve(TEMPLATE_DIR, `${id}.html`), 'utf8')
    const body = html.slice(html.indexOf('<body'))
    const used = new Set([...(html.match(/\{\{(t_\w+)\}\}/g) ?? [])].map(m => m.slice(2, -2)))
    const sent = new Set([...Object.keys(EMAIL_COPY[id].en), ...(COMPUTED[id] ?? [])])
    expect([...used].sort()).toEqual([...sent].sort())
    expect(html).toContain('<html lang="{{lang}}">')
    expect(html).toContain('<title>{{t_subject}}</title>')
    // User-derived values must stay HTML-escaped by EmailJS.
    expect(body).not.toMatch(/\{\{\{/)
  })

  it('role labels and defaults exist in every language', () => {
    const roles = Object.keys(ROLE_LABELS.en).sort()
    for (const lng of SUPPORTED_LANGUAGES) {
      expect(Object.keys(ROLE_LABELS[lng]).sort()).toEqual(roles)
      expect(DEFAULTS[lng].pointOfContact).toBeTruthy()
      expect(DEFAULTS[lng].interests).toBeTruthy()
    }
  })

  it('emailVars fills placeholders and tags the language', () => {
    const v = emailVars('portal_quiz_pass', 'es', { user_name: 'Ana', quiz_title: 'Satin', score: '92' })
    expect(v.lang).toBe('es')
    expect(v.t_subject).toBe('Aprobó Satin: 92%')
    expect(v.t_heading).toBe('¡Buen trabajo, Ana!')
    expect(Object.keys(v).every(k => k === 'lang' || k.startsWith('t_'))).toBe(true)
  })

  it('interpolate leaves unknown placeholders alone', () => {
    expect(interpolate('Hi {name}, {other}', { name: 'Ana' })).toBe('Hi Ana, {other}')
  })
})
