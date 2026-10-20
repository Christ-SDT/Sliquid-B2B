import { useEffect, useState } from 'react'
import { api } from '@/api/client'
import { CheckCircle, XCircle, Loader2, Cpu } from 'lucide-react'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const AI_MODELS = [
  {
    id: 'imagen-4.0-generate-001',
    label: 'Imagen 4',
    description: 'Current generation · Best quality · ~$0.04/image · Recommended',
  },
  {
    id: 'gemini-2.5-flash-image',
    label: 'Gemini 2.5 Flash — Nano Banana',
    description: 'Text & image-to-image · Conversational editing · May be geo-restricted on Railway',
  },
  {
    id: 'gemini-3.1-flash-image-preview',
    label: 'Gemini 3.1 Flash',
    description: 'Google Search grounded · 2K resolution · May be geo-restricted on Railway',
  },
]

export default function AiModelPanel({ canEdit }: { canEdit: boolean }) {
  const [activeModel, setActiveModel] = useState('imagen-4.0-generate-001')
  const [selected, setSelected] = useState('imagen-4.0-generate-001')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')

  useEffect(() => {
    api.get<{ model: string }>('/creator/settings')
      .then(r => { setActiveModel(r.model); setSelected(r.model) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    setSaveState('saving')
    try {
      await api.post('/creator/settings', { model: selected })
      setActiveModel(selected)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2500)
    } catch {
      setSaveState('error')
    }
  }

  const isDirty = selected !== activeModel

  return (
    <div className="bg-surface border border-portal-border rounded-xl p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Cpu className="w-5 h-5 text-portal-accent flex-shrink-0" aria-hidden="true" />
        <div>
          <h3 className="text-on-canvas font-bold text-lg">AI Image Model</h3>
          <p className="text-on-canvas-subtle text-sm mt-0.5">Select which model powers the AI Creator</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-on-canvas-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : (
        <div className="space-y-3">
          {AI_MODELS.map(m => (
            <button
              key={m.id}
              type="button"
              disabled={!canEdit}
              onClick={() => setSelected(m.id)}
              aria-pressed={selected === m.id}
              className={`w-full text-left px-4 py-3.5 rounded-xl border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent ${!canEdit ? 'cursor-default' : ''} ${
                selected === m.id
                  ? 'border-portal-accent bg-portal-accent/10'
                  : 'border-portal-border hover:border-slate-500 bg-portal-bg'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className={`text-sm font-semibold ${selected === m.id ? 'text-portal-accent' : 'text-on-canvas'}`}>
                    {m.label}
                  </p>
                  <p className="text-on-canvas-subtle text-xs mt-0.5">{m.description}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {activeModel === m.id && (
                    <span className="text-xs bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-medium">
                      Active
                    </span>
                  )}
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selected === m.id ? 'border-portal-accent' : 'border-portal-border'
                  }`}>
                    {selected === m.id && <div className="w-2 h-2 rounded-full bg-portal-accent" />}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={!isDirty || saveState === 'saving'}
            className="flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90
                       disabled:opacity-40 text-white dark:text-slate-950 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-portal-accent"
          >
            {saveState === 'saving' && <Loader2 className="w-4 h-4 animate-spin" />}
            {saveState === 'saving' ? 'Saving…' : 'Apply Model'}
          </button>
          {saveState === 'saved' && (
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 text-sm font-medium">
              <CheckCircle className="w-4 h-4" /> Saved
            </span>
          )}
          {saveState === 'error' && (
            <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400 text-sm">
              <XCircle className="w-4 h-4" /> Failed to save
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// ─── WooCommerce Panel ────────────────────────────────────────────────────────
