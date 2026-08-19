import { useState, useCallback } from 'react'
import { cooldownMinutesLeft, markSubmitted, cooldownMessage, type FormId } from '@/utils/formCooldown'

/**
 * One-hour submission gate, shared by every public intake form.
 *
 * `blocked` is seeded on first render rather than in an effect, so a returning
 * visitor never sees the form flash into view before it locks.
 *
 * `lock(minutes)` exists because the server is the real authority: when it
 * answers 429 it also says how long is left, and that number wins over
 * whatever this browser thinks — a visitor who cleared localStorage, or who
 * submitted earlier from their phone, gets the true remaining time.
 */
export function useFormCooldown(formId: FormId) {
  const [minutesLeft, setMinutesLeft] = useState(() => cooldownMinutesLeft(formId))

  const start = useCallback(() => {
    markSubmitted(formId)
    setMinutesLeft(cooldownMinutesLeft(formId))
  }, [formId])

  const lock = useCallback((minutes: number) => {
    markSubmitted(formId)
    setMinutesLeft(Math.max(1, minutes))
  }, [formId])

  return { minutesLeft, blocked: minutesLeft > 0, start, lock }
}

export default function FormCooldownNotice({ minutes, noun }: { minutes: number; noun?: string }) {
  return (
    <div
      role="status"
      className="rounded-lg border border-sliquid-blue/30 bg-sliquid-blue/5 px-4 py-4 text-sm leading-relaxed text-text-gray"
    >
      <p className="mb-1 font-semibold text-text-dark">Already received — thank you.</p>
      <p>{cooldownMessage(minutes, noun)}</p>
      <p className="mt-2 text-xs text-text-light-gray">
        Need something urgently in the meantime? Email{' '}
        <a href="mailto:sales@sliquid.com" className="text-sliquid-blue hover:underline">
          sales@sliquid.com
        </a>
        .
      </p>
    </div>
  )
}
