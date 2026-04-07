import { useState, useEffect, useRef, useCallback } from 'react'
import { Activity, Pause, Play, Trash2, Download, ChevronDown } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { cn } from '@/lib/utils'

interface LogEntry {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error'
  message: string
}

type LevelFilter = 'all' | 'info' | 'warn' | 'error'

const LEVEL_COLORS: Record<LogEntry['level'], string> = {
  info:  'text-sky-400',
  warn:  'text-yellow-400',
  error: 'text-red-400',
}

const LEVEL_BG: Record<LogEntry['level'], string> = {
  info:  'bg-sky-500/10 text-sky-400 border-sky-500/20',
  warn:  'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  error: 'bg-red-500/10 text-red-400 border-red-500/20',
}

function formatTs(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
    '.' + String(d.getMilliseconds()).padStart(3, '0')
}

export default function LogsPage() {
  const { user } = useAuth()
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [paused, setPaused] = useState(false)
  const [filter, setFilter] = useState<LevelFilter>('all')
  const [search, setSearch] = useState('')
  const [connected, setConnected] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)

  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const esRef = useRef<EventSource | null>(null)

  pausedRef.current = paused

  const apiBase = import.meta.env.VITE_API_URL ?? ''
  const token = localStorage.getItem('portal_token') ?? ''

  // Load recent logs on mount
  useEffect(() => {
    fetch(`${apiBase}/api/logs?limit=200`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then((d: { logs: LogEntry[] }) => setLogs(d.logs ?? []))
      .catch(() => {/* silently ignore */})
  }, [apiBase, token])

  // SSE live stream
  const connect = useCallback(() => {
    if (esRef.current) esRef.current.close()

    // EventSource doesn't support custom headers — pass token as query param
    const url = `${apiBase}/api/logs/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => setConnected(true)
    es.onerror = () => {
      setConnected(false)
      // Auto-reconnect after 3 s
      setTimeout(connect, 3000)
    }
    es.onmessage = (evt) => {
      if (pausedRef.current) return
      try {
        const entry: LogEntry = JSON.parse(evt.data)
        setLogs(prev => {
          const next = [...prev, entry]
          return next.length > 500 ? next.slice(-500) : next
        })
      } catch {/* ignore malformed */}
    }
  }, [apiBase, token])

  useEffect(() => {
    connect()
    return () => { esRef.current?.close(); setConnected(false) }
  }, [connect])

  // Auto-scroll
  useEffect(() => {
    if (autoScroll && !paused) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll, paused])

  // Detect manual scroll up → disable auto-scroll
  const handleScroll = () => {
    const el = containerRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
    setAutoScroll(atBottom)
  }

  const clearLogs = () => setLogs([])

  const downloadLogs = () => {
    const text = logs
      .map(l => `[${l.ts}] [${l.level.toUpperCase()}] ${l.message}`)
      .join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sliquid-logs-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = logs.filter(l => {
    if (filter !== 'all' && l.level !== filter) return false
    if (search && !l.message.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const counts = {
    info:  logs.filter(l => l.level === 'info').length,
    warn:  logs.filter(l => l.level === 'warn').length,
    error: logs.filter(l => l.level === 'error').length,
  }

  if (!user || (user.role !== 'tier5' && (user.role as string) !== 'admin')) {
    return (
      <div className="flex items-center justify-center h-64 text-on-canvas-muted">
        Access restricted to admins.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            'w-2.5 h-2.5 rounded-full flex-shrink-0',
            connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-400',
          )} />
          <h1 className="text-xl font-bold text-on-canvas flex items-center gap-2">
            <Activity className="w-5 h-5 text-portal-accent" />
            Live Server Logs
          </h1>
          <span className="text-xs text-on-canvas-muted">{connected ? 'streaming' : 'reconnecting…'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={downloadLogs}
            title="Download logs"
            className="p-2 rounded-lg text-on-canvas-subtle hover:text-on-canvas hover:bg-surface-elevated transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={clearLogs}
            title="Clear display"
            className="p-2 rounded-lg text-on-canvas-subtle hover:text-on-canvas hover:bg-surface-elevated transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPaused(p => !p)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
              paused
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20',
            )}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Stat pills + filter row */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'info', 'warn', 'error'] as const).map(lvl => (
          <button
            key={lvl}
            onClick={() => setFilter(lvl)}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
              filter === lvl
                ? lvl === 'all'
                  ? 'bg-portal-accent text-white border-portal-accent'
                  : LEVEL_BG[lvl as LogEntry['level']]
                : 'bg-transparent text-on-canvas-muted border-portal-border hover:border-portal-accent hover:text-on-canvas',
            )}
          >
            {lvl === 'all' ? `All (${logs.length})` : `${lvl} (${counts[lvl]})`}
          </button>
        ))}

        <input
          type="search"
          placeholder="Filter messages…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto px-3 py-1.5 text-sm rounded-lg bg-surface border border-portal-border
                     text-on-canvas placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent w-52"
        />
      </div>

      {/* Log panel */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto rounded-xl border border-portal-border bg-[#0d0d0d] font-mono text-xs leading-5 p-3 space-y-px min-h-0"
        style={{ minHeight: '400px' }}
      >
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-on-canvas-muted text-sm font-sans">
            No log entries yet…
          </div>
        ) : (
          filtered.map(l => (
            <div
              key={l.id}
              className={cn(
                'flex gap-3 px-1 py-0.5 rounded hover:bg-white/5 transition-colors',
              )}
            >
              <span className="text-slate-500 flex-shrink-0 select-none">{formatTs(l.ts)}</span>
              <span className={cn('w-11 flex-shrink-0 font-bold uppercase text-[10px] leading-5', LEVEL_COLORS[l.level])}>
                {l.level}
              </span>
              <span className={cn(
                'break-all',
                l.level === 'error' ? 'text-red-300' : l.level === 'warn' ? 'text-yellow-200' : 'text-slate-300',
              )}>
                {l.message}
              </span>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Jump-to-bottom banner when scrolled up */}
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true)
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
          }}
          className="fixed bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full
                     bg-portal-accent text-white text-xs font-semibold shadow-lg hover:bg-portal-accent/80 transition-colors z-10"
        >
          <ChevronDown className="w-3.5 h-3.5" />
          Jump to latest
        </button>
      )}
    </div>
  )
}
