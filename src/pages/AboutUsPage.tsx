const TIMELINE = [
  {
    year: '2002',
    event: 'Founded in Dallas, TX by Dean Elliott with a mission to create body-safe intimacy products.',
  },
  {
    year: '2008',
    event: 'Launched the Organics line — the first USDA-certified organic personal lubricant.',
  },
  {
    year: '2015',
    event: 'Expanded into international distribution across Europe and Asia Pacific.',
  },
  {
    year: '2019',
    event: 'Introduced Ride BodyWorx, a performance lubricants brand focused on men\'s wellness.',
  },
  {
    year: '2022',
    event: 'Celebrated 20 years with 100+ SKUs and distribution in 50+ countries worldwide.',
  },
  {
    year: '2025',
    event: 'Launched the Sliquid HQ B2B portal, expanding direct partnership opportunities globally.',
  },
]

export default function AboutUsPage() {
  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            Our Story
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight max-w-xl">
            Healthier happens together™
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            For over two decades, Sliquid has been redefining what clean,
            body-safe intimacy products look like — and building a global
            community of partners who share that vision.
          </p>
        </div>
      </div>

      {/* Mission */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <div>
            <h2 className="text-text-dark text-[32px] font-semibold mb-6">
              Our mission
            </h2>
            <div className="space-y-4 text-text-gray text-base leading-relaxed">
              <p>
                Sliquid exists to make intimacy wellness accessible, safe, and
                stigma-free for every body. We believe that what goes on your body
                matters as much as what goes in it — which is why we have never
                compromised on ingredients, transparency, or inclusion.
              </p>
              <p>
                Our B2B partners are an extension of that mission. When retailers,
                healthcare providers, and distributors carry Sliquid, they are
                offering their customers something genuinely better.
              </p>
            </div>
          </div>

          <div className="bg-bg-off-white rounded-card p-8">
            <h3 className="text-text-dark text-xl font-semibold mb-6">
              By the numbers
            </h3>
            <dl className="grid grid-cols-2 gap-6">
              {[
                { value: '2002', label: 'Year founded' },
                { value: '100+', label: 'Product SKUs' },
                { value: '50+', label: 'Countries' },
                { value: '20+', label: 'Years of expertise' },
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

      {/* Timeline */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <h2 className="text-text-dark text-[32px] font-semibold mb-12">
            Our journey
          </h2>
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[60px] top-0 bottom-0 w-px bg-gray-200 hidden sm:block" />
            <div className="space-y-10">
              {TIMELINE.map((item) => (
                <div key={item.year} className="flex gap-8 items-start">
                  <div className="flex-shrink-0 w-[60px] text-right">
                    <span className="text-sliquid-blue font-bold text-sm">
                      {item.year}
                    </span>
                  </div>
                  {/* Dot */}
                  <div className="flex-shrink-0 w-3 h-3 rounded-full bg-sliquid-blue mt-0.5 relative z-10 hidden sm:block" />
                  <p className="text-text-gray text-base leading-relaxed">
                    {item.event}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
