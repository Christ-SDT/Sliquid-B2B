import { ReactNode, useEffect, useRef } from 'react'

/**
 * Accessible modal layer used by every collections dialog.
 *
 * - role="dialog" + aria-modal + aria-labelledby
 * - focus moves into the dialog on open and returns to the opener on close
 * - Tab is trapped inside the panel
 * - Escape closes ONLY the innermost open layer: every mounted Dialog pushes
 *   itself onto a module-level stack, and only the top entry reacts to keys.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

const stack: symbol[] = []

export function isTopLayer(id: symbol): boolean {
  return stack[stack.length - 1] === id
}

interface DialogProps {
  labelledBy: string
  describedBy?: string
  onClose: () => void
  children: ReactNode
  /** Tailwind z-index class for the whole layer, e.g. "z-50". */
  zClass?: string
  panelClassName?: string
  /** Element to focus first; defaults to the first focusable control. */
  initialFocusRef?: React.RefObject<HTMLElement>
  /** Extra key handling while this is the top layer (e.g. arrow keys). */
  onKeyDown?: (e: KeyboardEvent) => void
  /** Closing by clicking the backdrop. Off for dialogs holding unsaved work. */
  closeOnBackdrop?: boolean
}

export default function Dialog({
  labelledBy, describedBy, onClose, children, zClass = 'z-50', panelClassName = '',
  initialFocusRef, onKeyDown, closeOnBackdrop = true,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const onKeyRef = useRef(onKeyDown)
  onCloseRef.current = onClose
  onKeyRef.current = onKeyDown

  useEffect(() => {
    const id = Symbol('dialog')
    stack.push(id)
    const restore = document.activeElement as HTMLElement | null

    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel) return
      const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>(FOCUSABLE) ?? panel
      target.focus()
    })

    function handleKey(e: KeyboardEvent) {
      if (!isTopLayer(id)) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
          .filter(n => n.offsetParent !== null || n === document.activeElement)
        if (nodes.length === 0) { e.preventDefault(); panelRef.current.focus(); return }
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        const active = document.activeElement
        if (!panelRef.current.contains(active)) { e.preventDefault(); first.focus(); return }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
        return
      }
      onKeyRef.current?.(e)
    }

    document.addEventListener('keydown', handleKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKey)
      const i = stack.indexOf(id)
      if (i !== -1) stack.splice(i, 1)
      if (restore && document.contains(restore)) restore.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`fixed inset-0 ${zClass} flex items-center justify-center p-2 sm:p-4`}>
      <div
        className="absolute inset-0 bg-black/60"
        aria-hidden="true"
        onClick={closeOnBackdrop ? () => onCloseRef.current() : undefined}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        tabIndex={-1}
        className={`relative bg-surface border border-portal-border rounded-2xl shadow-xl w-full max-h-[92vh]
                    flex flex-col focus:outline-none ${panelClassName}`}
      >
        {children}
      </div>
    </div>
  )
}

/** Shared focus ring for buttons inside the collections UI. */
export const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface'
