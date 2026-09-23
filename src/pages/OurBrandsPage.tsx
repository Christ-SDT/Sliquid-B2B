import { useTranslation } from 'react-i18next'
import { BRANDS } from '@/utils/constants'

export default function OurBrandsPage() {
  const { t } = useTranslation('ourBrands')
  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('eyebrow')}
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight max-w-xl">
            {t('title')}
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            {t('intro')}
          </p>
        </div>
      </div>

      {/* Brand cards */}
      <div className="max-w-[1240px] mx-auto px-6 py-20 space-y-20">
        {BRANDS.map((brand, idx) => (
          <div
            key={brand.id}
            className={`grid grid-cols-1 lg:grid-cols-2 gap-12 items-center ${
              idx % 2 === 1 ? 'lg:[direction:rtl]' : ''
            }`}
          >
            <div className={idx % 2 === 1 ? 'lg:[direction:ltr]' : ''}>
              <img
                src={brand.imageUrl}
                alt={t(`common:brands.${brand.id}.imageAlt`)}
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-full h-80 object-cover rounded-card"
              />
            </div>
            <div className={`space-y-5 ${idx % 2 === 1 ? 'lg:[direction:ltr]' : ''}`}>
              <div>
                <h2 className="text-text-dark text-[32px] font-semibold">
                  {brand.name}
                </h2>
                <p className="text-sliquid-blue font-medium text-sm mt-1 uppercase tracking-wider">
                  {t(`common:brands.${brand.id}.tagline`)}
                </p>
              </div>
              <p className="text-text-gray text-base leading-relaxed">
                {t(`common:brands.${brand.id}.description`)}
              </p>
              <a
                href={brand.siteUrl}
                rel="noopener noreferrer"
                target="_blank"
                className="inline-flex items-center gap-2 bg-sliquid-blue hover:bg-sliquid-dark-blue
                           text-white font-semibold px-6 py-3 rounded-lg text-sm transition-colors duration-150"
              >
                {t('visit', { name: brand.name })}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
