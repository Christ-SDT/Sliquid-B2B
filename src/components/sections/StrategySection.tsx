import { Link } from 'react-router-dom'
import { STRATEGY_CARDS } from '@/utils/constants'

function ArrowLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-[15px]
                 hover:gap-3 transition-all duration-150"
    >
      {label}
      <svg
        className="w-4 h-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  )
}

export default function StrategySection() {
  return (
    <section className="py-20 container-section" aria-labelledby="strategy-heading">
      <div className="max-w-[1240px] mx-auto px-6">
        {/* Header */}
        <div className="max-w-[800px] mb-12">
          <h2
            id="strategy-heading"
            className="text-text-dark text-[36px] font-semibold tracking-[-0.5px] mb-4"
          >
            Our strategy is to advance your inventory
          </h2>
          <p className="text-text-gray text-base leading-relaxed">
            Offer your customers the cleanest formulations by working with Sliquid
            to advance your unique business needs.
          </p>
        </div>

        {/* 3-column grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {STRATEGY_CARDS.map((card) => (
            <article key={card.id}>
              {/* Image wrapper with hover zoom */}
              <div className="h-[300px] rounded-img overflow-hidden mb-6">
                <img
                  src={card.imageUrl}
                  alt={card.imageAlt}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-full object-cover transition-transform duration-[400ms] hover:scale-[1.03]"
                />
              </div>
              <h3 className="text-text-dark text-2xl font-semibold mb-3">
                {card.title}
              </h3>
              <p className="text-text-gray text-base leading-relaxed mb-4">
                {card.description}
              </p>
              <ArrowLink to={card.linkHref} label={card.linkLabel} />
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}
