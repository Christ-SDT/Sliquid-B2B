import { Link } from 'react-router-dom'
import { IMG_BRANDS_HERO } from '@/utils/constants'

export default function BrandsSection() {
  return (
    <section className="py-20 bg-bg-light-blue" aria-labelledby="brands-heading">
      <div className="max-w-[1240px] mx-auto px-6">
        {/* Centered header */}
        <div className="text-center max-w-[700px] mx-auto mb-10">
          <h2
            id="brands-heading"
            className="text-text-dark text-[32px] font-semibold mb-4"
          >
            Expanding the family with specialized lines
          </h2>
          <p className="text-text-gray text-base leading-relaxed mb-6">
            See how we are broadening our catalog to include specialized
            lubricants and men&apos;s wellness.
          </p>
          <Link
            to="/our-brands"
            className="inline-flex items-center gap-1.5 text-sliquid-blue font-semibold text-[15px]
                       hover:gap-3 transition-all duration-150"
          >
            Explore our sister brands
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
        </div>

        {/* Full-width showcase image with floating brand label */}
        <div className="relative rounded-img overflow-hidden">
          <img
            src={IMG_BRANDS_HERO}
            alt="Sliquid and Ride BodyWorx product collection"
            loading="lazy"
            referrerPolicy="strict-origin-when-cross-origin"
            className="w-full h-[500px] object-cover"
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent" />

          {/* Floating brand label — bottom-left, matches original template */}
          <div
            className="absolute bottom-7 left-7 bg-white rounded-lg shadow-xl
                        px-7 py-5 text-left"
          >
            <strong className="block text-xl text-text-dark">
              Ride BodyWorx &amp; Ride Rocco
            </strong>
            <span className="text-sm text-text-gray">
              Performance lubricants &amp; men&apos;s care
            </span>
          </div>
        </div>
      </div>
    </section>
  )
}
