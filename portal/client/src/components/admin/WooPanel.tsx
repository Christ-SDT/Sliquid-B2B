import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { RefreshCw, CheckCircle, XCircle, Loader2 } from 'lucide-react'

interface WooStatus {
  configured: boolean
  lastPull: { synced_at: string; status: string; products_updated: number; message?: string } | null
  lastPush: { synced_at: string; status: string; products_updated: number; message?: string } | null
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export default function WooPanel({ canEdit }: { canEdit: boolean }) {
  const [wooStatus, setWooStatus] = useState<WooStatus | null>(null)
  const [wooLoading, setWooLoading] = useState(true)

  const [url, setUrl] = useState('')
  const [consumerKey, setConsumerKey] = useState('')
  const [consumerSecret, setConsumerSecret] = useState('')
  const [credSaveState, setCredSaveState] = useState<SaveState>('idle')
  const [credError, setCredError] = useState('')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  function fetchStatus() {
    setWooLoading(true)
    api.get<WooStatus>('/woo/status')
      .then(setWooStatus)
      .catch(console.error)
      .finally(() => setWooLoading(false))
  }

  useEffect(fetchStatus, [])

  async function handleSaveCreds() {
    setCredSaveState('saving')
    setCredError('')
    try {
      await api.post('/woo/settings', {
        url: url.trim(),
        consumer_key: consumerKey.trim(),
        consumer_secret: consumerSecret.trim(),
      })
      setCredSaveState('saved')
      setTimeout(() => setCredSaveState('idle'), 2500)
      fetchStatus()
    } catch (e: any) {
      setCredError(e.message ?? 'Failed to save')
      setCredSaveState('error')
    }
  }

  async function handleTest() {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await api.post<{ ok: boolean; error?: string }>('/woo/test', {})
      setTestResult(result)
    } catch (e: any) {
      setTestResult({ ok: false, error: e.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const result = await api.post<{ products_updated: number; status: string }>('/woo/sync', {})
      setSyncMsg(
        result.status === 'ok'
          ? `Pulled ${result.products_updated} product${result.products_updated !== 1 ? 's' : ''} from WooCommerce`
          : 'Sync completed with errors'
      )
      fetchStatus()
    } catch (e: any) {
      setSyncMsg(e.message ?? 'Sync failed')
    } finally {
      setSyncing(false)
    }
  }

  function wooRelativeTime(isoStr: string): string {
    const diff = Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return `${Math.floor(diff / 86400)}d ago`
  }

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-on-canvas font-bold text-lg">WooCommerce Sync</h3>
          <p className="text-on-canvas-subtle text-sm mt-0.5">Connect your WooCommerce store to sync inventory</p>
        </div>
        {!wooLoading && wooStatus && (
          <div className="flex items-center gap-2">
            {wooStatus.configured ? (
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
                <CheckCircle className="w-4 h-4" aria-hidden="true" /> Connected
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-on-canvas-muted text-sm">
                <XCircle className="w-4 h-4" aria-hidden="true" /> Not Configured
              </span>
            )}
          </div>
        )}
      </div>

      {wooStatus?.lastPull && (
        <div className="bg-portal-bg rounded-lg px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-on-canvas-subtle text-xs">Last pull</p>
            <p className="text-on-canvas text-sm font-medium mt-0.5">
              {wooRelativeTime(wooStatus.lastPull.synced_at)}
              {' · '}
              <span className={wooStatus.lastPull.status === 'ok' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                {wooStatus.lastPull.status}
              </span>
              {' · '}
              <span className="text-on-canvas-subtle">{wooStatus.lastPull.products_updated} updated</span>
            </p>
          </div>
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleTest}
            disabled={testing || !wooStatus?.configured}
            className="flex items-center gap-2 px-4 py-2 border border-portal-border text-on-canvas-subtle
                       hover:text-on-canvas hover:border-slate-500 disabled:opacity-40 rounded-lg text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Test Connection
          </button>
          <button
            onClick={handleSync}
            disabled={syncing || !wooStatus?.configured}
            className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                       disabled:opacity-40 text-white dark:text-slate-950 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {syncing ? 'Syncing…' : 'Sync Now'}
          </button>
          {syncMsg && <p role="status" className="text-on-canvas-subtle text-sm self-center">{syncMsg}</p>}
        </div>
      )}

      {testResult && (
        <div role="status" className={`rounded-lg px-4 py-3 text-sm break-words ${testResult.ok ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}>
          {testResult.ok ? '✓ Connection successful' : `✗ ${testResult.error}`}
        </div>
      )}

      {canEdit && (
        <div className="border-t border-portal-border pt-5 space-y-4">
          <p className="text-on-canvas-subtle text-sm font-medium">
            {wooStatus?.configured ? 'Update Credentials' : 'Enter Credentials'}
          </p>
          <div className="grid grid-cols-1 gap-4">
            <div>
              <label htmlFor="woo-url" className="text-on-canvas-subtle text-xs font-medium mb-1.5 block">WooCommerce Store URL</label>
              <input id="woo-url" type="url" autoComplete="off" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-store.com"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent transition-colors" />
            </div>
            <div>
              <label htmlFor="woo-key" className="text-on-canvas-subtle text-xs font-medium mb-1.5 block">Consumer Key</label>
              <input id="woo-key" type="text" autoComplete="off" value={consumerKey} onChange={e => setConsumerKey(e.target.value)} placeholder="ck_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent transition-colors font-mono" />
            </div>
            <div>
              <label htmlFor="woo-secret" className="text-on-canvas-subtle text-xs font-medium mb-1.5 block">Consumer Secret</label>
              <input id="woo-secret" type="password" autoComplete="off" value={consumerSecret} onChange={e => setConsumerSecret(e.target.value)} placeholder="cs_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent focus-visible:ring-2 focus-visible:ring-portal-accent transition-colors font-mono" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSaveCreds}
              disabled={credSaveState === 'saving' || !url || !consumerKey || !consumerSecret}
              className="px-5 py-2.5 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-40
                         text-white dark:text-slate-950 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
            >
              {credSaveState === 'saving' ? 'Saving…' : 'Save Credentials'}
            </button>
            {credSaveState === 'saved' && (
              <span className="text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4" aria-hidden="true" /> Saved
              </span>
            )}
            {credSaveState === 'error' && <span className="text-red-700 dark:text-red-400 text-sm">{credError}</span>}
          </div>
        </div>
      )}
    </div>
  )
}
