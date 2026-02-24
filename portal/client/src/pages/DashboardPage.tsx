import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import {
  Package, FolderOpen, Receipt, Archive,
  TrendingUp, AlertTriangle, ChevronRight, DollarSign,
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

function StatCard({ title, value, sub, icon: Icon, accent = false, warn = false }:
  { title: string; value: string | number; sub?: string; icon: any; accent?: boolean; warn?: boolean }) {
  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className={`text-2xl font-bold mt-1 ${warn ? 'text-amber-400' : 'text-white'}`}>{value}</p>
          {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center
          ${accent ? 'bg-portal-accent/20 text-portal-accent' : warn ? 'bg-amber-400/10 text-amber-400' : 'bg-surface-elevated text-slate-400'}`}>
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

export default function DashboardPage() {
  const { user } = useAuth()
  const [overview, setOverview] = useState<Overview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<Overview>('/stats/overview')
      .then(setOverview)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

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
        <h1 className="text-white text-2xl font-bold">
          {greeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {user?.company ? `${user.company} — ` : ''}{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

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
          <h2 className="text-white font-semibold mb-4">Quick Access</h2>
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
                  <p className="text-white text-sm font-medium">{label}</p>
                  <p className="text-slate-500 text-xs">{desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-portal-accent ml-auto flex-shrink-0 transition-colors" />
              </Link>
            ))}
          </div>
        </div>

        {/* Inventory alerts */}
        <div className="bg-surface border border-portal-border rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">Inventory Alerts</h2>
          {overview && (overview.lowStock > 0 || overview.outOfStock > 0) ? (
            <div className="space-y-3">
              {overview.outOfStock > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-300 text-sm font-medium">{overview.outOfStock} Out of Stock</p>
                    <p className="text-slate-500 text-xs">Needs immediate reorder</p>
                  </div>
                </div>
              )}
              {overview.lowStock > 0 && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <p className="text-amber-300 text-sm font-medium">{overview.lowStock} Low Stock</p>
                    <p className="text-slate-500 text-xs">Below reorder threshold</p>
                  </div>
                </div>
              )}
              <Link to="/inventory" className="block text-center text-portal-accent text-sm hover:underline mt-2">
                View Inventory →
              </Link>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-24 text-slate-600">
              <Archive className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">All stock levels normal</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
