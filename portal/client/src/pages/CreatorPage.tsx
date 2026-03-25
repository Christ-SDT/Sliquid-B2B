import { useState, useRef, useEffect, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { AiImage } from '@/types'
import { Sparkles, Send, Download, Trash2, Loader2, Bot, AlertCircle } from 'lucide-react'

// ─── Chat message types ───────────────────────────────────────────────────────

type ChatMsg =
  | { key: string; role: 'user'; text: string }
  | { key: string; role: 'lampy-loading' }
  | { key: string; role: 'lampy-image'; image: AiImage }
  | { key: string; role: 'lampy-error'; text: string }

// ─── Message bubbles ──────────────────────────────────────────────────────────

function LampyAvatar() {
  return (
    <div className="w-8 h-8 rounded-full bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center flex-shrink-0 mt-1">
      <Bot className="w-4 h-4 text-portal-accent" />
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreatorPage() {
  const { user } = useAuth()
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [prompt, setPrompt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load this user's past AI images as chat history on mount
  useEffect(() => {
    api.get<AiImage[]>('/creator/images')
      .then(images => {
        const mine = images.filter(img => img.user_id === user?.id).reverse()
        const msgs: ChatMsg[] = mine.flatMap(img => [
          { key: `user-hist-${img.id}`, role: 'user' as const, text: img.prompt },
          { key: `lampy-hist-${img.id}`, role: 'lampy-image' as const, image: img },
        ])
        setMessages(msgs)
      })
      .catch(() => {})
  }, [user?.id])

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || submitting) return

    const userText = prompt.trim()
    setPrompt('')
    setSubmitting(true)

    const ts = Date.now()
    const userKey = `user-${ts}`
    const lampyKey = `lampy-${ts}`

    setMessages(prev => [
      ...prev,
      { key: userKey, role: 'user', text: userText },
      { key: lampyKey, role: 'lampy-loading' },
    ])

    try {
      const result = await api.post<AiImage>('/creator/generate', { prompt: userText })
      setMessages(prev => prev.map(m =>
        m.key === lampyKey ? { key: lampyKey, role: 'lampy-image', image: result } : m
      ))
    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.key === lampyKey
          ? { key: lampyKey, role: 'lampy-error', text: err.message ?? 'Failed to generate image' }
          : m
      ))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(imageId: number) {
    if (!confirm('Delete this image? It will also be removed from the Asset Library.')) return
    try {
      await api.delete(`/creator/${imageId}`)
      setMessages(prev => prev.filter(m => {
        if (m.role === 'lampy-image' && m.image.id === imageId) return false
        // also remove the preceding user prompt for this image from history pairs
        return true
      }))
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete image')
    }
  }

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 8rem)' }}>

      {/* Header */}
      <div className="flex items-center gap-3 mb-5 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-portal-accent/20 border border-portal-accent/30 flex items-center justify-center">
          <Sparkles className="w-5 h-5 text-portal-accent" />
        </div>
        <div>
          <h1 className="text-on-canvas text-xl font-bold">Lampy</h1>
          <p className="text-on-canvas-muted text-sm">Sliquid AI Image Creator</p>
        </div>
      </div>

      {/* Chat scroll area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">

        {/* Welcome (shown when no history) */}
        {messages.length === 0 && (
          <div className="flex gap-3">
            <LampyAvatar />
            <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
              <p className="text-on-canvas text-sm">
                Hi! I'm <span className="font-semibold text-portal-accent">Lampy</span>, Sliquid's AI image creator.
                Describe the product image you'd like — bottle, background, mood — and I'll generate it for you.
                Your creations are saved to the Asset Library for everyone to use.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => {
          if (msg.role === 'user') {
            return (
              <div key={msg.key} className="flex justify-end">
                <div className="bg-portal-accent text-white rounded-2xl rounded-tr-none px-4 py-3 max-w-xs text-sm leading-relaxed">
                  {msg.text}
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-loading') {
            return (
              <div key={msg.key} className="flex gap-3">
                <LampyAvatar />
                <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-portal-accent animate-spin" />
                  <span className="text-on-canvas-muted text-sm">Creating your image…</span>
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-error') {
            return (
              <div key={msg.key} className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 mt-1">
                  <AlertCircle className="w-4 h-4 text-red-400" />
                </div>
                <div className="bg-surface border border-red-500/20 rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
                  <p className="text-red-400 text-sm">{msg.text}</p>
                </div>
              </div>
            )
          }

          if (msg.role === 'lampy-image') {
            const img = msg.image
            return (
              <div key={msg.key} className="flex gap-3">
                <LampyAvatar />
                <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none overflow-hidden max-w-sm">
                  <img
                    src={img.s3_url}
                    alt={img.prompt}
                    className="w-full aspect-square object-cover"
                    loading="lazy"
                  />
                  <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-t border-portal-border">
                    <a
                      href={img.s3_url}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-portal-accent hover:text-portal-accent/80 text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </a>
                    {img.user_id === user?.id && (
                      <button
                        onClick={() => handleDelete(img.id)}
                        className="flex items-center gap-1.5 text-on-canvas-muted hover:text-red-400 text-sm transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSubmit}
        className="flex gap-3 pt-3 border-t border-portal-border flex-shrink-0"
      >
        <input
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          disabled={submitting}
          placeholder="Describe the product image you want Lampy to create…"
          className="flex-1 bg-surface border border-portal-border rounded-xl px-4 py-3 text-on-canvas text-sm
                     placeholder:text-on-canvas-muted focus:outline-none focus:border-portal-accent
                     disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={!prompt.trim() || submitting}
          className="flex items-center gap-2 px-5 py-3 bg-portal-accent hover:bg-portal-accent/90
                     disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {submitting
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </form>
    </div>
  )
}
