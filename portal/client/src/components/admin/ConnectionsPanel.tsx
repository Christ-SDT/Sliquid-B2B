import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import type { IntegrationId, IntegrationStatus, IntegrationTestResult } from '@/types'
import { timeAgo, formatDateTime } from '@/lib/utils'
import { Loader2, PlugZap, RefreshCw, Info } from 'lucide-react'
import {
  SectionHeading, ResultLine, secondaryButton, okText, errorText,
} from './dashboardUi'

const SOURCE_LABEL: Record<IntegrationStatus['source'], string> = {
  env: 'Environment',
  saved: 'Saved in portal',
  default: 'Default',
  mixed: 'Mixed',
  none: 'Not set',
}

/** Readable labels for the non-secret `details` keys the server sends. */
const DETAIL_LABEL: Record<string, string> = {
  store: 'Store',
  envCredentials: 'Env credentials',
  savedCredentials: 'Saved credentials',
  savedOverriddenByEnv: 'Saved overridden by env',
  baseUrl: 'Base URL',
  categoryId: 'Category id',
  cutoffDate: 'Cutoff date',
  syncEnabled: 'Scheduled sync',
  appPasswordConfigured: 'App password',
  publicKeySet: 'Public key',
  privateKeySet: 'Private key',
  serviceIdSet: 'Service id',
  enabled: 'Enabled',
  issuer: 'Issuer',
  clientIdSet: 'Client id',
  clientSecretSet: 'Client secret',
  authorizeUrlSet: 'Authorize URL',
  tokenUrlSet: 'Token URL',
  jwksUrlSet: 'JWKS URL',
  redirectUri: 'Redirect URI',
  url: 'Intake URL',
  pending: 'Pending',
  failing: 'Failing',
  resourceUri: 'Resource URI',
  authMode: 'Auth mode',
  scopes: 'Scopes',
  bucket: 'Bucket',
  region: 'Region',
  accessKeyIdSet: 'Access key id',
  secretAccessKeySet: 'Secret access key',
  publicReadFallback: 'Public read fallback',
  apiKeySet: 'API key',
  creatorModel: 'Creator model',
  creatorModelSaved: 'Model saved',
}

/** Keys whose boolean means "a credential is present" rather than "on". */
const PRESENCE_KEYS = /Set$|Configured$|Credentials$/

function labelFor(key: string): string {
  return DETAIL_LABEL[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())
}

function valueFor(key: string, v: string | number | boolean | null): string {
  if (v === null || v === '') return '—'
  if (typeof v === 'boolean') {
    if (PRESENCE_KEYS.test(key)) return v ? 'Set' : 'Missing'
    return v ? 'Yes' : 'No'
  }
  return String(v)
}

type Health = { label: string; dot: string; text: string }

function healthOf(s: IntegrationStatus): Health {
  if (!s.configured) return { label: 'Not configured', dot: 'bg-slate-400', text: 'text-on-canvas-subtle' }
  if (s.lastResult === 'error') return { label: 'Error', dot: 'bg-red-500', text: errorText }
  if (s.lastResult === 'ok') return { label: 'Connected', dot: 'bg-emerald-500', text: okText }
  return { label: 'Configured', dot: 'bg-sky-500', text: 'text-on-canvas-subtle' }
}

function IntegrationCard({
  status, canEdit, onTested,
}: {
  status: IntegrationStatus
  canEdit: boolean
  onTested: () => void
}) {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<IntegrationTestResult | null>(null)
  const health = healthOf(status)
  const headingId = `integration-${status.id}`
  const details = Object.entries(status.details)

  async function runTest() {
    setTesting(true)
    setResult(null)
    try {
      setResult(await api.post<IntegrationTestResult>(`/admin/integrations/${status.id}/test`, {}))
      onTested()
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? 'Test failed' })
    } finally {
      setTesting(false)
    }
  }

  return (
    <article
      aria-labelledby={headingId}
      className="bg-surface border border-portal-border rounded-xl p-4 sm:p-5 flex flex-col gap-3 min-w-0"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 id={headingId} className="text-on-canvas font-semibold text-sm sm:text-base break-words min-w-0">
          {status.name}
        </h3>
        <span className="flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium bg-surface-elevated border border-portal-border text-on-canvas-subtle">
          {SOURCE_LABEL[status.source]}
        </span>
      </div>

      <p className={`flex items-center gap-2 text-sm font-medium ${health.text}`}>
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${health.dot}`} aria-hidden="true" />
        {health.label}
      </p>

      {status.lastMessage && (
        <p className={`text-xs break-words ${status.lastResult === 'error' ? errorText : 'text-on-canvas-subtle'}`}>
          {status.lastMessage}
        </p>
      )}

      {details.length > 0 && (
        <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
          {details.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-on-canvas-subtle whitespace-nowrap">{labelFor(k)}</dt>
              <dd className="text-on-canvas break-all min-w-0">{valueFor(k, v)}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="text-xs text-on-canvas-subtle">
        Last activity:{' '}
        {status.lastActivity
          ? <time dateTime={status.lastActivity} title={formatDateTime(status.lastActivity)}>{timeAgo(status.lastActivity)}</time>
          : 'none recorded'}
      </p>

      {status.manageHint && (
        <p className="text-xs text-on-canvas-subtle flex gap-1.5">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span className="break-words min-w-0">{status.manageHint}</span>
        </p>
      )}

      {canEdit && status.testable && (
        <div className="mt-auto pt-1 space-y-2">
          <button
            type="button"
            onClick={runTest}
            disabled={testing}
            className={secondaryButton}
            aria-label={`Test ${status.name}`}
          >
            {testing
              ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              : <PlugZap className="w-4 h-4" aria-hidden="true" />}
            {testing ? 'Testing…' : 'Test'}
          </button>
          <ResultLine result={result} />
        </div>
      )}
    </article>
  )
}

export default function ConnectionsPanel({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<IntegrationStatus[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback((quiet = false) => {
    if (!quiet) setLoading(true)
    api.get<IntegrationStatus[]>('/admin/integrations')
      .then(r => { setItems(r); setError('') })
      .catch((e: any) => setError(e?.message ?? 'Could not load connections'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <section aria-labelledby="connections-heading" className="space-y-4">
      <SectionHeading
        id="connections-heading"
        icon={PlugZap}
        title="Connections"
        description="Every external service the portal talks to. No secrets are shown — only whether each one is set."
        action={
          <button type="button" onClick={() => load()} disabled={loading} className={secondaryButton}>
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        }
      />

      {error && <p role="alert" className={`text-sm ${errorText}`}>{error}</p>}

      {loading && !items ? (
        <div className="flex items-center gap-2 text-on-canvas-subtle text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading connections…
        </div>
      ) : items && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(s => (
            <IntegrationCard
              key={s.id as IntegrationId}
              status={s}
              canEdit={canEdit}
              onTested={() => load(true)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
