import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { TIER_LABEL } from '@/types'
import type { Asset, Distributor } from '@/types'
import { QUIZZES } from '@/quizzes'
import {
  Package, FolderOpen, Receipt, Archive,
  TrendingUp, AlertTriangle, ChevronRight, DollarSign,
  Star, GraduationCap, Award, Clock, CheckCircle2, MapPin,
} from 'lucide-react'

interface Overview {
  totalProducts: number
  totalAssets: number
  pendingInvoices: number
  overdueInvoices: number
  lowStock: number
  outOfStock: number
  totalRevenue: number
  distributors: number
}

type QuizResult = {
  id: number
  quiz_id: string
  score: number
  passed: number
  completed_at: string
}

function StatCard({ title, value, sub, icon: Icon, accent = false, warn = false }:
  { title: string; value: string | number; sub?: string; icon: any; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${warn ? 'text-amber-400' : 'text-on-canvas'}`}>{value}</p>
          {sub && <p className="text-on-canvas-muted text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center
          ${accent ? 'bg-portal-accent/20 text-portal-accent' : warn ? 'bg-amber-400/10 text-amber-400' : 'bg-surface-elevated text-on-canvas-subtle'}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  )
}

const QUICK_LINKS = [
  { to: '/products', label: 'Browse Products', icon: Package, desc: 'View full catalog' },
  { to: '/assets', label: 'Digital Assets', icon: FolderOpen, desc: 'Logos, banners & more' },
  { to: '/invoices', label: 'View Invoices', icon: Receipt, desc: 'Billing & payments' },
  { to: '/stats', label: 'Analytics', icon: TrendingUp, desc: 'Sales & performance' },
]

// --- Tier 1 mini widgets ---

function MiniAssetsWidget() {
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Asset[]>('/assets')
      .then(data => setAssets(data.slice(0, 4)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-4 h-4 text-portal-accent" />
          <h3 className="text-on-canvas font-semibold text-sm">Digital Assets</h3>
        </div>
        <Link to="/assets" className="text-portal-accent text-xs hover:underline flex items-center gap-1">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 gap-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-lg bg-portal-bg animate-pulse" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <p className="text-on-canvas-muted text-sm text-center py-4">No assets available</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {assets.map(asset => (
            <div key={asset.id} className="rounded-lg bg-portal-bg border border-portal-border overflow-hidden">
              {asset.thumbnail_url ? (
                <img src={asset.thumbnail_url} alt={asset.name} className="w-full h-14 object-cover" />
              ) : (
                <div className="w-full h-14 flex items-center justify-center bg-portal-accent/10">
                  <FolderOpen className="w-5 h-5 text-portal-accent opacity-50" />
                </div>
              )}
              <div className="px-2 py-1.5">
                <p className="text-on-canvas text-xs font-medium truncate">{asset.name}</p>
                <span className="text-portal-accent text-[10px] font-medium uppercase tracking-wide">{asset.type}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniDistributorsWidget() {
  const [distributors, setDistributors] = useState<Distributor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Distributor[]>('/distributors')
      .then(data => setDistributors(data.slice(0, 4)))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-portal-accent" />
          <h3 className="text-on-canvas font-semibold text-sm">Distributors</h3>
        </div>
        <Link to="/distributors" className="text-portal-accent text-xs hover:underline flex items-center gap-1">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-12 rounded-lg bg-portal-bg animate-pulse" />
          ))}
        </div>
      ) : distributors.length === 0 ? (
        <p className="text-on-canvas-muted text-sm text-center py-4">No distributors available</p>
      ) : (
        <div className="space-y-2">
          {distributors.map(dist => (
            <div key={dist.id} className="flex items-center gap-3 p-2 rounded-lg bg-portal-bg border border-portal-border">
              <div className="w-8 h-8 rounded-md bg-portal-accent/10 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-4 h-4 text-portal-accent opacity-60" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-on-canvas text-xs font-medium truncate">{dist.name}</p>
                <p className="text-on-canvas-muted text-[10px] truncate">{dist.city ? `${dist.city}, ` : ''}{dist.state}</p>
              </div>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-portal-accent/10 text-portal-accent flex-shrink-0">
                {dist.region}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MiniTrainingsWidget() {
  const navigate = useNavigate()
  const [results, setResults] = useState<QuizResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<QuizResult[]>('/quiz/results')
      .then(setResults)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function bestFor(quizId: string): QuizResult | undefined {
    const rows = results.filter(r => r.quiz_id === quizId)
    if (!rows.length) return undefined
    return rows.reduce((best, r) => (r.score > best.score ? r : best), rows[0])
  }

  const passedCount = QUIZZES.filter(q => bestFor(q.id)?.passed === 1).length

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-4 h-4 text-portal-accent" />
          <h3 className="text-on-canvas font-semibold text-sm">Trainings</h3>
        </div>
        <Link to="/trainings" className="text-portal-accent text-xs hover:underline flex items-center gap-1">
          View All <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Progress bar */}
      {!loading && (
        <div className="flex items-center gap-3 mb-4">
          <Award className="w-4 h-4 text-portal-accent flex-shrink-0" />
          <div className="flex-1">
            <p className="text-on-canvas text-xs font-medium mb-1">{passedCount} / {QUIZZES.length} completed</p>
            <div className="w-full h-1.5 bg-surface-elevated rounded-full overflow-hidden">
              <div
                className="h-full bg-portal-accent rounded-full transition-all"
                style={{ width: QUIZZES.length ? `${(passedCount / QUIZZES.length) * 100}%` : '0%' }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Quiz cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {QUIZZES.map(quiz => {
          const best = loading ? undefined : bestFor(quiz.id)
          const hasPassed = best?.passed === 1
          return (
            <div
              key={quiz.id}
              className="bg-portal-bg border border-portal-border rounded-lg p-3 hover:border-portal-accent/30 transition-all"
            >
              <div className="flex items-start gap-2 mb-2">
                <div className="w-7 h-7 rounded-md bg-portal-accent/15 flex items-center justify-center flex-shrink-0">
                  <GraduationCap className="w-3.5 h-3.5 text-portal-accent" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-on-canvas text-xs font-medium leading-snug truncate">{quiz.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="flex items-center gap-0.5 text-on-canvas-muted text-[10px]">
                      <Clock className="w-2.5 h-2.5" />{quiz.estimatedMinutes}m
                    </span>
                    {hasPassed && (
                      <span className="flex items-center gap-0.5 text-emerald-400 text-[10px]">
                        <CheckCircle2 className="w-2.5 h-2.5" />Passed
                      </span>
                    )}
                    {best && !hasPassed && (
                      <span className="text-amber-400 text-[10px]">{best.score}%</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/quiz/${quiz.id}`)}
                className="w-full text-xs py-1.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-md font-medium transition-colors"
              >
                {best ? 'Retake' : 'Start'}
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// --- Upgrade banner ---

function UpgradeBanner({ role }: { role: string }) {
  const tierLabel = TIER_LABEL[role] ?? role
  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-portal-accent/10 border border-portal-accent/30 rounded-xl">
      <Star className="w-5 h-5 text-portal-accent flex-shrink-0" />
      <div>
        <p className="text-on-canvas text-sm font-medium">{tierLabel} Access</p>
        <p className="text-on-canvas-subtle text-xs mt-0.5">
          Want full portal access? Contact your Sliquid sales representative to upgrade.
        </p>
      </div>
    </div>
  )
}

// --- Main page ---

export default function DashboardPage() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  const isRestricted = ['tier1', 'tier2', 'tier3'].includes(user?.role ?? '')
  const showBanner = isRestricted

  useEffect(() => {
    if (isRestricted) { setLoading(false); return }
    api.get<Overview>('/stats/overview')
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [isRestricted])

  const greeting = () => {
    const h = new Date().getHours()
    if (h < 12) return 'Good morning'
    if (h < 18) return 'Good afternoon'
    return 'Good evening'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-on-canvas text-2xl font-bold">
          {greeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-on-canvas-muted text-sm mt-1">
          {user?.company ? `${user.company} — ` : ''}{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Upgrade banner for non-admin roles */}
      {showBanner && <UpgradeBanner role={user!.role} />}

      {isRestricted ? (
        /* --- Restricted dashboard (tier1 / tier2 / tier3) --- */
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <MiniAssetsWidget />
            <MiniDistributorsWidget />
          </div>
          <MiniTrainingsWidget />
        </div>
      ) : (
        /* --- Full dashboard (tier4 / admin) --- */
        <>
          {/* Stats */}
          {loading ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-surface border border-portal-border rounded-xl p-5 h-24 animate-pulse" />
              ))}
            </div>
          ) : overview && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Total Products" value={overview.totalProducts} icon={Package} accent />
              <StatCard title="Digital Assets" value={overview.totalAssets} icon={FolderOpen} accent />
              <StatCard
                title="Open Invoices"
                value={overview.pendingInvoices + overview.overdueInvoices}
                sub={overview.overdueInvoices > 0 ? `${overview.overdueInvoices} overdue` : 'All current'}
                icon={Receipt}
                warn={overview.overdueInvoices > 0}
              />
              <StatCard
                title="Total Revenue"
                value={`$${overview.totalRevenue.toLocaleString()}`}
                sub="Paid invoices"
                icon={DollarSign}
              />
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Quick Links */}
            <div className="lg:col-span-2 bg-surface border border-portal-border rounded-xl p-5">
              <h2 className="text-on-canvas font-semibold mb-4">Quick Access</h2>
              <div className="grid grid-cols-2 gap-3">
                {QUICK_LINKS.map(({ to, label, icon: Icon, desc }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center gap-3 p-4 rounded-lg bg-portal-bg hover:bg-surface-elevated
                               border border-portal-border hover:border-portal-accent/30 transition-all group"
                  >
                    <div className="w-9 h-9 rounded-lg bg-portal-accent/10 text-portal-accent flex items-center justify-center flex-shrink-0">
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-on-canvas text-sm font-medium">{label}</p>
                      <p className="text-on-canvas-muted text-xs">{desc}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-on-canvas-muted group-hover:text-portal-accent ml-auto flex-shrink-0 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Inventory alerts */}
            <div className="bg-surface border border-portal-border rounded-xl p-5">
              <h2 className="text-on-canvas font-semibold mb-4">Inventory Alerts</h2>
              {overview && (overview.lowStock > 0 || overview.outOfStock > 0) ? (
                <div className="space-y-3">
                  {overview.outOfStock > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                      <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-red-300 text-sm font-medium">{overview.outOfStock} Out of Stock</p>
                        <p className="text-on-canvas-muted text-xs">Needs immediate reorder</p>
                      </div>
                    </div>
                  )}
                  {overview.lowStock > 0 && (
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                      <div>
                        <p className="text-amber-300 text-sm font-medium">{overview.lowStock} Low Stock</p>
                        <p className="text-on-canvas-muted text-xs">Below reorder threshold</p>
                      </div>
                    </div>
                  )}
                  <Link to="/inventory" className="block text-center text-portal-accent text-sm hover:underline mt-2">
                    View Inventory →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-24 text-on-canvas-muted">
                  <Archive className="w-8 h-8 mb-2 opacity-40" />
                  <p className="text-sm">All stock levels normal</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
