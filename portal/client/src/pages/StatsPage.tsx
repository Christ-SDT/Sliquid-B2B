import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import { TrendingUp, DollarSign, Package, BarChart3 } from 'lucide-react'

interface RevenueData {
  byBrand: { brand: string; revenue: number; units: number }[]
  byCategory: { category: string; value: number }[]
}
interface OrderData { month: string; orders: number; revenue: number }

const BRAND_COLORS = ['#0A84C0', '#34d399', '#f59e0b']
const PIE_COLORS = ['#0A84C0', '#34d399', '#f59e0b', '#a78bfa', '#fb923c']

function Card({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="bg-surface border border-portal-border rounded-xl p-5">
      <h3 className="text-slate-400 text-sm font-medium mb-4">{title}</h3>
      {children}
    </div>
  )
}

export default function StatsPage() {
  const [orders, setOrders] = useState<OrderData[]>([])
  const [revenue, setRevenue] = useState<RevenueData | null>(null)
  const [overview, setOverview] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get<OrderData[]>('/stats/orders'),
      api.get<RevenueData>('/stats/revenue'),
      api.get<any>('/stats/overview'),
    ])
      .then(([o, r, ov]) => { setOrders(o); setRevenue(r); setOverview(ov) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-5">
        <h1 className="text-white text-2xl font-bold">Analytics</h1>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-surface border border-portal-border rounded-xl h-24 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-surface border border-portal-border rounded-xl h-72 animate-pulse" />)}
        </div>
      </div>
    )
  }

  const totalOrders = orders.reduce((s, d) => s + d.orders, 0)
  const totalRev = orders.reduce((s, d) => s + d.revenue, 0)
  const avgOrder = totalOrders > 0 ? totalRev / totalOrders : 0

  return (
    <div className="space-y-5">
      <h1 className="text-white text-2xl font-bold">Analytics</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `$${totalRev.toLocaleString()}`, icon: DollarSign },
          { label: 'Total Orders', value: totalOrders.toLocaleString(), icon: Package },
          { label: 'Avg Order Value', value: `$${avgOrder.toFixed(0)}`, icon: TrendingUp },
          { label: 'Active Products', value: overview?.totalProducts ?? '—', icon: BarChart3 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-surface border border-portal-border rounded-xl p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-slate-500 text-xs font-medium uppercase tracking-wider">{label}</p>
                <p className="text-white text-2xl font-bold mt-1">{value}</p>
              </div>
              <div className="w-10 h-10 rounded-lg bg-portal-accent/20 flex items-center justify-center text-portal-accent">
                <Icon className="w-5 h-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Revenue over time */}
        <Card title="Monthly Revenue">
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={orders}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A84C0" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#0A84C0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#f1f5f9' }} />
              <Area type="monotone" dataKey="revenue" stroke="#0A84C0" fill="url(#revGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* Orders over time */}
        <Card title="Monthly Orders">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={orders} barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="orders" fill="#0A84C0" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Revenue by brand */}
        <Card title="Revenue by Brand">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={revenue?.byBrand ?? []} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3a" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="brand" tick={{ fill: '#94a3b8', fontSize: 12 }} axisLine={false} tickLine={false} width={80} />
              <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#f1f5f9' }} />
              <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
                {revenue?.byBrand.map((_, i) => <Cell key={i} fill={BRAND_COLORS[i % BRAND_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Category breakdown */}
        <Card title="Sales by Category">
          <div className="flex items-center gap-6">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={revenue?.byCategory ?? []} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80}>
                  {revenue?.byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#1a1d27', border: '1px solid #2a2d3a', borderRadius: 8, color: '#f1f5f9' }} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-2">
              {revenue?.byCategory.map((c, i) => (
                <div key={c.category} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                    <span className="text-slate-400 text-xs">{c.category}</span>
                  </div>
                  <span className="text-white text-xs font-medium">{c.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
