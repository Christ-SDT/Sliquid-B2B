/**
 * Translated copy for partner-facing emails (Phase 5).
 *
 * One file per language in ./email-copy/ (en.ts is the source of truth; its
 * strings are the EmailJS templates' original wording, verbatim). Edit there; `emailCopy.test.ts` fails if a template references a t_* key
 * this file lacks (or vice versa), or if a language is missing a key.
 *
 * Each template gets `lang` plus `t_*` variables (see emailVars()). Dynamic
 * values use `{name}` placeholders, filled server-side and then HTML-escaped by
 * EmailJS's `{{t_*}}` — never render these with triple braces.
 *
 * Admin-facing templates (*_admin, portal_register_admin, b2b_hp_application)
 * are deliberately absent: they go to the Sliquid team and stay English.
 */
import { HTML_LANG, type Language } from './languages.js'
import type { EmailTemplateId, LanguageEmailCopy } from './email-copy/types.js'
import { en } from './email-copy/en.js'
import { es } from './email-copy/es.js'
import { fr } from './email-copy/fr.js'
import { de } from './email-copy/de.js'
import { nl } from './email-copy/nl.js'
import { pt } from './email-copy/pt.js'
import { zh } from './email-copy/zh.js'

export type { EmailTemplateId }

type Copy = Record<string, string>

/** Adding a language = add its file in ./email-copy/ and register it here. */
const BY_LANGUAGE: Record<Language, LanguageEmailCopy> = { en, es, fr, de, nl, pt, zh }

const TEMPLATE_IDS = Object.keys(en.templates) as EmailTemplateId[]

/** Template → language → copy (the shape email.ts and the tests consume). */
export const EMAIL_COPY = Object.fromEntries(
  TEMPLATE_IDS.map(id => [id, Object.fromEntries(
    (Object.keys(BY_LANGUAGE) as Language[]).map(lng => [lng, BY_LANGUAGE[lng].templates[id]]),
  )]),
) as Record<EmailTemplateId, Record<Language, Copy>>

export const ROLE_LABELS = Object.fromEntries(
  (Object.keys(BY_LANGUAGE) as Language[]).map(lng => [lng, BY_LANGUAGE[lng].roleLabels]),
) as Record<Language, Record<string, string>>

export const DEFAULTS = Object.fromEntries(
  (Object.keys(BY_LANGUAGE) as Language[]).map(lng => [lng, BY_LANGUAGE[lng].defaults]),
) as Record<Language, { pointOfContact: string; interests: string }>

/** Replace `{name}` placeholders; unknown placeholders are left as-is. */
export function interpolate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? vars[name] : whole))
}

/**
 * `lang` + every `t_*` variable for a template in the given language, with
 * `{placeholders}` filled from `vars`. Spread into the EmailJS params alongside
 * the template's existing variables.
 */
export function emailVars(templateId: EmailTemplateId, lang: Language, vars: Record<string, string> = {}): Record<string, string> {
  const copy: Copy = EMAIL_COPY[templateId][lang]
  // `lang` only feeds the template's <html lang>, so send the full BCP 47 tag.
  const out: Record<string, string> = { lang: HTML_LANG[lang] }
  for (const [key, value] of Object.entries(copy)) out[key] = interpolate(value, vars)
  return out
}
