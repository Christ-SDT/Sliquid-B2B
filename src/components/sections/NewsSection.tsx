import { Link } from 'react-router-dom'
import { FEATURED_NEWS } from '@/utils/constants'
import type { NewsArticle } from '@/types'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

function FeaturedNewsCard({ article }: { article: NewsArticle }) {
  return (
    <div className="main-news-card">
      <img
        src={article.imageUrl}
        alt={article.imageAlt}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-full rounded-img mb-6 object-cover h-64"
      />
      <h3 className="text-text-dark text-[28px] font-semibold leading-[1.3] mb-3">
        {article.title}
      </h3>
      <p className="text-text-gray text-base leading-relaxed mb-4">
        {article.excerpt}
      </p>
      <Link
        to={article.href}
        className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-[15px]
                   hover:gap-3 transition-all duration-150 mt-2"
      >
        Read the article
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  )
}

function SmallNewsItem({ article }: { article: NewsArticle }) {
  return (
    <div className="flex gap-5 items-start">
      <img
        src={article.imageUrl}
        alt={article.imageAlt}
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="w-[120px] h-20 object-cover rounded-lg flex-shrink-0"
      />
      <div>
        <h4 className="text-text-dark text-base font-semibold leading-[1.4] mb-2">
          {article.title}
        </h4>
        <time dateTime={article.date} className="text-text-gray text-sm">
          {formatDate(article.date)}
        </time>
        <br />
        <Link
          to={article.href}
          className="text-sm text-text-gray underline hover:text-sliquid-blue transition-colors duration-150 mt-1 inline-block"
        >
          Read more
        </Link>
      </div>
    </div>
  )
}

export default function NewsSection() {
  const [featured, ...sideItems] = FEATURED_NEWS

  if (!featured) return null

  return (
    <section className="py-20" aria-labelledby="news-heading">
      <div className="max-w-[1240px] mx-auto px-6">
        {/* CEO Quote label + section heading */}
        <p className="text-sm font-bold uppercase tracking-[1px] text-text-gray mb-5">
          Latest News &amp; Insights
        </p>

        {/* 2-col news grid: featured (1.5fr) + side list (1fr) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-12">
          <FeaturedNewsCard article={featured} />

          <div className="flex flex-col gap-8">
            {sideItems.slice(0, 3).map((article) => (
              <SmallNewsItem key={article.id} article={article} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
