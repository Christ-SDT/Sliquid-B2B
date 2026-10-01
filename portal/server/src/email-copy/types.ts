import type { en } from './en.js'

export type EmailTemplateId = keyof typeof en.templates

/**
 * One language's email copy. Every language file must carry exactly en.ts's
 * templates and keys — the type requires every template, and emailCopy.test.ts
 * checks every key and that none is empty.
 */
export interface LanguageEmailCopy {
  templates: Record<EmailTemplateId, Record<string, string>>
  roleLabels: Record<string, string>
  defaults: { pointOfContact: string; interests: string }
}
