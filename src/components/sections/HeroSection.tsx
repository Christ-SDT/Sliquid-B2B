import { Link } from 'react-router-dom'
import { IMG_HERO } from '@/utils/constants'

const INSIDER_URL = 'https://sliquid.com/sliquid-insider-portal/sliquid-insider-registration/'

export default function HeroSection() {
  return (
    <section
      className="relative h-hero w-full overflow-hidden bg-gray-900"
      aria-label="Hero banner"
    >
      <img
        src={IMG_HERO}
        alt=""
        role="presentation"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 w-full h-full object-cover object-[center_25%]"
      />
      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

      {/* Hero card — bottom-left overlay matching original template */}
      <div className="absolute bottom-0 left-0 right-0 flex items-flex-end pb-14">
        <div className="max-w-[1240px] mx-auto px-6 w-full">
          <div
            className="bg-white rounded-card p-10 md:p-14 max-w-[680px]
                        shadow-[0_20px_40px_rgba(0,0,0,0.08)]"
          >
            <h1 className="text-text-dark text-[38px] md:text-[46px] font-semibold
                           leading-[1.1] tracking-[-1px] mb-6">
              Everything Sliquid retailers need in one place.
            </h1>
            <p className="text-text-gray text-base md:text-lg mb-8 leading-relaxed">
              Your hub for product education, staff training, downloadable assets, and partner resources to support your business every step of the way.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={INSIDER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center bg-sliquid-blue
                           hover:bg-sliquid-dark-blue text-white font-semibold px-7 py-3.5
                           rounded-lg text-[15px] transition-colors duration-150"
              >
                Become a Retailer
              </a>
              <Link
                to="/partner-login#register"
                className="inline-flex items-center justify-center border border-gray-300
                           text-text-dark hover:border-sliquid-blue hover:text-sliquid-blue
                           font-semibold px-7 py-3.5 rounded-lg text-[15px] transition-colors duration-150"
              >
                Partner Portal
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
