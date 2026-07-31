import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '@/utils/constants'
import { formatDate, isoDate } from '@/utils/date'
import type { Announcement } from '@/types'

function stripHtml(html?: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function SkeletonCard() {
  return (
    <div className="bg-white border border-gray-100 rounded-card overflow-hidden shadow-sm">
      <div className="aspect-[16/9] bg-gray-100 animate-pulse" />
      <div className="p-6 space-y-3">
        <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
        <div className="h-5 w-full bg-gray-100 rounded animate-pulse" />
        <div className="h-4 w-5/6 bg-gray-100 rounded animate-pulse" />
      </div>
    </div>
  )
}

function AnnouncementCard({ a, featured = false }: { a: Announcement; featured?: boolean }) {
  const excerpt = stripHtml(a.excerpt)

  return (
    <Link
      to={`/announcements/${a.slug}`}
      className="group bg-white border border-gray-100 rounded-card overflow-hidden shadow-sm
                 hover:shadow-lg transition-shadow duration-200 flex flex-col"
    >
      {a.image_url && (
        <div className={`${featured ? 'aspect-[16/8]' : 'aspect-[16/9]'} overflow-hidden bg-bg-off-white`}>
          <img
            src={a.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-full object-cover"
          />
        </div>
      )}
      <div className="p-6 flex flex-col flex-1">
        <div className="flex items-center gap-3 mb-3">
          <span className="bg-bg-light-blue text-sliquid-blue text-xs font-semibold px-2.5 py-1 rounded-full">
            Press Release
          </span>
          <time
            dateTime={isoDate(a.published_at)}
            className="text-text-light-gray text-xs"
          >
            {formatDate(a.published_at)}
          </time>
        </div>

        <h2
          className={`text-text-dark font-semibold leading-[1.3] mb-3 ${
            featured ? 'text-[28px]' : 'text-[19px]'
          }`}
        >
          {a.title}
        </h2>

        {excerpt && (
          <p className="text-text-gray text-base leading-relaxed flex-1 line-clamp-3">{excerpt}</p>
        )}

        <span
          className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm mt-5
                     group-hover:gap-3 transition-all duration-150"
        >
          Read more
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
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
    setLoading(true)
    setError('')
    fetch(`${API_BASE}/api/announcements/public`)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load announcements')
        return r.json()
      })
      .then((data: Announcement[]) => setItems(data))
      .catch(() => setError('Unable to load announcements. Please try again later.'))
      .finally(() => setLoading(false))
  }, [])

  const [featured, ...rest] = items

  return (
    <div>
      {/* Page hero */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[1240px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">
            Newsroom
          </p>
          <h1 className="text-text-dark text-[36px] font-semibold tracking-[-0.5px] leading-tight">
            Announcements
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            Official Sliquid press releases — product launches, awards, distribution
            news, and company milestones.
          </p>
        </div>
      </section>

      <section className="py-14 md:py-20" aria-labelledby="announcements-heading">
        <h2 id="announcements-heading" className="sr-only">
          Press releases
        </h2>
        <div className="max-w-[1240px] mx-auto px-6">
          {error && (
            <div className="rounded-card border border-gray-100 bg-bg-off-white p-8 text-center">
              <p className="text-text-gray">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : !error && items.length === 0 ? (
            <div className="rounded-card border border-gray-100 bg-bg-off-white p-12 text-center">
              <p className="text-text-dark font-semibold text-lg">No announcements yet</p>
              <p className="text-text-gray mt-2">
                Check back soon, or{' '}
                <Link to="/contact" className="text-sliquid-blue font-medium hover:underline">
                  get in touch
                </Link>{' '}
                with our press team.
              </p>
            </div>
          ) : (
            <>
              {featured && (
                <div className="mb-8">
                  <AnnouncementCard a={featured} featured />
                </div>
              )}
              {rest.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
                  {rest.map((a) => <AnnouncementCard key={a.id} a={a} />)}
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  )
}
