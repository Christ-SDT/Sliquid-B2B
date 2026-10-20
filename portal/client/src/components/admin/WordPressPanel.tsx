import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import type { AnnouncementSyncStatus } from '@/types'
import { timeAgo, formatDateTime } from '@/lib/utils'
import { ArrowRight, CheckCircle, Loader2, PlugZap, RefreshCw } from 'lucide-react'
import {
  inputClass, labelClass, primaryButton, secondaryButton, okText, errorText, ResultLine,
} from './dashboardUi'

interface SyncResult {
  status: 'ok' | 'error'
  posts_seen: number
  posts_created: number
  posts_updated: number
  posts_skipped: number
  duration_ms: number
  message?: string
}

/**
 * Settings form for the WordPress press-release sync. The server endpoints
 * (`/announcements/admin/*`) predate this panel; it is their first client.
 * Env vars (WP_BASE_URL, WP_ANNOUNCEMENTS_CATEGORY_ID, WP_ANNOUNCEMENTS_CUTOFF)
 * outrank what is saved here, so the form shows the EFFECTIVE values.
 */
export default function WordPressPanel({ canEdit }: { canEdit: boolean }) {
  const [status, setStatus] = useState<AnnouncementSyncStatus | null>(null)
  const [loadError, setLoadError] = useState('')

  const [baseUrl, setBaseUrl] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [cutoffDate, setCutoffDate] = useState('')
  const [enabled, setEnabled] = useState(true)

  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null)

  function load() {
    api.get<AnnouncementSyncStatus>('/announcements/admin/sync/status')
      .then(s => {
        setStatus(s)
        setLoadError('')
        setBaseUrl(s.config.baseUrl)
        setCategoryId(String(s.config.categoryId))
        setCutoffDate(s.config.cutoffDate)
        setEnabled(s.enabled)
      })
      .catch((e: any) => setLoadError(e?.message ?? 'Could not load WordPress settings'))
  }

  useEffect(load, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setSaveMsg(null)
    try {
      await api.put('/announcements/admin/settings', {
        baseUrl: baseUrl.trim(),
        categoryId: categoryId.trim(),
        cutoffDate: cutoffDate.trim(),
        enabled,
      })
      setSaveMsg({ ok: true, message: 'Settings saved.' })
      load()
    } catch (err: any) {
      setSaveMsg({ ok: false, message: err?.message ?? 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function test() {
    setTesting(true)
    setTestResult(null)
    try {
      const r = await api.post<{ ok: boolean; error?: string; total?: number }>('/announcements/admin/test', {})
      setTestResult(r.ok
        ? { ok: true, message: `Connected — ${r.total ?? 0} published post(s) in the category.` }
        : { ok: false, message: r.error ?? 'Connection failed' })
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function syncNow() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const r = await api.post<SyncResult>('/announcements/admin/sync', {})
      setSyncResult(r.status === 'ok'
        ? {
            ok: true,
            message: `Synced in ${(r.duration_ms / 1000).toFixed(1)}s — ${r.posts_seen} seen, ${r.posts_created} new, ${r.posts_updated} updated, ${r.posts_skipped} skipped.`,
          }
        : { ok: false, message: r.message ?? 'Sync completed with errors' })
      load()
    } catch (err: any) {
      setSyncResult({ ok: false, message: err?.message ?? 'Sync failed' })
    } finally {
      setSyncing(false)
    }
  }

  const last = status?.lastSync ?? null

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-on-canvas-subtle text-sm max-w-prose">
          Press releases are pulled from WordPress (read-only) into Announcements.
          Railway variables WP_BASE_URL, WP_ANNOUNCEMENTS_CATEGORY_ID and WP_ANNOUNCEMENTS_CUTOFF override what is saved here.
        </p>
        <Link
          to="/admin/announcements"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-portal-accent hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent rounded"
        >
          Manage announcements <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>

      {loadError && <p role="alert" className={`text-sm ${errorText}`}>{loadError}</p>}

      {status && (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div className="bg-portal-bg rounded-lg px-3 py-2.5 min-w-0 col-span-2 sm:col-span-1">
            <dt className="text-on-canvas-subtle text-xs">Last sync</dt>
            <dd className="text-on-canvas font-medium break-words">
              {last ? (
                <>
                  <time dateTime={last.synced_at} title={formatDateTime(last.synced_at)}>{timeAgo(last.synced_at)}</time>
                  {' · '}
                  <span className={last.status === 'ok' ? okText : errorText}>{last.status}</span>
                </>
              ) : 'Never'}
            </dd>
          </div>
          <div className="bg-portal-bg rounded-lg px-3 py-2.5">
            <dt className="text-on-canvas-subtle text-xs">Live</dt>
            <dd className="text-on-canvas font-medium tabular-nums">{status.counts.live ?? 0}</dd>
          </div>
          <div className="bg-portal-bg rounded-lg px-3 py-2.5">
            <dt className="text-on-canvas-subtle text-xs">Hidden</dt>
            <dd className="text-on-canvas font-medium tabular-nums">{status.counts.hidden ?? 0}</dd>
          </div>
          <div className="bg-portal-bg rounded-lg px-3 py-2.5">
            <dt className="text-on-canvas-subtle text-xs">Scheduled sync</dt>
            <dd className="text-on-canvas font-medium">{status.enabled ? 'On' : 'Off'}</dd>
          </div>
        </dl>
      )}
      {last?.status === 'error' && last.message && (
        <p className={`text-xs break-words ${errorText}`}>{last.message}</p>
      )}

      {status && !canEdit && (
        <dl className="grid grid-cols-1 sm:grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-on-canvas-subtle">Base URL</dt><dd className="text-on-canvas break-all">{status.config.baseUrl}</dd>
          <dt className="text-on-canvas-subtle">Category id</dt><dd className="text-on-canvas">{status.config.categoryId}</dd>
          <dt className="text-on-canvas-subtle">Cutoff date</dt><dd className="text-on-canvas">{status.config.cutoffDate}</dd>
          <dt className="text-on-canvas-subtle">App password</dt><dd className="text-on-canvas">{status.config.hasAuth ? 'Set' : 'Not set'}</dd>
        </dl>
      )}

      {status && canEdit && (
        <form onSubmit={save} className="space-y-4 border-t border-portal-border pt-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="sm:col-span-2">
              <label htmlFor="wp-base-url" className={labelClass}>WordPress base URL</label>
              <input id="wp-base-url" type="url" required value={baseUrl} onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://sliquid.com" className={inputClass} />
            </div>
            <div>
              <label htmlFor="wp-category" className={labelClass}>Press Releases category id</label>
              <input id="wp-category" type="number" min={1} step={1} required value={categoryId}
                onChange={e => setCategoryId(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label htmlFor="wp-cutoff" className={labelClass}>Cutoff date</label>
              <input id="wp-cutoff" type="date" required value={cutoffDate}
                onChange={e => setCutoffDate(e.target.value)} className={inputClass} />
            </div>
          </div>

          <label className="inline-flex items-center gap-2.5 text-sm text-on-canvas cursor-pointer">
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-portal-border accent-[rgb(var(--portal-accent))] focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent" />
            Run the scheduled sync every 30 minutes
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving} className={primaryButton}>
              {saving && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
              {saving ? 'Saving…' : 'Save settings'}
            </button>
            <button type="button" onClick={test} disabled={testing} className={secondaryButton}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PlugZap className="w-4 h-4" aria-hidden="true" />}
              Test connection
            </button>
            <button type="button" onClick={syncNow} disabled={syncing} className={secondaryButton}>
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} aria-hidden="true" />
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
          <p role="status" aria-live="polite" className={`text-sm ${saveMsg ? (saveMsg.ok ? okText : errorText) : 'sr-only'}`}>
            {saveMsg && (saveMsg.ok
              ? <span className="inline-flex items-center gap-1.5"><CheckCircle className="w-4 h-4" aria-hidden="true" />{saveMsg.message}</span>
              : saveMsg.message)}
          </p>
          <ResultLine result={testResult} />
          <ResultLine result={syncResult} />
        </form>
      )}
    </div>
  )
}
