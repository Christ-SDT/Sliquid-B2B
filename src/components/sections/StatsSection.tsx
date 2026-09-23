import { useTranslation } from 'react-i18next'
import { STATS } from '@/utils/constants'

export default function StatsSection() {
  const { t } = useTranslation('home')
  return (
    <section className="py-24 bg-white" aria-labelledby="stats-heading">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          {/* Left: text content */}
          <div className="space-y-6">
            <h2
              id="stats-heading"
              className="text-text-dark text-[36px] font-semibold leading-[1.2] tracking-[-0.5px]"
            >
              {t('stats.heading')}
            </h2>
            <p className="text-text-gray text-[17px] leading-relaxed">
              {t('stats.body')}
            </p>
          </div>

          {/* Right: stats */}
          <div className="flex flex-col gap-10">
            {STATS.map((stat) => (
              <div key={stat.id}>
                <div className="text-[48px] font-bold text-sliquid-blue leading-none mb-2">
                  {stat.value}
                </div>
                <span className="text-base font-medium text-text-dark">
                  {t(`stats.items.${stat.id}`)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
