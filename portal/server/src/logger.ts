import { Response } from 'express'

export interface LogEntry {
  id: number
  ts: string
  level: 'info' | 'warn' | 'error'
  message: string
}

const MAX_ENTRIES = 500
const buffer: LogEntry[] = []
let seq = 0

// SSE subscribers — each is an express Response kept open
const subscribers = new Set<Response>()

function push(level: LogEntry['level'], args: unknown[]) {
  const message = args
    .map(a => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')

  const entry: LogEntry = {
    id: ++seq,
    ts: new Date().toISOString(),
    level,
    message,
  }

  buffer.push(entry)
  if (buffer.length > MAX_ENTRIES) buffer.shift()

  // Fan-out to SSE subscribers
  const data = `data: ${JSON.stringify(entry)}\n\n`
  for (const res of subscribers) {
    try {
      res.write(data)
    } catch {
      subscribers.delete(res)
    }
  }
}

// Intercept console methods so every console.log/warn/error inside the server
// is captured into the circular buffer automatically
const _log   = console.log.bind(console)
const _warn  = console.warn.bind(console)
const _error = console.error.bind(console)

console.log   = (...args: unknown[]) => { _log(...args);   push('info',  args) }
console.warn  = (...args: unknown[]) => { _warn(...args);  push('warn',  args) }
console.error = (...args: unknown[]) => { _error(...args); push('error', args) }

// Called from the /api/logs/stream SSE endpoint
export function addSubscriber(res: Response) {
  subscribers.add(res)
}

export function removeSubscriber(res: Response) {
  subscribers.delete(res)
}

// Returns a snapshot of recent entries, newest last
export function getRecentLogs(limit = MAX_ENTRIES): LogEntry[] {
  return buffer.slice(-limit)
}
