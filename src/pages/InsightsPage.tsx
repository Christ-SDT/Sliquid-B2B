import { Link, useSearchParams } from 'react-router-dom'
import { FEATURED_NEWS } from '@/utils/constants'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function InsightsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''

  const articles = query
    ? FEATURED_NEWS.filter(
        (a) =>
          a.title.toLowerCase().includes(query.toLowerCase()) ||
          a.excerpt.toLowerCase().includes(query.toLowerCase()),
      )
    : FEATURED_NEWS

  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            Knowledge Hub
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight">
            Insights &amp; News
          </h1>
          {query && (
            <p className="text-text-gray mt-3 text-base">
              Showing results for:{' '}
              <span className="font-semibold text-text-dark">{query}</span>
            </p>
          )}
        </div>
      </div>

      {/* Article grid */}
      <div className="max-w-[1240px] mx-auto px-6 py-16">
        {articles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-text-gray text-lg">No articles found.</p>
            <Link
              to="/insights"
              className="inline-block mt-4 text-sliquid-blue font-semibold hover:underline"
            >
              View all articles
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {articles.map((article) => (
              <article
                key={article.id}
                className="bg-white border border-gray-100 rounded-card overflow-hidden
                           shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <img
                  src={article.imageUrl}
                  alt={article.imageAlt}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-48 object-cover"
                />
                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="bg-bg-light-blue text-sliquid-blue text-xs font-semibold px-2.5 py-1 rounded-full">
                      {article.category}
                    </span>
                    <time dateTime={article.date} className="text-text-light-gray text-xs">
                      {formatDate(article.date)}
                    </time>
                  </div>
                  <h2 className="text-text-dark text-lg font-semibold leading-snug">
                    {article.title}
                  </h2>
                  <p className="text-text-gray text-sm leading-relaxed line-clamp-3">
                    {article.excerpt}
                  </p>
                  <Link
                    to={article.href}
                    className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm
                               hover:gap-3 transition-all duration-150"
                  >
                    Read More
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
