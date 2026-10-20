import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Small shared pieces for the Admin Dashboard panels, so every section reads
 * the same. Status colours pair a 700 shade (light theme) with a 400 shade
 * (dark theme) so the text holds 4.5:1 on both surfaces.
 */

export const inputClass =
  'w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm ' +
  'placeholder:text-on-canvas-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent ' +
  'focus:border-portal-accent transition-colors'

export const labelClass = 'text-on-canvas-subtle text-xs font-medium mb-1.5 block'

export const primaryButton =
  'inline-flex items-center justify-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 ' +
  // White on the dark-theme accent (#4db4e6) is ~2.4:1, so dark mode uses near-black text.
  'disabled:opacity-40 text-white dark:text-slate-950 rounded-lg text-sm font-medium transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface focus-visible:ring-portal-accent'

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 px-4 py-2 border border-portal-border text-on-canvas-subtle ' +
  'hover:text-on-canvas hover:border-slate-500 disabled:opacity-40 rounded-lg text-sm transition-colors ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent'

export const okText = 'text-emerald-700 dark:text-emerald-400'
export const errorText = 'text-red-700 dark:text-red-400'
export const warnText = 'text-amber-700 dark:text-amber-400'

export function SectionHeading({
  id, icon: Icon, title, description, action,
}: {
  id: string
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 id={id} className="text-on-canvas text-lg font-bold flex items-center gap-2">
          <Icon className="w-5 h-5 text-portal-accent flex-shrink-0" aria-hidden="true" />
          {title}
        </h2>
        {description && <p className="text-on-canvas-muted text-sm mt-0.5">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function ResultLine({ result }: { result: { ok: boolean; message: string } | null }) {
  return (
    <p role="status" aria-live="polite" className={`text-sm break-words ${result ? (result.ok ? okText : errorText) : 'sr-only'}`}>
      {result ? `${result.ok ? '✓' : '✗'} ${result.message}` : ''}
    </p>
  )
}

/** "#123" when a Woo id has no known name. */
export function wooLabel(id: number | null, name?: string | null): string {
  if (id === null) return 'Not set'
  return name ? `${name} (#${id})` : `#${id}`
}
