import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '@/api/client'
import type { IntegrationTestResult, SsoNotifySettings, SsoOutboxRow } from '@/types'
import { formatDateTime, timeAgo } from '@/lib/utils'
import {
  AlertTriangle, BellRing, Check, CheckCircle, Loader2, Minus, RefreshCw, RotateCcw, Send, XCircle,
} from 'lucide-react'

/**
 * Admin Dashboard → SSO notifications. Relays selected admin notifications to
 * the Sliquid SSO portal, routed by event type to SSO roles. Admin UI (English).
 * Legal (canEdit = false) sees everything, with every write control hidden.
 */

const ROLE_SHORT: Record<string, string> = {
  sliquid_employee: 'Employee',
  sliquid_sales: 'Sales',
  sliquid_marketing: 'Marketing',
  sliquid_warehouse_manager: 'Warehouse',
  sliquid_accounting: 'Accounting',
  sliquid_legal: 'Legal',
  sliquid_development: 'Development',
  sliquid_super_admin: 'Super Admin',
  sliquid_owner: 'Owner',
}
const roleLabel = (r: string) => ROLE_SHORT[r] ?? r

/** next_attempt_at the server uses for a row it will not retry on its own. */
const STOPPED_PREFIX = '9999-'

type Routing = Record<string, string[]>

function sameRouting(a: Routing, b: Routing): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of keys) {
    const x = [...(a[k] ?? [])].sort().join(',')
    const y = [...(b[k] ?? [])].sort().join(',')
    if (x !== y) return false
  }
  return true
}

function errorText(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

function rowStatus(r: SsoOutboxRow): { label: string; className: string } {
  if (r.delivered_at) return { label: 'Delivered', className: 'bg-emerald-600 text-white' }
  if (r.last_error) return { label: 'Failing', className: 'bg-red-600 text-white' }
  return { label: 'Pending', className: 'bg-amber-500 text-white' }
}

export default function SsoNotificationsPanel({ canEdit }: { canEdit: boolean }) {
  const [settings, setSettings] = useState<SsoNotifySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [draft, setDraft] = useState<Routing>({})
  const [savingRouting, setSavingRouting] = useState(false)
  const [routingMsg, setRoutingMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const [toggling, setToggling] = useState(false)
  const [toggleError, setToggleError] = useState('')

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<IntegrationTestResult | null>(null)

  const [retryingId, setRetryingId] = useState<number | null>(null)
  const [draining, setDraining] = useState(false)
  const [actionMsg, setActionMsg] = useState('')

  const apply = useCallback((s: SsoNotifySettings, resetDraft: boolean) => {
    setSettings(s)
    if (resetDraft) setDraft(s.routing)
  }, [])

  const load = useCallback(async (resetDraft: boolean) => {
    setLoadError('')
    try {
      apply(await api.get<SsoNotifySettings>('/admin/sso-notifications'), resetDraft)
    } catch (e) {
      setLoadError(errorText(e, 'Could not load SSO notification settings'))
    } finally {
      setLoading(false)
    }
  }, [apply])

  useEffect(() => { load(true) }, [load])

  const dirty = useMemo(() => !!settings && !sameRouting(draft, settings.routing), [draft, settings])

  function toggleRole(type: string, role: string) {
    setRoutingMsg(null)
    setDraft(prev => {
      const current = prev[type] ?? []
      const next = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
      return { ...prev, [type]: next }
    })
  }

  async function saveRouting() {
    setSavingRouting(true)
    setRoutingMsg(null)
    try {
      const s = await api.put<SsoNotifySettings>('/admin/sso-notifications/settings', { routing: draft })
      apply(s, true)
      setRoutingMsg({ ok: true, text: 'Routing saved' })
    } catch (e) {
      setRoutingMsg({ ok: false, text: errorText(e, 'Could not save routing') })
    } finally {
      setSavingRouting(false)
    }
  }

  async function setEnabled(enabled: boolean) {
    setToggling(true)
    setToggleError('')
    try {
      const s = await api.put<SsoNotifySettings>('/admin/sso-notifications/settings', { enabled })
      // Keep any unsaved routing edits.
      apply(s, false)
    } catch (e) {
      setToggleError(errorText(e, 'Could not change the relay setting'))
    } finally {
      setToggling(false)
    }
  }

  async function sendTest() {
    setTesting(true)
    setTestResult(null)
    try {
      setTestResult(await api.post<IntegrationTestResult>('/admin/sso-notifications/test', {}))
    } catch (e) {
      setTestResult({ ok: false, message: errorText(e, 'Test failed') })
    } finally {
      setTesting(false)
    }
  }

  async function retry(id: number) {
    setRetryingId(id)
    setActionMsg('')
    try {
      apply(await api.post<SsoNotifySettings>(`/admin/sso-notifications/retry/${id}`, {}), false)
    } catch (e) {
      setActionMsg(errorText(e, 'Retry failed'))
    } finally {
      setRetryingId(null)
    }
  }

  async function drainNow() {
    setDraining(true)
    setActionMsg('')
    try {
      const r = await api.post<{ delivered: number }>('/admin/sso-notifications/drain', {})
      setActionMsg(`Delivered ${r.delivered} notification${r.delivered === 1 ? '' : 's'}`)
      await load(false)
    } catch (e) {
      setActionMsg(errorText(e, 'Delivery failed'))
    } finally {
      setDraining(false)
    }
  }

  if (loading) {
    return (
      <section className="bg-surface border border-portal-border rounded-xl p-6" aria-busy="true">
        <div className="flex items-center gap-2 text-on-canvas-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading SSO notifications…
        </div>
      </section>
    )
  }

  if (!settings) {
    return (
      <section className="bg-surface border border-portal-border rounded-xl p-6 space-y-3">
        <h3 className="text-on-canvas font-bold text-lg">SSO Notifications</h3>
        <p role="alert" className="text-red-500 text-sm">{loadError || 'Could not load SSO notification settings'}</p>
        <button
          onClick={() => { setLoading(true); load(true) }}
          className="flex items-center gap-2 px-4 py-2 border border-portal-border rounded-lg text-sm text-on-canvas
                     hover:border-portal-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
        >
          <RefreshCw className="w-4 h-4" aria-hidden="true" /> Try again
        </button>
      </section>
    )
  }

  const { counts, eventTypes, ssoRoles, recent } = settings
  const undelivered = counts.pending + counts.failing

  return (
    <section className="bg-surface border border-portal-border rounded-xl p-6 space-y-6" aria-labelledby="sso-notif-heading">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id="sso-notif-heading" className="text-on-canvas font-bold text-lg flex items-center gap-2">
            <BellRing className="w-5 h-5 text-portal-accent" aria-hidden="true" /> SSO Notifications
          </h3>
          <p className="text-on-canvas-muted text-sm mt-0.5">
            Relay admin notifications to the Sliquid SSO portal, routed by event to SSO roles.
          </p>
          {settings.url && (
            <p className="text-on-canvas-subtle text-xs mt-1 font-mono break-all">{settings.url}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {settings.configured ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
              <CheckCircle className="w-4 h-4" aria-hidden="true" /> Configured
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-on-canvas-muted">
              <XCircle className="w-4 h-4" aria-hidden="true" /> Not configured
            </span>
          )}
          {!canEdit && (
            <span className={settings.enabled ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-on-canvas-muted'}>
              Relay {settings.enabled ? 'on' : 'off'}
            </span>
          )}
        </div>
      </div>

      {!settings.configured && (
        <div className="flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <div className="text-on-canvas">
            <p className="font-medium">Set these Railway environment variables to enable delivery:</p>
            <ul className="mt-1 list-disc pl-5 font-mono text-xs space-y-0.5">
              {(settings.missing?.length
                ? settings.missing
                : ['SSO_NOTIFICATIONS_URL or SSO_ISSUER', 'SSO_CLIENT_ID', 'SSO_CLIENT_SECRET']
              ).map(name => <li key={name}>{name}</li>)}
            </ul>
          </div>
        </div>
      )}

      {/* Controls */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              aria-labelledby="sso-notif-toggle-label"
              disabled={toggling}
              onClick={() => setEnabled(!settings.enabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
                          focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent focus-visible:ring-offset-2
                          disabled:opacity-50 ${settings.enabled ? 'bg-portal-accent' : 'bg-slate-400 dark:bg-slate-600'}`}
            >
              <span
                className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform
                            ${settings.enabled ? 'translate-x-5' : 'translate-x-0.5'}`}
              />
            </button>
            <span id="sso-notif-toggle-label" className="text-on-canvas text-sm font-medium">
              Relay notifications to SSO {toggling && <Loader2 className="inline w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
            </span>
          </div>
          <button
            type="button"
            onClick={sendTest}
            disabled={testing || !settings.configured}
            className="flex items-center gap-2 px-4 py-2 border border-portal-border rounded-lg text-sm text-on-canvas
                       hover:border-portal-accent disabled:opacity-40 transition-colors
                       focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
            Send test notification
          </button>
        </div>
      )}
      {toggleError && <p role="alert" className="text-red-500 text-sm">{toggleError}</p>}
      {testResult && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm ${testResult.ok
            ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
            : 'bg-red-500/10 text-red-700 dark:text-red-400'}`}
        >
          {testResult.ok ? '✓ ' : '✗ '}{testResult.message}
        </div>
      )}

      {/* Counts */}
      <dl className="grid grid-cols-3 gap-3">
        {([
          ['Pending', counts.pending, 'text-amber-600 dark:text-amber-400'],
          ['Delivered', counts.delivered, 'text-emerald-600 dark:text-emerald-400'],
          ['Failing', counts.failing, 'text-red-600 dark:text-red-400'],
        ] as const).map(([label, n, color]) => (
          <div key={label} className="bg-portal-bg rounded-lg px-4 py-3">
            <dt className="text-on-canvas-subtle text-xs">{label}</dt>
            <dd className={`text-xl font-bold mt-0.5 ${n > 0 ? color : 'text-on-canvas'}`}>{n}</dd>
          </div>
        ))}
      </dl>

      {/* Routing */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-on-canvas font-semibold text-sm">Routing</h3>
            <p className="text-on-canvas-muted text-xs mt-0.5">
              Which SSO roles receive each event. An event with no roles is not relayed.
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={() => { setDraft(settings.routing); setRoutingMsg(null) }}
                  className="px-3 py-2 rounded-lg text-sm text-on-canvas-subtle hover:text-on-canvas
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
                >
                  Discard changes
                </button>
              )}
              <button
                type="button"
                onClick={saveRouting}
                disabled={!dirty || savingRouting}
                className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-40
                           text-white rounded-lg text-sm font-medium transition-colors
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent focus-visible:ring-offset-2"
              >
                {savingRouting && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                Save routing
              </button>
            </div>
          )}
        </div>
        {routingMsg && (
          <p role="status" className={`text-sm ${routingMsg.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
            {routingMsg.text}
          </p>
        )}

        <div className="overflow-x-auto rounded-lg border border-portal-border">
          <table className="min-w-full text-sm">
            <caption className="sr-only">Event to SSO role routing</caption>
            <thead className="bg-surface-elevated">
              <tr>
                <th
                  scope="col"
                  className="sticky left-0 z-10 bg-surface-elevated px-3 py-2 text-left font-medium text-on-canvas-subtle whitespace-nowrap"
                >
                  Event
                </th>
                {ssoRoles.map(role => (
                  <th key={role} scope="col" className="px-2 py-2 text-center font-medium text-on-canvas-subtle whitespace-nowrap">
                    {roleLabel(role)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-portal-border">
              {eventTypes.map(({ type, label }) => {
                const roles = (canEdit ? draft[type] : settings.routing[type]) ?? []
                return (
                  <tr key={type}>
                    <th
                      scope="row"
                      className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-medium text-on-canvas whitespace-nowrap"
                    >
                      {label}
                    </th>
                    {ssoRoles.map(role => {
                      const on = roles.includes(role)
                      return (
                        <td key={role} className="px-2 py-2 text-center">
                          {canEdit ? (
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleRole(type, role)}
                              aria-label={`Route ${label} to ${roleLabel(role)}`}
                              className="h-4 w-4 cursor-pointer accent-portal-accent rounded
                                         focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
                            />
                          ) : on ? (
                            <>
                              <Check className="inline w-4 h-4 text-portal-accent" aria-hidden="true" />
                              <span className="sr-only">{`${label} is routed to ${roleLabel(role)}`}</span>
                            </>
                          ) : (
                            <>
                              <Minus className="inline w-4 h-4 text-on-canvas-muted opacity-50" aria-hidden="true" />
                              <span className="sr-only">{`${label} is not routed to ${roleLabel(role)}`}</span>
                            </>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent deliveries */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-on-canvas font-semibold text-sm">Recent deliveries</h3>
          <div className="flex items-center gap-2">
            {canEdit && undelivered > 0 && settings.configured && settings.enabled && (
              <button
                type="button"
                onClick={drainNow}
                disabled={draining}
                className="flex items-center gap-1.5 px-3 py-1.5 border border-portal-border rounded-lg text-xs text-on-canvas
                           hover:border-portal-accent disabled:opacity-40
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
              >
                {draining ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Send className="w-3.5 h-3.5" aria-hidden="true" />}
                Deliver due now
              </button>
            )}
            <button
              type="button"
              onClick={() => load(false)}
              aria-label="Refresh recent deliveries"
              className="p-1.5 rounded-lg text-on-canvas-subtle hover:text-on-canvas
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        {actionMsg && <p role="status" className="text-on-canvas-subtle text-sm">{actionMsg}</p>}

        {recent.length === 0 ? (
          <p className="text-on-canvas-muted text-sm bg-portal-bg rounded-lg px-4 py-3">
            Nothing relayed yet.{!settings.enabled && ' The relay is off.'}
          </p>
        ) : (
          <ul className="divide-y divide-portal-border rounded-lg border border-portal-border">
            {recent.map(r => {
              const st = rowStatus(r)
              const stopped = !r.delivered_at && r.next_attempt_at.startsWith(STOPPED_PREFIX)
              const when = r.delivered_at ?? r.created_at
              return (
                <li key={r.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${st.className}`}>{st.label}</span>
                      <span className="text-on-canvas text-sm font-medium break-words">{r.title || r.type}</span>
                    </div>
                    <p className="text-on-canvas-subtle text-xs mt-1">
                      <span className="font-mono">{r.type}</span>
                      {' · '}
                      {r.attempts} attempt{r.attempts === 1 ? '' : 's'}
                      {' · '}
                      <time dateTime={when} title={formatDateTime(when)}>
                        {r.delivered_at ? 'delivered ' : 'queued '}{timeAgo(when)}
                      </time>
                      {!r.delivered_at && !stopped && r.last_error && (
                        <> · next try {formatDateTime(r.next_attempt_at)}</>
                      )}
                      {stopped && <> · not retrying automatically</>}
                    </p>
                    {r.last_error && !r.delivered_at && (
                      <p className="text-red-600 dark:text-red-400 text-xs mt-1 break-words">{r.last_error}</p>
                    )}
                  </div>
                  {canEdit && !r.delivered_at && (
                    <button
                      type="button"
                      onClick={() => retry(r.id)}
                      disabled={retryingId !== null}
                      aria-label={`Retry ${r.title || r.type}`}
                      className="self-start flex items-center gap-1.5 px-3 py-1.5 border border-portal-border rounded-lg text-xs
                                 text-on-canvas hover:border-portal-accent disabled:opacity-40
                                 focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
                    >
                      {retryingId === r.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                        : <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
                      Retry
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
