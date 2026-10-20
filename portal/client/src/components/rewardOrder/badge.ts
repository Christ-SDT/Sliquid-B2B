import type { RewardOrderBadge, RewardOrderState } from '@/types'

/**
 * One badge vocabulary for the Rewards tab rows and the review modal header,
 * so the two can never describe the same order differently.
 *
 * Colour pairs carry an explicit `dark:` variant: the 400-shade text used
 * elsewhere in the admin UI falls below 4.5:1 on the light theme.
 */
export const TONE = {
  neutral: 'bg-surface-elevated border-portal-border text-on-canvas-subtle',
  info:    'bg-sky-500/10 border-sky-600/40 text-sky-800 dark:text-sky-300',
  ok:      'bg-emerald-500/10 border-emerald-600/40 text-emerald-800 dark:text-emerald-300',
  warn:    'bg-amber-500/10 border-amber-600/40 text-amber-800 dark:text-amber-300',
  bad:     'bg-red-500/10 border-red-600/40 text-red-800 dark:text-red-300',
} as const

export type Tone = keyof typeof TONE

export const STATE_LABEL: Record<RewardOrderState, string> = {
  draft:   'Draft',
  pushing: 'Pushing…',
  pushed:  'Pushed',
  failed:  'Push failed',
  deleted: 'Deleted',
}

const STATE_TONE: Record<RewardOrderState, Tone> = {
  draft: 'neutral', pushing: 'info', pushed: 'info', failed: 'bad', deleted: 'neutral',
}

export function wooStatusTone(slug: string | null | undefined): Tone {
  switch (slug) {
    case 'completed': return 'ok'
    case 'processing': return 'info'
    case 'pending':
    case 'on-hold': return 'warn'
    case 'cancelled':
    case 'refunded':
    case 'failed': return 'bad'
    default: return 'neutral'
  }
}

/** "processing" → "Processing", "on-hold" → "On hold". */
export function humanizeSlug(slug: string): string {
  const s = slug.replace(/[-_]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/** Null when the claim has no order at all — the row then shows only its button. */
export function rewardOrderBadge(
  b: Partial<RewardOrderBadge> | null | undefined,
  statusName?: (slug: string) => string,
): { label: string; tone: Tone } | null {
  if (!b?.order_state) return null
  if (b.order_state === 'pushed' && b.woo_status) {
    const name = statusName ? statusName(b.woo_status) : humanizeSlug(b.woo_status)
    return {
      label: `Woo: ${name}${b.woo_order_number ? ` #${b.woo_order_number}` : ''}`,
      tone: wooStatusTone(b.woo_status),
    }
  }
  return { label: STATE_LABEL[b.order_state], tone: STATE_TONE[b.order_state] }
}
