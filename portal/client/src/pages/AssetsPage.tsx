import { useEffect, useState, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/types'
import { Asset, Creative } from '@/types'
import {
  Search, FolderOpen, Download, Copy, Check,
  FileImage, FileText, Share2, Image, Video, Mail, Printer, Megaphone, BookOpen,
  Plus, Trash2, X, Loader2, Pencil,
} from 'lucide-react'

const BRANDS = ['All', 'Sliquid', 'RIDE', 'Ride Rocco']
const BRAND_OPTIONS = ['Sliquid', 'RIDE', 'Ride Rocco', 'Sliquid Science']

// ─── Unified library item ─────────────────────────────────────────────────────

type LibraryItem =
  | (Asset & { _source: 'asset'; displayName: string })
  | (Creative & { _source: 'creative'; displayName: string })

// Tab definitions
const TABS = [
  { key: 'sheets',   label: 'Info Sheets' },
  { key: 'assets',   label: 'Digital Assets' },
  { key: 'campaign', label: 'Campaign Materials' },
  { key: 'video',    label: 'Video Assets' },
] as const
type TabKey = typeof TABS[number]['key']

// Which types appear in each tab
const TAB_FILTER: Record<TabKey, { source: 'asset' | 'creative' | 'both'; types?: string[] }> = {
  sheets:   { source: 'both',     types: ['Document', 'Print'] },
  assets:   { source: 'asset',    types: ['Logo', 'Banner', 'Social'] },
  campaign: { source: 'creative', types: ['Banner', 'Social Media', 'Email', 'Multi'] },
  video:    { source: 'creative', types: ['Video'] },
}

// Type options available when adding an item, per tab
interface TypeOption { label: string; value: string; source: 'asset' | 'creative' }
const TAB_TYPE_OPTIONS: Record<TabKey, TypeOption[]> = {
  sheets: [
    { label: 'Info Sheet',      value: 'Document', source: 'asset'    },
    { label: 'Print Material',  value: 'Print',    source: 'creative' },
  ],
  assets: [
    { label: 'Logo',                   value: 'Logo',   source: 'asset' },
    { label: 'Banner',                 value: 'Banner', source: 'asset' },
    { label: 'Social Media Graphic',   value: 'Social', source: 'asset' },
  ],
  campaign: [
    { label: 'Banner',       value: 'Banner',       source: 'creative' },
    { label: 'Social Media', value: 'Social Media', source: 'creative' },
    { label: 'Email',        value: 'Email',        source: 'creative' },
    { label: 'Multi-Use',    value: 'Multi',        source: 'creative' },
  ],
  video: [
    { label: 'Video', value: 'Video', source: 'creative' },
  ],
}

const TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Logo:           Image,
  Banner:         FileImage,
  Social:         Share2,
  Document:       FileText,
  'Social Media': Megaphone,
  Email:          Mail,
  Print:          Printer,
  Multi:          Megaphone,
  Video:          Video,
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────

interface AddItemModalProps {
  activeTab: TabKey
  onClose: () => void
  onAdded: (item: LibraryItem) => void
}

function AddItemModal({ activeTab, onClose, onAdded }: AddItemModalProps) {
  const typeOptions = TAB_TYPE_OPTIONS[activeTab]
  const [typeOpt, setTypeOpt] = useState<TypeOption>(typeOptions[0])
  const [nameTitle, setNameTitle] = useState('')
  const [brand, setBrand] = useState('')
  const [fileUrl, setFileUrl] = useState('')
  const [thumbnailUrl, setThumbnailUrl] = useState('')
  const [fileSize, setFileSize] = useState('')
  const [dimensions, setDimensions] = useState('')
  const [description, setDescription] = useState('')
  const [campaign, setCampaign] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isCreative = typeOpt.source === 'creative'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (typeOpt.source === 'asset') {
        const result = await api.post<{ id: number }>('/assets', {
          name: nameTitle, brand, type: typeOpt.value,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
        })
        onAdded({
          id: result.id, name: nameTitle, brand, type: typeOpt.value,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          _source: 'asset', displayName: nameTitle,
        })
      } else {
        const result = await api.post<{ id: number }>('/creatives', {
          title: nameTitle, brand, type: typeOpt.value,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          description: description || null,
          campaign: campaign || null,
        })
        onAdded({
          id: result.id, title: nameTitle, brand, type: typeOpt.value,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          description: description || null,
          campaign: campaign || null,
          _source: 'creative', displayName: nameTitle,
        })
      }
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to add item')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">Add to Product Library</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Item Type */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Item Type</label>
            <select
              value={typeOpt.value}
              onChange={e => setTypeOpt(typeOptions.find(t => t.value === e.target.value)!)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
            >
              {typeOptions.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* Name / Title */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              {isCreative ? 'Title' : 'Name'}
            </label>
            <input
              type="text"
              value={nameTitle}
              onChange={e => setNameTitle(e.target.value)}
              placeholder={isCreative ? 'e.g. Summer Campaign Banner' : 'e.g. H2O 4oz Info Sheet'}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Brand</label>
            <input
              type="text"
              list="brand-options"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              placeholder="e.g. Sliquid"
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
            <datalist id="brand-options">
              {BRAND_OPTIONS.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>

          {/* File URL */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">File URL</label>
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-content/uploads/file.pdf"
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Thumbnail URL */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              Thumbnail URL <span className="text-on-canvas-muted font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
              placeholder="https://yoursite.com/wp-content/uploads/thumb.jpg"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Description — creatives only */}
          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Description <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Brief description of this asset…"
                rows={2}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
              />
            </div>
          )}

          {/* Campaign — campaign tab only */}
          {activeTab === 'campaign' && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Campaign <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
                placeholder="e.g. Summer 2025"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          )}

          {/* File size + dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                File Size <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={fileSize}
                onChange={e => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Dimensions <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={dimensions}
                onChange={e => setDimensions(e.target.value)}
                placeholder="e.g. 1920×1080"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-elevated border border-portal-border text-on-canvas-subtle
                         hover:text-on-canvas rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-portal-accent
                         hover:bg-portal-accent/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Adding…' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// All type options for editing (source is fixed on existing items)
const ALL_ASSET_TYPES = ['Logo', 'Banner', 'Social', 'Document']
const ALL_CREATIVE_TYPES = ['Print', 'Banner', 'Social Media', 'Email', 'Multi', 'Video']

// ─── Edit Item Modal ──────────────────────────────────────────────────────────

interface EditItemModalProps {
  item: LibraryItem
  onClose: () => void
  onSaved: (updated: LibraryItem) => void
}

function EditItemModal({ item, onClose, onSaved }: EditItemModalProps) {
  const isCreative = item._source === 'creative'
  const typeList = isCreative ? ALL_CREATIVE_TYPES : ALL_ASSET_TYPES

  const [nameTitle, setNameTitle] = useState(item.displayName)
  const [brand, setBrand] = useState(item.brand)
  const [type, setType] = useState(item.type)
  const [fileUrl, setFileUrl] = useState(item.file_url)
  const [thumbnailUrl, setThumbnailUrl] = useState(item.thumbnail_url ?? '')
  const [fileSize, setFileSize] = useState(item.file_size ?? '')
  const [dimensions, setDimensions] = useState(item.dimensions ?? '')
  const [description, setDescription] = useState(
    'description' in item ? (item.description ?? '') : ''
  )
  const [campaign, setCampaign] = useState(
    'campaign' in item ? (item.campaign ?? '') : ''
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (item._source === 'asset') {
        const updated = await api.put<Asset>(`/assets/${item.id}`, {
          name: nameTitle, brand, type,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
        })
        onSaved({ ...updated, _source: 'asset', displayName: updated.name })
      } else {
        const updated = await api.put<Creative>(`/creatives/${item.id}`, {
          title: nameTitle, brand, type,
          file_url: fileUrl,
          thumbnail_url: thumbnailUrl || null,
          file_size: fileSize || null,
          dimensions: dimensions || null,
          description: description || null,
          campaign: campaign || null,
        })
        onSaved({ ...updated, _source: 'creative', displayName: updated.title })
      }
      onClose()
    } catch (err: any) {
      setError(err.message ?? 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-surface border border-portal-border rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-portal-border sticky top-0 bg-surface z-10">
          <h2 className="text-on-canvas font-semibold">Edit Item</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
          )}

          {/* Type */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Item Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm focus:outline-none focus:border-portal-accent transition-colors"
            >
              {typeList.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Name / Title */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              {isCreative ? 'Title' : 'Name'}
            </label>
            <input
              type="text"
              value={nameTitle}
              onChange={e => setNameTitle(e.target.value)}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Brand */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Brand</label>
            <input
              type="text"
              list="brand-options-edit"
              value={brand}
              onChange={e => setBrand(e.target.value)}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
            <datalist id="brand-options-edit">
              {BRAND_OPTIONS.map(b => <option key={b} value={b} />)}
            </datalist>
          </div>

          {/* File URL */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">File URL</label>
            <input
              type="url"
              value={fileUrl}
              onChange={e => setFileUrl(e.target.value)}
              required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Thumbnail URL */}
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
              Thumbnail URL <span className="text-on-canvas-muted font-normal">(optional)</span>
            </label>
            <input
              type="url"
              value={thumbnailUrl}
              onChange={e => setThumbnailUrl(e.target.value)}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                         placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
            />
          </div>

          {/* Description — creatives only */}
          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Description <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={2}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors resize-none"
              />
            </div>
          )}

          {/* Campaign — creatives only */}
          {isCreative && (
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Campaign <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          )}

          {/* File size + dimensions */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                File Size <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={fileSize}
                onChange={e => setFileSize(e.target.value)}
                placeholder="e.g. 2.4 MB"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">
                Dimensions <span className="text-on-canvas-muted font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={dimensions}
                onChange={e => setDimensions(e.target.value)}
                placeholder="e.g. 1920×1080"
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-4 py-2.5 text-on-canvas text-sm
                           placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-surface-elevated border border-portal-border text-on-canvas-subtle
                         hover:text-on-canvas rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-portal-accent
                         hover:bg-portal-accent/90 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── LibraryCard ─────────────────────────────────────────────────────────────

function LibraryCard({ item, onDelete, onEdit }: { item: LibraryItem; onDelete?: () => void; onEdit?: () => void }) {
  const [copied, setCopied] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const Icon = TYPE_ICONS[item.type] ?? FolderOpen
  const isAsset = item._source === 'asset'

  async function copyUrl() {
    await navigator.clipboard.writeText(item.file_url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group">
      <div className="aspect-video bg-portal-bg flex items-center justify-center relative overflow-hidden">
        {item.thumbnail_url
          ? <img src={item.thumbnail_url} alt={item.displayName} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
          : <Icon className="w-12 h-12 text-on-canvas" />
        }
        <div className="absolute top-2 right-2">
          <span className="px-2 py-1 bg-portal-border/90 rounded text-[10px] text-on-canvas font-medium">{item.type}</span>
        </div>

        {/* Admin delete control */}
        {onDelete && (
          <div className="absolute top-2 left-2">
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onDelete}
                  className="px-2 py-1 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white font-medium transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="px-2 py-1 bg-black/70 hover:bg-black/90 rounded text-[10px] text-white font-medium transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="p-1.5 bg-portal-border/90 hover:bg-red-500/80 rounded text-on-canvas hover:text-white transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <div className="p-4">
        <span className="text-[10px] font-semibold text-portal-accent uppercase tracking-wider">{item.brand}</span>
        <h3 className="text-on-canvas text-sm font-medium mt-0.5 line-clamp-2">{item.displayName}</h3>
        {'description' in item && item.description && (
          <p className="text-on-canvas-muted text-xs mt-1 line-clamp-2">{item.description}</p>
        )}
        <div className="flex items-center gap-2 mt-1">
          {item.dimensions && <span className="text-on-canvas-muted text-xs">{item.dimensions}</span>}
          {item.dimensions && item.file_size && <span className="text-on-canvas-muted text-xs">·</span>}
          {item.file_size && <span className="text-on-canvas-muted text-xs">{item.file_size}</span>}
        </div>
        <div className="flex gap-2 mt-3">
          <a
            href={item.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                       text-portal-accent rounded-lg text-xs font-medium transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Download
          </a>
          {isAsset && (
            <button
              onClick={copyUrl}
              title="Copy URL"
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-surface-elevated border border-portal-border hover:bg-portal-border
                         text-on-canvas rounded-lg text-xs font-medium transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
          {onEdit && (
            <button
              onClick={onEdit}
              title="Edit"
              className="flex items-center justify-center px-3 py-2 bg-surface-elevated border border-portal-border hover:bg-portal-border
                         text-on-canvas rounded-lg text-xs font-medium transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AssetsPage() {
  const { user } = useAuth()
  const adminUser = isAdmin(user?.role ?? '')
  const [allItems, setAllItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('sheets')
  const [brand, setBrand] = useState('All')
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingItem, setEditingItem] = useState<LibraryItem | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<Asset[]>('/assets'),
      api.get<Creative[]>('/creatives'),
    ])
      .then(([assets, creatives]) => {
        const assetItems: LibraryItem[] = assets.map(a => ({
          ...a, _source: 'asset' as const, displayName: a.name,
        }))
        const creativeItems: LibraryItem[] = creatives.map(c => ({
          ...c, _source: 'creative' as const, displayName: c.title,
        }))
        setAllItems([...assetItems, ...creativeItems])
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function handleAdded(item: LibraryItem) {
    setAllItems(prev => [item, ...prev])
  }

  function handleSaved(updated: LibraryItem) {
    setAllItems(prev => prev.map(i =>
      i._source === updated._source && i.id === updated.id ? updated : i
    ))
  }

  async function handleDelete(item: LibraryItem) {
    const endpoint = item._source === 'asset' ? `/assets/${item.id}` : `/creatives/${item.id}`
    try {
      await api.delete(endpoint)
      setAllItems(prev => prev.filter(i => !(i._source === item._source && i.id === item.id)))
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete item')
    }
  }

  const tabFilter = TAB_FILTER[activeTab]
  const filtered = allItems.filter(item => {
    if (tabFilter.source === 'asset' && item._source !== 'asset') return false
    if (tabFilter.source === 'creative' && item._source !== 'creative') return false
    if (tabFilter.types && !tabFilter.types.includes(item.type)) return false
    if (brand !== 'All' && item.brand !== brand) return false
    if (search) {
      const q = search.toLowerCase()
      if (!item.displayName.toLowerCase().includes(q) && !item.brand.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BookOpen className="w-6 h-6 text-portal-accent" />
          <h1 className="text-on-canvas text-2xl font-bold">Product Library</h1>
        </div>
        <div className="flex items-center gap-3">
          {adminUser && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                         text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Item
            </button>
          )}
          <span className="text-on-canvas-muted text-sm">{filtered.length} items</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors
              ${activeTab === tab.key
                ? 'bg-portal-accent text-white'
                : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas hover:border-slate-500'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + brand filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-canvas-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search library…"
            className="w-full bg-surface border border-portal-border rounded-lg pl-9 pr-4 py-2.5 text-on-canvas text-sm
                       placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent transition-colors"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {BRANDS.map(b => (
            <button
              key={b}
              onClick={() => setBrand(b)}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors
                ${brand === b
                  ? 'bg-portal-accent text-white'
                  : 'bg-surface border border-portal-border text-on-canvas-subtle hover:text-on-canvas'
                }`}
            >
              {b}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-64 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <FolderOpen className="w-12 h-12 mb-3 opacity-40" />
          <p>No items found in this section</p>
          {adminUser && (
            <button
              onClick={() => setShowAddModal(true)}
              className="mt-4 flex items-center gap-2 px-4 py-2 bg-portal-accent/10 hover:bg-portal-accent/20
                         text-portal-accent rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add the first item
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map(item => (
            <LibraryCard
              key={`${item._source}-${item.id}`}
              item={item}
              onDelete={adminUser ? () => handleDelete(item) : undefined}
              onEdit={adminUser ? () => setEditingItem(item) : undefined}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddItemModal
          activeTab={activeTab}
          onClose={() => setShowAddModal(false)}
          onAdded={handleAdded}
        />
      )}

      {editingItem && (
        <EditItemModal
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={updated => { handleSaved(updated); setEditingItem(null) }}
        />
      )}
    </div>
  )
}
