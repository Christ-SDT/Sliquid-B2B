import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Megaphone, Pin, ArrowRight, ExternalLink } from 'lucide-react'
import { api } from '@/api/client'
import type { Announcement } from '@/types'
import { formatDate } from '@/lib/utils'

function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function AnnouncementCard({ a }: { a: Announcement }) {
  const excerpt = stripHtml(a.excerpt)

  return (
    <Link
      to={`/announcements/${a.slug}`}
      className="group bg-surface border border-portal-border rounded-xl overflow-hidden
                 hover:border-portal-accent/60 transition-colors flex flex-col"
    >
      {a.image_url && (
        <div className="aspect-[16/9] bg-surface-elevated overflow-hidden">
          <img
            src={a.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-5 flex flex-col flex-1">
        <div className="flex items-center gap-2 mb-2">
          {a.pinned === 1 && (
            <span className="inline-flex items-center gap-1 text-portal-accent text-[11px] font-semibold
                             uppercase tracking-wider">
              <Pin className="w-3 h-3" /> Pinned
            </span>
          )}
          <span className="text-on-canvas-muted text-xs">{formatDate(a.published_at ?? '')}</span>
        </div>

        <h2 className="text-on-canvas font-semibold text-lg leading-snug mb-2
                       group-hover:text-portal-accent transition-colors">
          {a.title}
        </h2>

        {excerpt && (
          <p className="text-on-canvas-subtle text-sm leading-relaxed line-clamp-3 flex-1">
            {excerpt}
          </p>
        )}

        <span className="inline-flex items-center gap-1.5 text-portal-accent font-medium text-sm mt-4
                         group-hover:gap-3 transition-all">
          Read announcement <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </Link>
  )
}

export default function AnnouncementsPage() {
  const [items, setItems] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get<Announcement[]>('/announcements')
      .then(setItems)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load announcements'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 md:p-8 max-w-[1100px] mx-auto">
      <header className="mb-6">
        <h1 className="text-on-canvas text-2xl font-semibold">Announcements</h1>
        <p className="text-on-canvas-subtle text-sm mt-1">
          Official Sliquid press releases and partner news.
        </p>
      </header>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-surface border border-portal-border rounded-xl h-72 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <Megaphone className="w-12 h-12 mb-3 opacity-40" />
          <p>No announcements yet</p>
          <p className="text-sm mt-1">Check back soon for Sliquid news and press releases.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {items.map(a => <AnnouncementCard key={a.id} a={a} />)}
        </div>
      )}

      {!loading && items.length > 0 && (
        <p className="text-on-canvas-muted text-xs mt-8 flex items-center gap-1.5">
          <ExternalLink className="w-3 h-3" />
          Press releases are published at sliquid.com
        </p>
      )}
    </div>
  )
}
