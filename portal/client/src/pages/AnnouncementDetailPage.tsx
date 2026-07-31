import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, Megaphone } from 'lucide-react'
import { api } from '@/api/client'
import type { Announcement } from '@/types'
import { formatDate } from '@/lib/utils'
import AnnouncementBody from '@/components/AnnouncementBody'

export default function AnnouncementDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [item, setItem] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setNotFound(false)
    api.get<Announcement>(`/announcements/${encodeURIComponent(slug)}`)
      .then(setItem)
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  const backLink = (
    <Link
      to="/announcements"
      className="inline-flex items-center gap-1.5 text-on-canvas-subtle hover:text-portal-accent
                 text-sm transition-colors mb-6"
    >
      <ArrowLeft className="w-4 h-4" /> Back to announcements
    </Link>
  )

  if (loading) {
    return (
      <div className="p-6 md:p-8 max-w-[900px] mx-auto">
        <div className="h-4 w-40 bg-surface rounded animate-pulse mb-8" />
        <div className="h-9 w-3/4 bg-surface rounded animate-pulse mb-4" />
        <div className="h-64 bg-surface rounded-xl animate-pulse" />
      </div>
    )
  }

  if (notFound || !item) {
    return (
      <div className="p-6 md:p-8 max-w-[900px] mx-auto">
        {backLink}
        <div className="flex flex-col items-center justify-center py-20 text-on-canvas-muted">
          <Megaphone className="w-12 h-12 mb-3 opacity-40" />
          <p className="text-on-canvas font-medium">Announcement not available</p>
          <p className="text-sm mt-1">
            It may have been unpublished, or the link may be incorrect.
          </p>
        </div>
      </div>
    )
  }

  // A 'document' body is the author's own full-page design; give it the wider
  // container and let its internal max-width do the centring. Plain content
  // reads better constrained.
  const isDocument = item.body_shape === 'document'

  return (
    <div className={`p-6 md:p-8 mx-auto ${isDocument ? 'max-w-[1000px]' : 'max-w-[860px]'}`}>
      {backLink}

      <header className="mb-8">
        <p className="text-on-canvas-muted text-sm mb-2">
          <time dateTime={item.published_at ?? undefined}>
            {formatDate(item.published_at ?? '')}
          </time>
        </p>
        <h1 className="text-on-canvas text-3xl font-semibold leading-tight tracking-tight">
          {item.title}
        </h1>
        {item.wp_link && (
          <a
            href={item.wp_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-portal-accent text-sm font-medium mt-4
                       hover:opacity-80 transition-opacity"
          >
            View on sliquid.com <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </header>

      {item.image_url && !isDocument && (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full rounded-xl mb-8"
        />
      )}

      {isDocument ? (
        // Framed so the embedded document reads as an artifact rather than a
        // broken page.
        <div className="rounded-xl border border-portal-border overflow-hidden bg-white">
          <AnnouncementBody html={item.body_html} shape="document" title={item.title} />
        </div>
      ) : (
        <AnnouncementBody html={item.body_html} shape="rich" title={item.title} />
      )}
    </div>
  )
}
