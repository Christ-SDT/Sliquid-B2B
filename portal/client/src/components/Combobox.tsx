import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown, Check } from 'lucide-react'

interface Props {
  /** Full option list. Filtering happens client-side against these. */
  options: string[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Render a secondary line under an option (e.g. the size/SKU). */
  describe?: (option: string) => string | undefined
  /** When true the typed text is discarded unless it matches an option. */
  strict?: boolean
  required?: boolean
  disabled?: boolean
  emptyLabel?: string
  id?: string
}

/**
 * Type-ahead combobox: type to filter, or open and scroll the full list.
 *
 * Generalized from the store picker in RegisterPage, with the two things that
 * pattern lacked — keyboard navigation (↑/↓/Enter/Escape) and an explicit
 * selected-state check. Nothing else in the codebase does keyboard nav, so this
 * is the component to reuse rather than hand-rolling another dropdown.
 */
export default function Combobox({
  options,
  value,
  onChange,
  placeholder,
  describe,
  strict = false,
  required = false,
  disabled = false,
  emptyLabel = 'No matches',
  id,
}: Props) {
  const [search, setSearch] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  // Keep the visible text in sync when the value is changed from outside
  // (e.g. the admin removes the selected product from the allowed list).
  useEffect(() => { setSearch(value) }, [value])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
        // In strict mode an unmatched draft is not a valid choice — snap back.
        if (strict) setSearch(value)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [strict, value])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    // An exact match means the user has committed — show the whole list again
    // so they can browse siblings instead of seeing a list of one.
    if (!q || q === value.trim().toLowerCase()) return options
    return options.filter(o => o.toLowerCase().includes(q))
  }, [options, search, value])

  // Keep the highlighted row inside the scroll viewport.
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.children[highlight] as HTMLElement | undefined
    el?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  function commit(option: string) {
    onChange(option)
    setSearch(option)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlight(h => {
        const next = e.key === 'ArrowDown' ? h + 1 : h - 1
        if (next < 0) return filtered.length - 1
        if (next >= filtered.length) return 0
        return next
      })
      return
    }
    if (e.key === 'Enter' && open && filtered[highlight]) {
      e.preventDefault()
      commit(filtered[highlight])
      return
    }
    if (e.key === 'Escape') {
      setOpen(false)
      if (strict) setSearch(value)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          value={search}
          disabled={disabled}
          onChange={e => {
            setSearch(e.target.value)
            setHighlight(0)
            setOpen(true)
            // Free-text mode commits as you type; strict mode waits for a pick.
            if (!strict) onChange(e.target.value)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={open}
          aria-controls={id ? `${id}-listbox` : undefined}
          className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 pr-9 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent
                     disabled:opacity-50 transition-colors"
        />
        <ChevronDown
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted pointer-events-none
                      transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Satisfies native form validation without exposing a second visible field */}
      {required && <input type="hidden" value={value} required readOnly />}

      {open && !disabled && (
        <ul
          ref={listRef}
          id={id ? `${id}-listbox` : undefined}
          role="listbox"
          className="absolute z-30 mt-1 w-full bg-surface border border-portal-border rounded-lg shadow-lg
                     max-h-60 overflow-y-auto py-1"
        >
          {filtered.length > 0 ? filtered.map((o, i) => {
            const desc = describe?.(o)
            return (
              <li key={o} role="option" aria-selected={o === value}>
                <button
                  type="button"
                  onMouseDown={e => { e.preventDefault(); commit(o) }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2
                              ${i === highlight ? 'bg-surface-elevated' : ''}
                              ${o === value ? 'text-portal-accent' : 'text-on-canvas'}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{o}</span>
                    {desc && <span className="block text-on-canvas-muted text-xs truncate">{desc}</span>}
                  </span>
                  {o === value && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
                </button>
              </li>
            )
          }) : (
            <li className="px-3 py-2 text-on-canvas-muted text-sm">{emptyLabel}</li>
          )}
        </ul>
      )}
    </div>
  )
}
