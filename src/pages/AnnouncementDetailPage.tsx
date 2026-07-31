import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API_BASE } from '@/utils/constants'
import { formatDate, isoDate } from '@/utils/date'
import type { Announcement } from '@/types'
import AnnouncementBody from '@/components/AnnouncementBody'

function BackLink() {
  return (
    <Link
      to="/announcements"
      className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm
                 hover:gap-3 transition-all duration-150"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      All announcements
    </Link>
  )
}

export default function AnnouncementDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [item, setItem] = useState<Announcement | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    setLoading(true)
    setNotFound(false)
    fetch(`${API_BASE}/api/announcements/public/${encodeURIComponent(slug)}`)
      .then((r) => {
        if (!r.ok) throw new Error('not found')
        return r.json()
      })
      .then((data: Announcement) => setItem(data))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="max-w-[860px] mx-auto px-6 py-14">
        <div className="h-4 w-36 bg-gray-100 rounded animate-pulse mb-8" />
        <div className="h-10 w-4/5 bg-gray-100 rounded animate-pulse mb-4" />
        <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mb-10" />
        <div className="h-72 bg-gray-100 rounded-card animate-pulse" />
      </div>
    )
  }

  // Render not-found inline rather than redirecting, so the URL stays shareable
  // and diagnosable.
  if (notFound || !item) {
    return (
      <div className="max-w-[860px] mx-auto px-6 py-20 text-center">
        <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">
          Newsroom
        </p>
        <h1 className="text-text-dark text-[30px] font-semibold tracking-[-0.5px] mb-4">
          Announcement not found
        </h1>
        <p className="text-text-gray mb-8">
          This announcement may have been removed, or the link may be incorrect.
        </p>
        <BackLink />
      </div>
    )
  }

  // A 'document' body is the author's own full-page design — give it more room
  // and let its internal max-width do the centring.
  const isDocument = item.body_shape === 'document'

  return (
    <article className={`mx-auto px-6 py-12 md:py-16 ${isDocument ? 'max-w-[980px]' : 'max-w-[860px]'}`}>
      <div className="mb-8">
        <BackLink />
      </div>

      <header className="mb-10">
        <div className="flex items-center gap-3 mb-4">
          <span className="bg-bg-light-blue text-sliquid-blue text-xs font-semibold px-2.5 py-1 rounded-full">
            Press Release
          </span>
          <time dateTime={isoDate(item.published_at)} className="text-text-light-gray text-sm">
            {formatDate(item.published_at)}
          </time>
        </div>

        <h1 className="text-text-dark text-[34px] md:text-[40px] font-semibold tracking-[-0.5px] leading-tight">
          {item.title}
        </h1>

        {item.wp_link && (
          <a
            href={item.wp_link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm mt-5
                       hover:gap-3 transition-all duration-150"
          >
            View on sliquid.com
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}
      </header>

      {item.image_url && !isDocument && (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="w-full rounded-img mb-10"
        />
      )}

      {isDocument ? (
        <div className="rounded-card border border-gray-100 overflow-hidden shadow-sm bg-white">
          <AnnouncementBody html={item.body_html} shape="document" title={item.title} />
        </div>
      ) : (
        <AnnouncementBody html={item.body_html} shape="rich" title={item.title} />
      )}

      <div className="mt-14 pt-8 border-t border-gray-100">
        <BackLink />
      </div>
    </article>
  )
}
