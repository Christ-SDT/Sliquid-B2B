import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { Invoice } from '@/types'
import { Search, Receipt, X, ChevronLeft, ChevronRight } from 'lucide-react'

const STATUSES = ['All', 'paid', 'pending', 'overdue']
const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-emerald-500/20 text-emerald-400',
  pending: 'bg-amber-500/20 text-amber-400',
  overdue: 'bg-red-500/20 text-red-400',
}
const PAGE_SIZE = 10

function InvoiceModal({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative bg-surface border border-portal-border rounded-2xl p-6 w-full max-w-lg z-10"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-on-canvas-muted text-xs uppercase tracking-wider">Invoice</p>
            <h3 className="text-on-canvas font-bold text-lg">{invoice.invoice_number}</h3>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize ${STATUS_STYLES[invoice.status]}`}>
              {invoice.status}
            </span>
            <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-5">
          <div>
            <p className="text-on-canvas-muted text-xs mb-1">Issued</p>
            <p className="text-on-canvas text-sm">{new Date(invoice.issued_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-on-canvas-muted text-xs mb-1">Due</p>
            <p className="text-on-canvas text-sm">{new Date(invoice.due_date).toLocaleDateString()}</p>
          </div>
        </div>

        <div className="bg-portal-bg rounded-xl p-4 mb-5">
          <p className="text-on-canvas-muted text-xs font-medium uppercase tracking-wider mb-3">Line Items</p>
          <div className="space-y-2">
            {invoice.items.map((item, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-on-canvas-subtle">{item.product} <span className="text-on-canvas-muted">× {item.qty}</span></span>
                <span className="text-on-canvas">${(item.qty * item.unit_price).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-portal-border mt-3 pt-3 flex items-center justify-between">
            <span className="text-on-canvas font-semibold">Total</span>
            <span className="text-on-canvas font-bold text-lg">${invoice.amount.toFixed(2)}</span>
          </div>
        </div>

        {invoice.notes && (
          <p className="text-on-canvas-muted text-sm">{invoice.notes}</p>
        )}
      </div>
    </div>
  )
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('All')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Invoice | null>(null)

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (status !== 'All') params.set('status', status)
    if (search) params.set('search', search)
    api.get<Invoice[]>(`/invoices?${params}`)
      .then(data => { setInvoices(data); setPage(1) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [status, search])

  const totalPages = Math.ceil(invoices.length / PAGE_SIZE)
  const paged = invoices.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-on-canvas text-2xl font-bold">Invoices</h1>
        <span className="text-on-canvas-muted text-sm">{invoices.length} total</span>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search invoice number…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <div className="flex gap-2">
          {STATUSES.map(s => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-2 rounded-lg text-sm font-medium capitalize transition-colors
                ${status === s
                  ? 'bg-portal-accent text-white'
                  : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
                }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-portal-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-portal-border">
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3">Invoice #</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3 hidden sm:table-cell">Issued</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3 hidden md:table-cell">Due</th>
                <th className="text-right text-on-canvas-muted font-medium px-4 py-3">Amount</th>
                <th className="text-left text-on-canvas-muted font-medium px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(5)].map((_, i) => (
                    <tr key={i} className="border-b border-portal-border/50">
                      {[...Array(5)].map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-surface-elevated rounded animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                : paged.map(inv => (
                    <tr
                      key={inv.id}
                      onClick={() => setSelected(inv)}
                      className="border-b border-portal-border/50 hover:bg-surface-elevated/50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-portal-accent font-medium font-mono">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-on-canvas-subtle hidden sm:table-cell">
                        {new Date(inv.issued_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-on-canvas-subtle hidden md:table-cell">
                        {new Date(inv.due_date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right text-on-canvas font-semibold">${inv.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-md text-xs font-medium capitalize ${STATUS_STYLES[inv.status]}`}>
                          {inv.status}
                        </span>
                      </td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>

        {!loading && invoices.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted">
            <Receipt className="w-10 h-10 mb-2 opacity-40" />
            <p>No invoices found</p>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-portal-border">
            <p className="text-on-canvas-muted text-xs">
              Page {page} of {totalPages} — {invoices.length} invoices
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg bg-surface-elevated text-on-canvas-subtle hover:text-on-canvas disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg bg-surface-elevated text-on-canvas-subtle hover:text-on-canvas disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && <InvoiceModal invoice={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
