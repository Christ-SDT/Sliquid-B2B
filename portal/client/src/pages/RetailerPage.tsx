import { useState, FormEvent } from 'react'
import { api } from '@/api/client'
import { CheckCircle, LayoutGrid, Flag, Zap, Check, Loader2, Package } from 'lucide-react'

// ─── Marketing Items Catalog ──────────────────────────────────────────────────
// To add images: set imageUrl to the WordPress media URL for each item.
// e.g. imageUrl: 'https://yoursite.com/wp-content/uploads/counter-cards.jpg'

interface MarketingItem {
  id: string
  name: string
  subtitle: string
  description: string
  specs: string[]
  variants: string[]
  imageUrl: string | null
  Icon: React.ComponentType<{ className?: string }>
}

const MARKETING_ITEMS: MarketingItem[] = [
  {
    id: 'counter-cards',
    name: 'Counter Cards',
    subtitle: '5" × 7" Easel Back',
    description:
      'Eye-catching point-of-sale counter cards with an easel back stand. Perfect for checkout counters, product shelves, and display tables to educate customers about Sliquid product lines.',
    specs: ['5" × 7" format', 'Easel back stand', 'Full-color print', 'Multiple designs available'],
    variants: [
      'Naturals Collection',
      'Organics Collection',
      'Swirl Collection',
      'Ride Lube Collection',
      'Sliquid Naturals Satin',
      'SliqPick Infographic',
    ],
    imageUrl: null, // Add WordPress image URL here
    Icon: LayoutGrid,
  },
  {
    id: 'retractable-banner',
    name: 'Retractable Banner',
    subtitle: "2' × 5' Display Banner",
    description:
      'A professional full-color retractable banner ideal for events, trade shows, and in-store promotions. Lightweight and quick to set up — comes with a zippered nylon carry bag.',
    specs: ["2' × 5' size", 'Lightweight design', 'Zippered nylon carry bag', 'Full-color print', 'Indoor use only'],
    variants: [],
    imageUrl: null, // Add WordPress image URL here
    Icon: Flag,
  },
  {
    id: 'neon-sliquid',
    name: 'Sliquid Neon Sign',
    subtitle: 'LED Neon Display',
    description:
      'Illuminate your store with the iconic Sliquid logo in vibrant LED neon. Creates an unforgettable display for windows, feature walls, and behind-the-counter setups.',
    specs: [
      'Neon size: 18.6" × 22"',
      'Base size: 18.04" × 5.91"',
      '2 hooks + hanging chain',
      'Transparent base',
      'Indoor use only',
      'Box: 21.7" × 25.2" × 2.8"',
    ],
    variants: [],
    imageUrl: null, // Add WordPress image URL here
    Icon: Zap,
  },
  {
    id: 'neon-ride',
    name: 'Ride Lube Neon Sign',
    subtitle: 'LED Neon Display',
    description:
      'Draw attention with the bold Ride Lube LED neon sign. Perfect for showcasing the Ride Lube brand in an eye-catching way anywhere in your store.',
    specs: [
      'Neon size: 22" × 11.67"',
      'Base size: 22" × 5.12"',
      '2 hooks + hanging chain',
      'Transparent base',
      'Indoor use only',
      'Box: 25.2" × 14.8" × 2.8"',
    ],
    variants: [],
    imageUrl: null, // Add WordPress image URL here
    Icon: Zap,
  },
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface SelectedItem {
  id: string
  variants: string[]
}

// ─── Item Card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: MarketingItem
  selected: SelectedItem | undefined
  onToggle: () => void
  onToggleVariant: (v: string) => void
}

function ItemCard({ item, selected, onToggle, onToggleVariant }: ItemCardProps) {
  const isSelected = !!selected
  const { Icon } = item

  return (
    <div
      className={`bg-surface border rounded-xl overflow-hidden transition-all duration-150
        ${isSelected ? 'border-portal-accent shadow-[0_0_0_1px] shadow-portal-accent/30' : 'border-portal-border hover:border-portal-border/80'}`}
    >
      {/* Image / Placeholder */}
      <div className="aspect-[16/7] relative overflow-hidden bg-portal-bg flex items-center justify-center">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-on-canvas-muted/40">
            <Icon className="w-10 h-10" />
          </div>
        )}
        {isSelected && (
          <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-portal-accent flex items-center justify-center shadow">
            <Check className="w-3.5 h-3.5 text-white" />
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-on-canvas font-semibold text-base">{item.name}</h3>
            <p className="text-portal-accent text-xs font-medium mt-0.5">{item.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onToggle}
            className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
              ${isSelected
                ? 'bg-portal-accent text-white hover:bg-portal-accent/80'
                : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
              }`}
          >
            {isSelected ? '✓ Selected' : 'Select'}
          </button>
        </div>

        <p className="text-on-canvas-muted text-sm mt-3 leading-relaxed">{item.description}</p>

        {/* Specs */}
        <ul className="mt-3 space-y-1">
          {item.specs.map(spec => (
            <li key={spec} className="flex items-center gap-2 text-xs text-on-canvas-subtle">
              <span className="w-1 h-1 rounded-full bg-portal-accent flex-shrink-0" />
              {spec}
            </li>
          ))}
        </ul>

        {/* Variant picker — only when item is selected and has variants */}
        {isSelected && item.variants.length > 0 && (
          <div className="mt-4 pt-4 border-t border-portal-border">
            <p className="text-on-canvas text-xs font-semibold mb-2 uppercase tracking-wider">
              Select Designs <span className="text-red-400">*</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {item.variants.map(v => {
                const checked = selected!.variants.includes(v)
                return (
                  <button
                    key={v}
                    type="button"
                    onClick={() => onToggleVariant(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${checked
                        ? 'bg-portal-accent text-white'
                        : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
                      }`}
                  >
                    {checked && <Check className="w-3 h-3 inline mr-1" />}
                    {v}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RetailerPage() {
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function toggleItem(id: string) {
    setSelectedItems(prev =>
      prev.find(i => i.id === id)
        ? prev.filter(i => i.id !== id)
        : [...prev, { id, variants: [] }]
    )
  }

  function toggleVariant(itemId: string, variant: string) {
    setSelectedItems(prev => prev.map(item => {
      if (item.id !== itemId) return item
      return {
        ...item,
        variants: item.variants.includes(variant)
          ? item.variants.filter(v => v !== variant)
          : [...item.variants, variant],
      }
    }))
  }

  function buildRequestedItems() {
    return selectedItems.map(sel => {
      const def = MARKETING_ITEMS.find(m => m.id === sel.id)!
      if (sel.variants.length > 0) return `${def.name} (${sel.variants.join(', ')})`
      return def.name
    }).join('; ')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (selectedItems.length === 0) {
      setError('Please select at least one item above before submitting.')
      return
    }
    const ccSel = selectedItems.find(i => i.id === 'counter-cards')
    if (ccSel && ccSel.variants.length === 0) {
      setError('Please select at least one Counter Card design.')
      return
    }

    setLoading(true)
    try {
      await api.post('/retailer/apply', {
        contact_name: name,
        business_name: company,
        address: location,
        requested_items: buildRequestedItems(),
        request_notes: notes || null,
      })
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message ?? 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ─── Success state ─────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="max-w-lg mx-auto text-center py-16">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-8 h-8 text-emerald-400" />
        </div>
        <h2 className="text-on-canvas text-2xl font-bold mb-3">Request Submitted!</h2>
        <p className="text-on-canvas-subtle mb-6">
          Thanks, <strong className="text-on-canvas">{name}</strong>! Your marketing material
          request for <strong className="text-on-canvas">{company}</strong> has been received.
          Our team will follow up shortly.
        </p>
        <div className="bg-surface border border-portal-border rounded-xl p-5 text-left">
          <p className="text-on-canvas-muted text-xs font-semibold uppercase tracking-wider mb-3">Items Requested</p>
          {selectedItems.map(sel => {
            const def = MARKETING_ITEMS.find(m => m.id === sel.id)!
            return (
              <div key={sel.id} className="flex items-start gap-3 py-2 border-b border-portal-border/50 last:border-0">
                <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-on-canvas text-sm font-medium">{def.name}</p>
                  {sel.variants.length > 0 && (
                    <p className="text-on-canvas-muted text-xs mt-0.5">{sel.variants.join(', ')}</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  // ─── Page ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Package className="w-5 h-5 text-portal-accent" />
          <h1 className="text-on-canvas text-2xl font-bold">Request Marketing Materials</h1>
        </div>
        <p className="text-on-canvas-muted text-sm">
          Browse our in-store display items below. Select the ones you'd like for your location, then fill out your details and submit.
        </p>
      </div>

      {/* Catalog */}
      <div>
        <h2 className="text-on-canvas font-semibold text-base mb-1">Available Items</h2>
        <p className="text-on-canvas-muted text-sm mb-4">Click <span className="font-medium text-on-canvas-subtle">Select</span> on any item to add it to your request.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {MARKETING_ITEMS.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              selected={selectedItems.find(s => s.id === item.id)}
              onToggle={() => toggleItem(item.id)}
              onToggleVariant={v => toggleVariant(item.id, v)}
            />
          ))}
        </div>
      </div>

      {/* Request Form */}
      <div className="bg-surface border border-portal-border rounded-xl p-6">
        <h2 className="text-on-canvas font-semibold text-lg mb-1">Your Information</h2>
        <p className="text-on-canvas-muted text-sm mb-5">Tell us where to send the materials.</p>

        {/* Selected items summary */}
        {selectedItems.length > 0 && (
          <div className="mb-5 p-4 bg-portal-accent/5 border border-portal-accent/20 rounded-lg">
            <p className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-2">
              Selected ({selectedItems.length})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map(sel => {
                const def = MARKETING_ITEMS.find(m => m.id === sel.id)!
                return (
                  <span key={sel.id} className="flex items-center gap-1 px-2.5 py-1 bg-portal-accent/15 text-portal-accent rounded-full text-xs font-medium">
                    <Check className="w-3 h-3" />
                    {def.name}
                    {sel.variants.length > 0 && ` (${sel.variants.length})`}
                  </span>
                )
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Full Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Jane Smith"
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Company / Business Name *</label>
            <input
              type="text"
              value={company}
              onChange={e => setCompany(e.target.value)}
              placeholder="Your store or company name"
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Physical Location / Storefront Address *</label>
            <textarea
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="123 Main St, City, State, ZIP"
              required
              rows={2}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
            />
          </div>

          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              Additional Notes <span className="text-on-canvas-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Anything else you'd like us to know about your request…"
              rows={2}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
            />
          </div>

          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-portal-accent hover:bg-portal-accent/90
                       disabled:opacity-60 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm mt-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading ? 'Submitting…' : 'Submit Request'}
          </button>
        </form>
      </div>
    </div>
  )
}
