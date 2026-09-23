import { useTranslation } from 'react-i18next'
import { EXECUTIVES } from '@/utils/constants'

const VALUE_IDS = ['clean', 'inclusive', 'transparent', 'partnership'] as const

export default function AboutUsPage() {
  const { t } = useTranslation('about')

  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('hero.eyebrow')}
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight max-w-xl">
            {t('hero.title')}
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            {t('hero.body')}
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <h2 className="text-text-dark text-[32px] font-semibold mb-6">
              {t('mission.title')}
            </h2>
            <div className="space-y-4 text-text-gray text-base leading-relaxed">
              <p>{t('mission.p1')}</p>
              <p>{t('mission.p2')}</p>
              <p>{t('mission.p3')}</p>
            </div>
          </div>

          <div className="bg-bg-off-white rounded-card p-8">
            <h3 className="text-text-dark text-xl font-semibold mb-6">
              {t('numbers.title')}
            </h3>
            <dl className="grid grid-cols-2 gap-6">
              {[
                { value: '2002', label: t('numbers.founded') },
                { value: '100+', label: t('numbers.skus') },
                { value: '50+', label: t('numbers.countries') },
                { value: '20+', label: t('numbers.years') },
              ].map((stat) => (
                <div key={stat.label}>
                  <dt className="text-[36px] font-bold text-sliquid-blue leading-none">
                    {stat.value}
                  </dt>
                  <dd className="text-text-gray text-sm mt-1">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {/* Dean's Legacy */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
                {t('foundation.eyebrow')}
              </p>
              <h2 className="text-text-dark text-[32px] font-semibold mb-6">
                {t('foundation.title')}
              </h2>
              <div className="space-y-4 text-text-gray text-base leading-relaxed">
                <p>{t('foundation.p1')}</p>
                <p>{t('foundation.p2')}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">3</p>
                <p className="text-text-gray text-sm mt-2">{t('foundation.brands')}</p>
              </div>
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">1M+</p>
                <p className="text-text-gray text-sm mt-2">{t('foundation.customers')}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Values */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('values.eyebrow')}
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            {t('values.title')}
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {VALUE_IDS.map((id) => (
            <div
              key={id}
              className="border border-gray-100 rounded-card p-8 bg-white hover:border-sliquid-blue
                         transition-colors duration-150"
            >
              <h3 className="text-text-dark text-xl font-semibold mb-4">
                {t(`values.${id}.title`)}
              </h3>
              <p className="text-text-gray text-base leading-relaxed">
                {t(`values.${id}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Executive Team */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('team.eyebrow')}
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            {t('team.title')}
          </h2>
          <p className="text-text-gray text-base mt-3 max-w-xl leading-relaxed">
            {t('team.intro')}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {EXECUTIVES.map((exec) => (
            <div
              key={exec.id}
              className="bg-white border border-gray-100 rounded-card p-6 flex flex-col items-center text-center
                         shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
            >
              <div className="w-36 h-36 rounded-full overflow-hidden bg-bg-off-white mb-5 flex-shrink-0">
                <img
                  src={exec.imageUrl}
                  alt={t(`team.executives.${exec.id}.imageAlt`)}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <p className="text-text-dark font-semibold text-base leading-tight">
                {exec.name}
              </p>
              <p className="text-text-gray text-sm mt-1 leading-snug">
                {t(`team.executives.${exec.id}.title`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* B2B CTA */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6 text-center">
          <h2 className="text-text-dark text-[32px] font-semibold mb-4">
            {t('cta.title')}
          </h2>
          <p className="text-text-gray text-base max-w-xl mx-auto leading-relaxed mb-8">
            {t('cta.body')}
          </p>
          <a
            href="/contact"
            className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                       text-white font-semibold px-8 py-3.5 rounded-lg text-[15px] transition-colors duration-150"
          >
            {t('cta.button')}
          </a>
        </div>
      </div>
    </div>
  )
}
