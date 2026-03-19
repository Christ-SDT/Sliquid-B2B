import { useState, useEffect, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/types'
import {
  CheckCircle, LayoutGrid, Flag, Zap, Check, Loader2, Package,
  Star, Megaphone, Plus, Pencil, Trash2, X, Users, Clock, ThumbsUp, ThumbsDown,
  Monitor, AlertCircle,
  type LucideIcon,
} from 'lucide-react'

// ─── Icon map ─────────────────────────────────────────────────────────────────

const ICON_MAP: Record<string, LucideIcon> = {
  LayoutGrid,
  Flag,
  Zap,
  Package,
  Star,
  Megaphone,
  Monitor,
  Users,
}

// ─── Types ────────────────────────────────────────────────────────────────────

type MarketingItem = {
  id: number
  name: string
  subtitle: string | null
  description: string | null
  specs: string[]
  variants: string[]
  image_url: string | null
  icon_name: string
  sort_order: number
}

type TrainingOption = {
  id: number
  label: string
  subtitle: string | null
  description: string | null
  specs: string[]
  icon_name: string
  sort_order: number
}

interface SelectedItem {
  id: number
  name: string
  variants: string[]
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

function AddItemModal({ onClose, onAdded }: { onClose: () => void; onAdded: (item: MarketingItem) => void }) {
  const [name, setName] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [specsText, setSpecsText] = useState('')
  const [variantsText, setVariantsText] = useState('')
  const [iconName, setIconName] = useState('Package')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const item = await api.post<MarketingItem>('/marketing-items', {
        name: name.trim(),
        subtitle: subtitle.trim() || null,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        specs: specsText.split('\n').map(s => s.trim()).filter(Boolean),
        variants: variantsText.split('\n').map(s => s.trim()).filter(Boolean),
        icon_name: iconName,
        sort_order: 0,
      })
      onAdded(item)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add item')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">Add Marketing Item</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Counter Cards"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Subtitle</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder='e.g. 5" × 7" Easel Back'
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Specs (one per line)</label>
            <textarea value={specsText} onChange={e => setSpecsText(e.target.value)} rows={3} placeholder={'5" × 7" format\nEasel back stand'}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Variants (one per line)</label>
            <textarea value={variantsText} onChange={e => setVariantsText(e.target.value)} rows={3} placeholder={'Naturals Collection\nOrganics Collection'}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Icon</label>
            <select value={iconName} onChange={e => setIconName(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent">
              {Object.keys(ICON_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Item
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

function EditItemModal({ item, onClose, onSaved }: { item: MarketingItem; onClose: () => void; onSaved: (item: MarketingItem) => void }) {
  const [name, setName] = useState(item.name)
  const [subtitle, setSubtitle] = useState(item.subtitle ?? '')
  const [imageUrl, setImageUrl] = useState(item.image_url ?? '')
  const [description, setDescription] = useState(item.description ?? '')
  const [specsText, setSpecsText] = useState(item.specs.join('\n'))
  const [variantsText, setVariantsText] = useState(item.variants.join('\n'))
  const [iconName, setIconName] = useState(item.icon_name)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const updated = await api.put<MarketingItem>(`/marketing-items/${item.id}`, {
        name: name.trim(),
        subtitle: subtitle.trim() || null,
        image_url: imageUrl.trim() || null,
        description: description.trim() || null,
        specs: specsText.split('\n').map(s => s.trim()).filter(Boolean),
        variants: variantsText.split('\n').map(s => s.trim()).filter(Boolean),
        icon_name: iconName,
        sort_order: item.sort_order,
      })
      onSaved(updated)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">Edit Item</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Subtitle</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Image URL</label>
            <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Specs (one per line)</label>
            <textarea value={specsText} onChange={e => setSpecsText(e.target.value)} rows={3}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Variants (one per line)</label>
            <textarea value={variantsText} onChange={e => setVariantsText(e.target.value)} rows={3}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Icon</label>
            <select value={iconName} onChange={e => setIconName(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent">
              {Object.keys(ICON_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Training Option Form ─────────────────────────────────────────────────────

function TrainingOptionForm({
  initial,
  onClose,
  onSaved,
}: {
  initial?: TrainingOption
  onClose: () => void
  onSaved: (opt: TrainingOption) => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [specsText, setSpecsText] = useState(initial?.specs.join('\n') ?? '')
  const [iconName, setIconName] = useState(initial?.icon_name ?? 'Users')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        label: label.trim(),
        subtitle: subtitle.trim() || null,
        description: description.trim() || null,
        specs: specsText.split('\n').map(s => s.trim()).filter(Boolean),
        icon_name: iconName,
        sort_order: initial?.sort_order ?? 0,
      }
      const opt = initial
        ? await api.put<TrainingOption>(`/training-options/${initial.id}`, payload)
        : await api.post<TrainingOption>('/training-options', payload)
      onSaved(opt)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">{initial ? 'Edit Training Option' : 'Add Training Option'}</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Label *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} required placeholder="e.g. Virtual Training"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Subtitle</label>
            <input value={subtitle} onChange={e => setSubtitle(e.target.value)} placeholder="e.g. Live video session"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Specs (one per line)</label>
            <textarea value={specsText} onChange={e => setSpecsText(e.target.value)} rows={4} placeholder={'Flexible scheduling\nProduct walkthroughs'}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Icon</label>
            <select value={iconName} onChange={e => setIconName(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent">
              {Object.keys(ICON_MAP).map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {initial ? 'Save Changes' : 'Add Option'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Item Card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: MarketingItem
  selected: SelectedItem | undefined
  onToggle: () => void
  onToggleVariant: (v: string) => void
  adminMode: boolean
  onEdit: () => void
  onDelete: () => void
}

function ItemCard({ item, selected, onToggle, onToggleVariant, adminMode, onEdit, onDelete }: ItemCardProps) {
  const isSelected = !!selected
  const Icon = ICON_MAP[item.icon_name] ?? Package
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className={`bg-surface border rounded-xl overflow-hidden transition-all duration-150
        ${isSelected ? 'border-portal-accent shadow-[0_0_0_1px] shadow-portal-accent/30' : 'border-portal-border hover:border-portal-border/80'}`}
    >
      {/* Image / Placeholder */}
      <div className="aspect-[16/7] relative overflow-hidden bg-portal-bg flex items-center justify-center">
        {item.image_url ? (
          <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
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
        {/* Admin controls on image */}
        {adminMode && (
          <div className="absolute top-2 left-2 flex gap-1.5">
            <button
              onClick={e => { e.stopPropagation(); onEdit() }}
              className="w-7 h-7 rounded-lg bg-surface/80 backdrop-blur-sm border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors"
            >
              <Pencil className="w-3 h-3" />
            </button>
            {confirmDelete ? (
              <>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false); onDelete() }}
                  className="px-2 h-7 rounded-lg bg-red-500/80 backdrop-blur-sm text-white text-xs font-medium"
                >
                  Delete
                </button>
                <button
                  onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                  className="w-7 h-7 rounded-lg bg-surface/80 backdrop-blur-sm border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
                className="w-7 h-7 rounded-lg bg-surface/80 backdrop-blur-sm border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-on-canvas font-semibold text-base">{item.name}</h3>
            {item.subtitle && <p className="text-portal-accent text-xs font-medium mt-0.5">{item.subtitle}</p>}
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

        {item.description && (
          <p className="text-on-canvas-muted text-sm mt-3 leading-relaxed">{item.description}</p>
        )}

        {/* Specs */}
        {item.specs.length > 0 && (
          <ul className="mt-3 space-y-1">
            {item.specs.map(spec => (
              <li key={spec} className="flex items-center gap-2 text-xs text-on-canvas-subtle">
                <span className="w-1 h-1 rounded-full bg-portal-accent flex-shrink-0" />
                {spec}
              </li>
            ))}
          </ul>
        )}

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
  const { user } = useAuth()
  const adminMode = isAdmin(user?.role ?? '')

  type PriorRequest = {
    id: number
    business_name: string
    requested_items: string
    status: string
    submitted_at: string
  }

  const [items, setItems] = useState<MarketingItem[]>([])
  const [itemsLoading, setItemsLoading] = useState(true)
  const [trainingOptions, setTrainingOptions] = useState<TrainingOption[]>([])
  const [priorRequest, setPriorRequest] = useState<PriorRequest | null>(null)
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [trainingType, setTrainingType] = useState('')
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<MarketingItem | null>(null)
  const [showAddTrainingModal, setShowAddTrainingModal] = useState(false)
  const [editTrainingTarget, setEditTrainingTarget] = useState<TrainingOption | null>(null)
  const [confirmDeleteTrainingId, setConfirmDeleteTrainingId] = useState<number | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<MarketingItem[]>('/marketing-items'),
      api.get<PriorRequest | null>('/retailer/status'),
      api.get<TrainingOption[]>('/training-options'),
    ])
      .then(([mi, status, opts]) => { setItems(mi); setPriorRequest(status); setTrainingOptions(opts) })
      .catch(console.error)
      .finally(() => setItemsLoading(false))
  }, [])

  function toggleItem(item: MarketingItem) {
    setSelectedItems(prev =>
      prev.find(i => i.id === item.id)
        ? prev.filter(i => i.id !== item.id)
        : [...prev, { id: item.id, name: item.name, variants: [] }]
    )
  }

  function toggleVariant(itemId: number, variant: string) {
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
    const parts = selectedItems.map(sel => {
      if (sel.variants.length > 0) return `${sel.name} (${sel.variants.join(', ')})`
      return sel.name
    })
    if (trainingType) parts.push(trainingType)
    return parts.join('; ')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

    if (selectedItems.length === 0 && !trainingType) {
      setError('Please select at least one item or service above before submitting.')
      return
    }
    // Validate: any selected item with variants must have at least one variant chosen
    const itemsWithVariants = items.filter(i => i.variants.length > 0)
    for (const mi of itemsWithVariants) {
      const sel = selectedItems.find(s => s.id === mi.id)
      if (sel && sel.variants.length === 0) {
        setError(`Please select at least one design for "${mi.name}".`)
        return
      }
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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function handleDeleteItem(id: number) {
    api.delete(`/marketing-items/${id}`)
      .then(() => {
        setItems(prev => prev.filter(i => i.id !== id))
        setSelectedItems(prev => prev.filter(s => s.id !== id))
      })
      .catch(console.error)
  }

  function handleDeleteTrainingOption(id: number) {
    api.delete(`/training-options/${id}`)
      .then(() => {
        setTrainingOptions(prev => prev.filter(o => o.id !== id))
        setConfirmDeleteTrainingId(null)
        const deleted = trainingOptions.find(o => o.id === id)
        if (deleted && trainingType === deleted.label) setTrainingType('')
      })
      .catch(console.error)
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
          {selectedItems.map(sel => (
            <div key={sel.id} className="flex items-start gap-3 py-2 border-b border-portal-border/50 last:border-0">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-on-canvas text-sm font-medium">{sel.name}</p>
                {sel.variants.length > 0 && (
                  <p className="text-on-canvas-muted text-xs mt-0.5">{sel.variants.join(', ')}</p>
                )}
              </div>
            </div>
          ))}
          {trainingType && (
            <div className="flex items-start gap-3 py-2 border-t border-portal-border/50">
              <Check className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-on-canvas text-sm font-medium">{trainingType}</p>
                <p className="text-on-canvas-muted text-xs mt-0.5">Hosted by Team Sliquid</p>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── Page ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Package className="w-5 h-5 text-portal-accent" />
            <h1 className="text-on-canvas text-2xl font-bold">Request Physical Marketing Assets</h1>
          </div>
          <p className="text-on-canvas-muted text-sm">
            Browse our in-store display items below. Select the ones you'd like for your physical location, then fill out your details and submit.
          </p>
        </div>
        {adminMode && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Item
          </button>
        )}
      </div>

      {/* Prior request status banner */}
      {priorRequest && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border text-sm
          ${priorRequest.status === 'approved'
            ? 'bg-emerald-500/10 border-emerald-500/30'
            : priorRequest.status === 'declined'
              ? 'bg-red-500/10 border-red-500/30'
              : 'bg-portal-accent/5 border-portal-accent/20'
          }`}>
          {priorRequest.status === 'approved'
            ? <ThumbsUp className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
            : priorRequest.status === 'declined'
              ? <ThumbsDown className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              : <Clock className="w-4 h-4 text-portal-accent flex-shrink-0 mt-0.5" />
          }
          <div>
            <p className={`font-medium
              ${priorRequest.status === 'approved' ? 'text-emerald-400' : priorRequest.status === 'declined' ? 'text-red-400' : 'text-on-canvas'}`}>
              {priorRequest.status === 'approved' ? 'Request Approved'
                : priorRequest.status === 'declined' ? 'Request Declined'
                : 'Request Pending Review'}
            </p>
            <p className="text-on-canvas-muted mt-0.5">
              {priorRequest.status === 'declined'
                ? 'Your previous request was not fulfilled. You can submit a new one below.'
                : `Your request for ${priorRequest.business_name} is ${priorRequest.status === 'approved' ? 'approved and being processed.' : 'being reviewed by the Sliquid team.'}`
              }
            </p>
            <p className="text-on-canvas-muted/60 text-xs mt-1">
              Requested: <span className="text-on-canvas-muted">{priorRequest.requested_items}</span>
            </p>
          </div>
        </div>
      )}

      {/* Catalog */}
      <div>
        <h2 className="text-on-canvas font-semibold text-base mb-1">Available Items</h2>
        <p className="text-on-canvas-muted text-sm mb-4">Click <span className="font-medium text-on-canvas-subtle">Select</span> on any item to add it to your request.</p>

        {itemsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-portal-accent animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {items.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                selected={selectedItems.find(s => s.id === item.id)}
                onToggle={() => toggleItem(item)}
                onToggleVariant={v => toggleVariant(item.id, v)}
                adminMode={adminMode}
                onEdit={() => setEditTarget(item)}
                onDelete={() => handleDeleteItem(item.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Training */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-on-canvas font-semibold text-base">Training Request</h2>
          {adminMode && (
            <button
              onClick={() => setShowAddTrainingModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Option
            </button>
          )}
        </div>
        <p className="text-on-canvas-muted text-sm mb-4">Request a training session with a Sliquid brand representative. Choose the format that works best for your team.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {trainingOptions.map(opt => {
            const active = trainingType === opt.label
            const Icon = ICON_MAP[opt.icon_name] ?? Users
            const isPendingDelete = confirmDeleteTrainingId === opt.id
            return (
              <div
                key={opt.id}
                className={`bg-surface border rounded-xl overflow-hidden transition-all duration-150 flex flex-col
                  ${active ? 'border-portal-accent shadow-[0_0_0_1px] shadow-portal-accent/30' : 'border-portal-border'}`}
              >
                <div className="flex items-start gap-4 p-5 flex-1">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors
                    ${active ? 'bg-portal-accent/20' : 'bg-portal-bg'}`}>
                    <Icon className={`w-5 h-5 transition-colors ${active ? 'text-portal-accent' : 'text-on-canvas-muted/50'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3 className="text-on-canvas font-semibold text-sm">{opt.label}</h3>
                        {opt.subtitle && <p className="text-portal-accent text-xs font-medium mt-0.5">{opt.subtitle}</p>}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {adminMode && !isPendingDelete && (
                          <>
                            <button onClick={() => setEditTrainingTarget(opt)} className="w-6 h-6 rounded-md bg-surface-elevated border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors">
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button onClick={() => setConfirmDeleteTrainingId(opt.id)} className="w-6 h-6 rounded-md bg-surface-elevated border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                        {adminMode && isPendingDelete && (
                          <>
                            <button onClick={() => handleDeleteTrainingOption(opt.id)} className="px-2 h-6 rounded-md bg-red-500/80 text-white text-xs font-medium">Delete</button>
                            <button onClick={() => setConfirmDeleteTrainingId(null)} className="w-6 h-6 rounded-md bg-surface-elevated border border-portal-border flex items-center justify-center text-on-canvas-subtle hover:text-on-canvas transition-colors"><X className="w-3 h-3" /></button>
                          </>
                        )}
                        {!isPendingDelete && (
                          <button
                            type="button"
                            onClick={() => setTrainingType(active ? '' : opt.label)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors
                              ${active
                                ? 'bg-portal-accent text-white hover:bg-portal-accent/80'
                                : 'bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
                              }`}
                          >
                            {active ? '✓ Selected' : 'Select'}
                          </button>
                        )}
                      </div>
                    </div>
                    {opt.description && <p className="text-on-canvas-muted text-xs mt-2 leading-relaxed">{opt.description}</p>}
                    {opt.specs.length > 0 && (
                      <ul className="mt-3 space-y-1">
                        {opt.specs.map(s => (
                          <li key={s} className="flex items-center gap-2 text-xs text-on-canvas-subtle">
                            <span className="w-1 h-1 rounded-full bg-portal-accent flex-shrink-0" />
                            {s}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 px-5 py-3 bg-portal-bg border-t border-portal-border/60">
                  <AlertCircle className="w-3.5 h-3.5 text-on-canvas-muted/60 flex-shrink-0 mt-0.5" />
                  <p className="text-on-canvas-muted/60 text-xs leading-relaxed">
                    Availability is not guaranteed, as our sales team's schedule is subject to change. We will reach out to confirm availability after your request is received.
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Request Form */}
      <div className="bg-surface border border-portal-border rounded-xl p-6">
        <h2 className="text-on-canvas font-semibold text-lg mb-1">Your Information</h2>
        <p className="text-on-canvas-muted text-sm mb-5">Tell us where to send the materials.</p>

        {/* Selected items summary */}
        {(selectedItems.length > 0 || trainingType) && (
          <div className="mb-5 p-4 bg-portal-accent/5 border border-portal-accent/20 rounded-lg">
            <p className="text-on-canvas text-xs font-semibold uppercase tracking-wider mb-2">
              Selected ({selectedItems.length + (trainingType ? 1 : 0)})
            </p>
            <div className="flex flex-wrap gap-2">
              {selectedItems.map(sel => (
                <span key={sel.id} className="flex items-center gap-1 px-2.5 py-1 bg-portal-accent/15 text-portal-accent rounded-full text-xs font-medium">
                  <Check className="w-3 h-3" />
                  {sel.name}
                  {sel.variants.length > 0 && ` (${sel.variants.length})`}
                </span>
              ))}
              {trainingType && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-portal-accent/15 text-portal-accent rounded-full text-xs font-medium">
                  <Check className="w-3 h-3" />
                  {trainingType}
                </span>
              )}
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

      {showAddModal && (
        <AddItemModal
          onClose={() => setShowAddModal(false)}
          onAdded={item => setItems(prev => [...prev, item])}
        />
      )}
      {editTarget && (
        <EditItemModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => {
            setItems(prev => prev.map(i => i.id === updated.id ? updated : i))
            setEditTarget(null)
          }}
        />
      )}
      {showAddTrainingModal && (
        <TrainingOptionForm
          onClose={() => setShowAddTrainingModal(false)}
          onSaved={opt => { setTrainingOptions(prev => [...prev, opt]); setShowAddTrainingModal(false) }}
        />
      )}
      {editTrainingTarget && (
        <TrainingOptionForm
          initial={editTrainingTarget}
          onClose={() => setEditTrainingTarget(null)}
          onSaved={updated => {
            setTrainingOptions(prev => prev.map(o => o.id === updated.id ? updated : o))
            setEditTrainingTarget(null)
          }}
        />
      )}
    </div>
  )
}
