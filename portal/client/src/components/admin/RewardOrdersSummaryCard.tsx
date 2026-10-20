import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '@/api/client'
import type { RewardOrderSummary } from '@/types'
import { AlertTriangle, ArrowRight, Loader2, PackageCheck } from 'lucide-react'
import { errorText, warnText } from './dashboardUi'

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'warn' | 'error' }) {
  const color = tone === 'error' && value > 0 ? errorText : tone === 'warn' && value > 0 ? warnText : 'text-on-canvas'
  return (
    <div className="bg-portal-bg rounded-lg px-3 py-2.5 min-w-0">
      <dt className="text-on-canvas-subtle text-xs">{label}</dt>
      <dd className={`text-xl font-bold tabular-nums ${color}`}>{value}</dd>
    </div>
  )
}

/** Admin Dashboard "Reward orders" card — GET /api/reward-orders/meta/summary. */
export default function RewardOrdersSummaryCard() {
  const [summary, setSummary] = useState<RewardOrderSummary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<RewardOrderSummary>('/reward-orders/meta/summary')
      .then(setSummary)
      .catch((e: unknown) => setError(
        e instanceof ApiError && e.status === 503
          ? 'WooCommerce is not configured, so reward orders cannot be summarised yet.'
          : (e as any)?.message ?? 'Could not load the reward order summary',
      ))
      .finally(() => setLoading(false))
  }, [])

  const wooStatuses = summary ? Object.entries(summary.by_woo_status ?? {}).sort((a, b) => b[1] - a[1]) : []

  return (
    <section aria-labelledby="reward-orders-heading" className="bg-surface border border-portal-border rounded-xl p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="reward-orders-heading" className="text-on-canvas font-bold text-lg flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-portal-accent" aria-hidden="true" /> Reward orders
          </h3>
          <p className="text-on-canvas-subtle text-sm mt-0.5">Certification reward claims and their WooCommerce orders.</p>
        </div>
        <Link
          to="/marketing-requests"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-portal-accent hover:underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent rounded"
        >
          Manage reward orders <ArrowRight className="w-4 h-4" aria-hidden="true" />
        </Link>
      </div>

      {loading && (
        <p className="text-sm text-on-canvas-subtle flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      )}
      {error && <p className={`text-sm ${warnText}`} role="status">{error}</p>}

      {summary && (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Stat label="Claims" value={summary.claims_total} />
            <Stat label="Not started" value={summary.not_started} tone="warn" />
            <Stat label="Drafts" value={summary.draft} />
            <Stat label="Pushing" value={summary.pushing} />
            <Stat label="Failed" value={summary.failed} tone="error" />
            <Stat label="Pushed" value={summary.pushed} />
          </dl>

          {summary.failed > 0 && (
            <p className={`text-sm flex items-start gap-2 ${errorText}`}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {summary.failed} order{summary.failed === 1 ? '' : 's'} failed to push.{' '}
                <Link to="/marketing-requests" className="underline underline-offset-2 font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent rounded">
                  Review and retry
                </Link>
              </span>
            </p>
          )}

          <div>
            <h4 className="text-on-canvas-subtle text-xs font-medium mb-2">Pushed orders by WooCommerce status</h4>
            {wooStatuses.length === 0 ? (
              <p className="text-sm text-on-canvas-subtle">No orders pushed yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {wooStatuses.map(([status, n]) => (
                  <li key={status} className="px-2.5 py-1 rounded-full text-xs bg-surface-elevated border border-portal-border text-on-canvas">
                    <span className="capitalize">{status.replace(/-/g, ' ')}</span>
                    <span className="ml-1.5 font-semibold tabular-nums">{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  )
}
