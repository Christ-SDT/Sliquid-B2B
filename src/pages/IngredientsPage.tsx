import { useTranslation } from 'react-i18next'

// Copy lives in locales/*/ingredients.json, keyed by these ids.
const STANDARDS = [
  { id: 'glycerin-free', icon: '🚫' },
  { id: 'paraben-free', icon: '✓' },
  { id: 'body-safe', icon: '🛡' },
  { id: 'vegan', icon: '🌱' },
  { id: 'made-in-usa', icon: '🇺🇸' },
  { id: 'transparent', icon: '🔍' },
] as const

const KEY_INGREDIENT_IDS = [
  'purified-water', 'aloe-vera', 'plant-cellulose', 'agar-agar', 'guar-gum', 'vitamin-e',
  'flax-extract', 'hibiscus', 'green-tea', 'sunflower-seed', 'citric-acid', 'potassium-sorbate',
  'dimethicone',
] as const

const AVOIDED_IDS = [
  'glycerin', 'parabens', 'propylene-glycol', 'nonoxynol-9', 'benzocaine', 'artificial-fragrance',
] as const

export default function IngredientsPage() {
  const { t } = useTranslation('ingredients')

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

      {/* Philosophy block */}
      <div className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="max-w-3xl">
          <h2 className="text-text-dark text-[32px] font-semibold mb-6">
            {t('philosophy.title')}
          </h2>
          <div className="space-y-4 text-text-gray text-base leading-relaxed">
            <p>{t('philosophy.p1')}</p>
            <p>{t('philosophy.p2')}</p>
          </div>
        </div>
      </div>

      {/* Certifications grid */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <h2 className="text-text-dark text-[32px] font-semibold mb-10">
            {t('standards.title')}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {STANDARDS.map((cert) => (
              <div
                key={cert.id}
                className="bg-white rounded-card p-8 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="text-4xl mb-4" aria-hidden="true">
                  {cert.icon}
                </div>
                <h3 className="text-text-dark text-xl font-semibold mb-3">
                  {t(`standards.items.${cert.id}.title`)}
                </h3>
                <p className="text-text-gray text-sm leading-relaxed">
                  {t(`standards.items.${cert.id}.description`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Ingredients */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            {t('key.eyebrow')}
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            {t('key.title')}
          </h2>
          <p className="text-text-gray text-base mt-3 max-w-2xl leading-relaxed">
            {t('key.intro')}
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {KEY_INGREDIENT_IDS.map((id) => (
            <div
              key={id}
              className="border border-gray-100 rounded-card p-7 bg-white hover:border-sliquid-blue
                         transition-colors duration-150"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className="text-text-dark text-lg font-semibold">
                  {t(`key.items.${id}.name`)}
                </h3>
                <span className="flex-shrink-0 bg-bg-light-blue text-sliquid-blue text-xs font-semibold
                                  px-2.5 py-1 rounded-full">
                  {t(`key.items.${id}.tag`)}
                </span>
              </div>
              <p className="text-text-gray text-sm leading-relaxed">
                {t(`key.items.${id}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Avoided Ingredients */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="mb-12">
            <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
              {t('avoided.eyebrow')}
            </p>
            <h2 className="text-text-dark text-[32px] font-semibold">
              {t('avoided.title')}
            </h2>
            <p className="text-text-gray text-base mt-3 max-w-2xl leading-relaxed">
              {t('avoided.intro')}
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AVOIDED_IDS.map((id) => (
              <div
                key={id}
                className="bg-white rounded-card p-7 border-l-4 border-red-400"
              >
                <h3 className="text-text-dark text-lg font-semibold mb-3">
                  {t(`avoided.items.${id}.name`)}
                </h3>
                <p className="text-text-gray text-sm leading-relaxed">
                  {t(`avoided.items.${id}.reason`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Formula Selector CTA */}
      <div className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="bg-bg-light-blue rounded-card p-10 md:p-14 flex flex-col md:flex-row
                        items-start md:items-center justify-between gap-8">
          <div className="max-w-xl">
            <h2 className="text-text-dark text-[28px] font-semibold mb-3">
              {t('cta.title')}
            </h2>
            <p className="text-text-gray text-base leading-relaxed">
              {t('cta.body')}
            </p>
          </div>
          <a
            href="/contact"
            className="flex-shrink-0 inline-flex items-center justify-center bg-sliquid-blue
                       hover:bg-sliquid-dark-blue text-white font-semibold px-8 py-3.5
                       rounded-lg text-[15px] transition-colors duration-150"
          >
            {t('cta.button')}
          </a>
        </div>
      </div>
    </div>
  )
}
