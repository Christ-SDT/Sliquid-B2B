import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FEATURED_NEWS } from '@/utils/constants'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const CATEGORIES = ['All', 'Distribution', 'Product News', 'Awards', 'Platform', 'Leadership', 'Education']

const RESOURCES = [
  {
    id: 'wholesale-catalog',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    title: 'Wholesale Catalog 2025',
    description:
      'Full SKU list with wholesale pricing tiers, minimum order quantities, and product specs across Sliquid, RIDE Lube, and Ride Rocco.',
    cta: 'Request catalog',
    href: '/contact?type=retailer',
  },
  {
    id: 'ingredient-sheet',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
      </svg>
    ),
    title: 'Ingredient Reference Sheet',
    description:
      'A one-page clinical reference covering key ingredients, avoided additives, pH ranges, and compatibility notes — designed for healthcare practitioners.',
    cta: 'Request for your practice',
    href: '/contact?type=practitioner',
  },
  {
    id: 'merch-guide',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    title: 'Retail Merchandising Guide',
    description:
      'Planogram recommendations, display kit specs, signage assets, and proven shelf placement strategies to maximize Sliquid sell-through in-store.',
    cta: 'Request for your store',
    href: '/contact?type=retailer',
  },
  {
    id: 'distributor-brief',
    icon: (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064" />
      </svg>
    ),
    title: 'Global Distribution Brief',
    description:
      'Territory coverage maps, logistics requirements, regulatory documentation support, and key contact information for distribution partnership inquiries.',
    cta: 'Contact our distribution team',
    href: '/contact?type=distributor',
  },
]

export default function InsightsPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') ?? ''
  const [activeCategory, setActiveCategory] = useState('All')

  const articles = FEATURED_NEWS.filter((a) => {
    const matchesQuery =
      !query ||
      a.title.toLowerCase().includes(query.toLowerCase()) ||
      a.excerpt.toLowerCase().includes(query.toLowerCase())
    const matchesCategory =
      activeCategory === 'All' || a.category === activeCategory
    return matchesQuery && matchesCategory
  })

  const featuredArticle = articles.find((a) => a.featured)
  const remainingArticles = articles.filter((a) => !a.featured || activeCategory !== 'All' || query)

  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            Knowledge Hub
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight max-w-xl">
            Insights &amp; Industry News
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            Stay current on Sliquid product launches, distribution updates,
            leadership perspectives, and educational content designed specifically
            for our B2B partners.
          </p>
          {query && (
            <p className="text-text-gray mt-4 text-base">
              Showing results for:{' '}
              <span className="font-semibold text-text-dark">"{query}"</span>
              {' — '}
              <Link to="/insights" className="text-sliquid-blue hover:underline">
                clear search
              </Link>
            </p>
          )}
        </div>
      </div>

      {/* Category filters */}
      <div className="border-b border-gray-100 bg-white sticky top-[80px] z-40">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto py-3 scrollbar-hide">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors duration-150 ${
                  activeCategory === cat
                    ? 'bg-sliquid-blue text-white'
                    : 'text-text-gray hover:text-sliquid-blue hover:bg-bg-light-blue'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-[1240px] mx-auto px-6 py-16 space-y-16">

        {articles.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-text-gray text-lg">No articles found.</p>
            <button
              onClick={() => { setActiveCategory('All') }}
              className="inline-block mt-4 text-sliquid-blue font-semibold hover:underline"
            >
              View all articles
            </button>
          </div>
        ) : (
          <>
            {/* Featured article — only shown on All with no search query */}
            {featuredArticle && activeCategory === 'All' && !query && (
              <div>
                <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-6">
                  Featured
                </p>
                <Link
                  to={featuredArticle.href}
                  className="group grid grid-cols-1 lg:grid-cols-2 gap-0 bg-white border border-gray-100
                             rounded-card overflow-hidden shadow-sm hover:shadow-lg transition-shadow duration-200"
                >
                  <div className="overflow-hidden">
                    <img
                      src={featuredArticle.imageUrl}
                      alt={featuredArticle.imageAlt}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="w-full h-72 lg:h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  </div>
                  <div className="p-10 flex flex-col justify-center space-y-4">
                    <div className="flex items-center gap-2">
                      <span className="bg-bg-light-blue text-sliquid-blue text-xs font-semibold px-2.5 py-1 rounded-full">
                        {featuredArticle.category}
                      </span>
                      <time dateTime={featuredArticle.date} className="text-text-light-gray text-xs">
                        {formatDate(featuredArticle.date)}
                      </time>
                    </div>
                    <h2 className="text-text-dark text-[28px] font-semibold leading-tight">
                      {featuredArticle.title}
                    </h2>
                    <p className="text-text-gray text-base leading-relaxed">
                      {featuredArticle.excerpt}
                    </p>
                    <span className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm
                                     group-hover:gap-3 transition-all duration-150 mt-2">
                      Read full article
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </span>
                  </div>
                </Link>
              </div>
            )}

            {/* Article grid */}
            {remainingArticles.length > 0 && (
              <div>
                {activeCategory === 'All' && !query && (
                  <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-6">
                    Latest
                  </p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
                  {remainingArticles.map((article) => (
                    <article
                      key={article.id}
                      className="bg-white border border-gray-100 rounded-card overflow-hidden
                                 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col"
                    >
                      <div className="overflow-hidden">
                        <img
                          src={article.imageUrl}
                          alt={article.imageAlt}
                          loading="lazy"
                          referrerPolicy="strict-origin-when-cross-origin"
                          className="w-full h-48 object-cover hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                      <div className="p-6 space-y-3 flex flex-col flex-1">
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
                        <p className="text-text-gray text-sm leading-relaxed line-clamp-3 flex-1">
                          {article.excerpt}
                        </p>
                        <Link
                          to={article.href}
                          className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm
                                     hover:gap-3 transition-all duration-150 mt-auto pt-2"
                        >
                          Read more
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* B2B Resources */}
        <div className="pt-4">
          <div className="mb-10">
            <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
              Partner Resources
            </p>
            <h2 className="text-text-dark text-[32px] font-semibold">
              B2B resources &amp; downloads
            </h2>
            <p className="text-text-gray text-base mt-3 max-w-2xl leading-relaxed">
              Practical tools for retailers, practitioners, and distributors.
              Request any of the following from our B2B team.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {RESOURCES.map((res) => (
              <div
                key={res.id}
                className="bg-white border border-gray-100 rounded-card p-7 flex flex-col gap-4
                           hover:border-sliquid-blue transition-colors duration-150"
              >
                <div className="w-12 h-12 rounded-xl bg-bg-light-blue flex items-center justify-center
                                text-sliquid-blue flex-shrink-0">
                  {res.icon}
                </div>
                <div className="flex-1">
                  <h3 className="text-text-dark font-semibold text-base mb-2">
                    {res.title}
                  </h3>
                  <p className="text-text-gray text-sm leading-relaxed">
                    {res.description}
                  </p>
                </div>
                <Link
                  to={res.href}
                  className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-sm
                             hover:gap-3 transition-all duration-150"
                >
                  {res.cta}
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* Newsletter CTA */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6 text-center">
          <h2 className="text-text-dark text-[28px] font-semibold mb-3">
            Never miss an update
          </h2>
          <p className="text-text-gray text-base max-w-lg mx-auto leading-relaxed mb-8">
            Get new product launches, distribution announcements, and B2B
            resources delivered directly to your inbox.
          </p>
          <Link
            to="/"
            className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                       text-white font-semibold px-8 py-3.5 rounded-lg text-[15px] transition-colors duration-150"
          >
            Subscribe to updates
          </Link>
        </div>
      </div>
    </div>
  )
}
