import { useState, useRef, useEffect, useCallback, FormEvent } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { AiImage } from '@/types'
import { Sparkles, Send, Download, Trash2, Loader2, Bot, AlertCircle, ImagePlus, X } from 'lucide-react'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function triggerDownload(url: string, name: string) {
  const ext = url.split('?')[0].split('.').pop() ?? ''
  const filename = ext ? `${name}.${ext}` : name
  fetch(url)
    .then(r => r.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    })
    .catch(() => window.open(url, '_blank'))
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface RefImage {
  data: string       // base64, no prefix
  mimeType: string
  preview: string    // object URL for display
}

type ChatMsg =
  | { key: string; role: 'user'; text: string; refPreview?: string }
  | { key: string; role: 'lampy-loading' }
  | { key: string; role: 'lampy-image'; image: AiImage }
  | { key: string; role: 'lampy-error'; text: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readFileAsBase64(file: File): Promise<{ data: string; mimeType: string; preview: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // result is "data:image/png;base64,XXXXXX" — strip the prefix
      const [prefix, data] = result.split(',')
      const mimeType = prefix.replace('data:', '').replace(';base64', '')
      resolve({ data, mimeType, preview: result })
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function isImageFile(file: File) {
  return file.type.startsWith('image/')
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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
  const [refImage, setRefImage] = useState<RefImage | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  // Load past AI images as chat history on mount
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

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Revoke object URL when refImage changes to avoid memory leaks
  useEffect(() => {
    return () => {
      if (refImage?.preview.startsWith('blob:')) URL.revokeObjectURL(refImage.preview)
    }
  }, [refImage])

  // ── File handling ──────────────────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    if (!isImageFile(file)) return
    try {
      const ref = await readFileAsBase64(file)
      setRefImage(ref)
    } catch {
      // silently ignore bad files
    }
  }, [])

  function clearRefImage() {
    setRefImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current++
    if (e.dataTransfer.types.includes('Files')) setDragOver(true)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current--
    if (dragCounter.current === 0) setDragOver(false)
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    dragCounter.current = 0
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!prompt.trim() || submitting) return

    const userText = prompt.trim()
    const capturedRef = refImage
    setPrompt('')
    setRefImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setSubmitting(true)

    const ts = Date.now()
    const userKey = `user-${ts}`
    const lampyKey = `lampy-${ts}`

    setMessages(prev => [
      ...prev,
      { key: userKey, role: 'user', text: userText, refPreview: capturedRef?.preview },
      { key: lampyKey, role: 'lampy-loading' },
    ])

    try {
      const body: Record<string, unknown> = { prompt: userText }
      if (capturedRef) {
        body.referenceImage = { data: capturedRef.data, mimeType: capturedRef.mimeType }
      }
      const result = await api.post<AiImage>('/creator/generate', body)
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
      setMessages(prev => prev.filter(m => !(m.role === 'lampy-image' && m.image.id === imageId)))
    } catch (err: any) {
      alert(err.message ?? 'Failed to delete image')
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

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

      {/* Chat scroll area — also the drag-and-drop target */}
      <div
        className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0 relative"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        {/* Drag overlay */}
        {dragOver && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3
                          bg-portal-bg/90 border-2 border-dashed border-portal-accent rounded-2xl pointer-events-none">
            <ImagePlus className="w-10 h-10 text-portal-accent" />
            <p className="text-portal-accent font-semibold text-sm">Drop image as reference</p>
          </div>
        )}

        {/* Welcome message */}
        {messages.length === 0 && (
          <div className="flex gap-3">
            <LampyAvatar />
            <div className="bg-surface border border-portal-border rounded-2xl rounded-tl-none px-4 py-3 max-w-sm">
              <p className="text-on-canvas text-sm">
                Hi! I'm <span className="font-semibold text-portal-accent">Lampy</span>, Sliquid's AI image creator.
                Describe the product image you'd like and I'll generate it.
                You can also <span className="text-portal-accent font-medium">attach a reference image</span> or drag one onto this window to guide the style.
                Your creations are saved to the Asset Library.
              </p>
            </div>
          </div>
        )}

        {messages.map(msg => {

          if (msg.role === 'user') {
            return (
              <div key={msg.key} className="flex justify-end">
                <div className="flex flex-col items-end gap-1.5 max-w-xs">
                  {/* Reference image thumbnail in user bubble */}
                  {msg.refPreview && (
                    <div className="relative">
                      <img
                        src={msg.refPreview}
                        alt="Reference"
                        className="w-32 h-32 rounded-xl object-cover border border-portal-accent/30"
                      />
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
                        reference
                      </span>
                    </div>
                  )}
                  <div className="bg-portal-accent text-white rounded-2xl rounded-tr-none px-4 py-3 text-sm leading-relaxed">
                    {msg.text}
                  </div>
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
                    <button
                      onClick={() => triggerDownload(img.s3_url, `sliquid-ai-${img.id}`)}
                      className="flex items-center gap-1.5 text-portal-accent hover:text-portal-accent/80 text-sm font-medium transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      Download
                    </button>
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

      {/* Input area */}
      <div className="pt-3 border-t border-portal-border flex-shrink-0 space-y-2">

        {/* Reference image preview strip — shown when an image is attached */}
        {refImage && (
          <div className="flex items-center gap-2 px-1">
            <div className="relative flex-shrink-0">
              <img
                src={refImage.preview}
                alt="Reference"
                className="w-14 h-14 rounded-lg object-cover border border-portal-accent/40"
              />
              <button
                type="button"
                onClick={clearRefImage}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-surface border border-portal-border
                           flex items-center justify-center text-on-canvas-muted hover:text-red-400 hover:border-red-400 transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <p className="text-on-canvas-muted text-xs">
              Reference image attached — Lampy will use this as a visual guide
            </p>
          </div>
        )}

        {/* Input bar */}
        <form onSubmit={handleSubmit} className="flex gap-2">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
          />

          {/* Image attach button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Attach a reference image"
            className={`flex-shrink-0 w-11 h-11 flex items-center justify-center rounded-xl border transition-colors
              ${refImage
                ? 'border-portal-accent bg-portal-accent/10 text-portal-accent'
                : 'border-portal-border bg-surface text-on-canvas-muted hover:border-portal-accent hover:text-portal-accent'
              }`}
          >
            <ImagePlus className="w-5 h-5" />
          </button>

          {/* Text input */}
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

          {/* Send button */}
          <button
            type="submit"
            disabled={!prompt.trim() || submitting}
            className="flex items-center gap-2 px-5 py-3 bg-portal-accent hover:bg-portal-accent/90
                       disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors flex-shrink-0"
          >
            {submitting
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />
            }
          </button>
        </form>
      </div>
    </div>
  )
}
