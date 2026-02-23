import { STATS } from '@/utils/constants'

export default function StatsSection() {
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
              A truly integrated health &amp; wellness ecosystem
            </h2>
            <p className="text-text-gray text-[17px] leading-relaxed">
              As part of the Sliquid family, our enterprise assets—in retail, in
              pharmacies, and online—enable us to maximize the impact of our
              products and fuel your ability to deliver truly healthy benefits.
              Our extensive physical footprint augments our capabilities that make
              healthier intimacy happen together.
            </p>
          </div>

          {/* Right: stats */}
          <div className="flex flex-col gap-10">
            {STATS.map((stat) => (
              <div key={stat.value}>
                <div className="text-[48px] font-bold text-sliquid-blue leading-none mb-2">
                  {stat.value}
                </div>
                <span className="text-base font-medium text-text-dark">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
