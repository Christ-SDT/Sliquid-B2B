import { EXECUTIVES } from '@/utils/constants'

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
    event: 'Launched RIDE Lube, a high-performance lubricants brand engineered for demanding use across all body types.',
  },
  {
    year: '2022',
    event: 'Celebrated 20 years with 100+ SKUs and distribution in 50+ countries worldwide.',
  },
  {
    year: '2024',
    event: 'Co-Founder Cynthia Elliott assumed the role of CEO, carrying forward the company\'s mission following the passing of founder Dean Elliott.',
  },
  {
    year: '2025',
    event: 'Sliquid completed a comprehensive brand refresh — embracing a wellness-forward identity, updated packaging, and an expanded product lineup to reflect the evolving intimacy wellness market.',
  },
  {
    year: '2025',
    event: 'Launched the Sliquid HQ B2B portal, expanding direct partnership opportunities globally.',
  },
]

const VALUES = [
  {
    id: 'clean',
    title: 'Clean by conviction',
    description:
      'Sliquid has never used glycerin, parabens, or artificial fragrance — not because regulators required it, but because we believed from day one that what goes on your body matters as much as what goes in it. That conviction has not changed in over two decades.',
  },
  {
    id: 'inclusive',
    title: 'Inclusive by design',
    description:
      'Intimacy is for every body. Our formulas are developed for all genders, orientations, and body chemistries. From glycerin-free pH-balanced lubricants designed for vaginal health to the Buck Angel T-Collection formulated specifically for transgender individuals, inclusion is not a marketing position — it is a formulation requirement.',
  },
  {
    id: 'transparent',
    title: 'Transparent always',
    description:
      'Every ingredient in every formula is disclosed — on the label and on our website. No "fragrance" catch-alls, no proprietary blends, no hidden additives. Our partners can answer any customer question about what is in the bottle, because we make that information easy to find.',
  },
  {
    id: 'partnership',
    title: 'Partners in the truest sense',
    description:
      'We do not just ship product. We support our retail and practitioner partners with training resources, merchandising assets, and a B2B team that is genuinely invested in your sell-through. When you carry Sliquid, you are offering your customers something better — and we make sure you can explain why.',
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
                offering their customers something genuinely better — products
                formulated without the shortcuts that define most of the market.
              </p>
              <p>
                That trust is earned through complete ingredient transparency,
                rigorous third-party testing, and a team that treats every
                partnership as a long-term relationship, not a transaction.
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

      {/* Dean's Legacy */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div>
              <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
                The Foundation
              </p>
              <h2 className="text-text-dark text-[32px] font-semibold mb-6">
                Built on Dean's vision, carried forward by Cynthia
              </h2>
              <div className="space-y-4 text-text-gray text-base leading-relaxed">
                <p>
                  Dean Elliott co-founded Sliquid in 2002 with a straightforward
                  conviction: intimate products should be made with the same care
                  and transparency as anything else you put on your body. At a
                  time when glycerin, parabens, and artificial fragrances were
                  industry standard, Dean chose a different path — and built a
                  company around it.
                </p>
                <p>
                  Following Dean's passing in 2024, co-founder Cynthia Elliott
                  stepped into the role of CEO. Cynthia has been central to
                  Sliquid's identity, culture, and partnerships from the beginning.
                  Under her leadership, the company completed its most significant
                  brand refresh in 2025 — a wellness-forward evolution that honors
                  what Dean built while positioning Sliquid for the next chapter of
                  intimacy wellness.
                </p>
                <p>
                  The mission has not changed. The standards have not changed.
                  What has changed is the scale of the ambition — and the clarity
                  of the vision for what Sliquid can become.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">22+</p>
                <p className="text-text-gray text-sm mt-2">Years under the Elliott family's leadership</p>
              </div>
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">3</p>
                <p className="text-text-gray text-sm mt-2">Brands in the portfolio</p>
              </div>
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">2025</p>
                <p className="text-text-gray text-sm mt-2">Wellness rebrand completed</p>
              </div>
              <div className="bg-white rounded-card p-6 text-center shadow-sm">
                <p className="text-[42px] font-bold text-sliquid-blue leading-none">1M+</p>
                <p className="text-text-gray text-sm mt-2">Customers who trust Sliquid</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Values */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            What Drives Us
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            Our core values
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {VALUES.map((value) => (
            <div
              key={value.id}
              className="border border-gray-100 rounded-card p-8 bg-white hover:border-sliquid-blue
                         transition-colors duration-150"
            >
              <h3 className="text-text-dark text-xl font-semibold mb-4">
                {value.title}
              </h3>
              <p className="text-text-gray text-base leading-relaxed">
                {value.description}
              </p>
            </div>
          ))}
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
              {TIMELINE.map((item, i) => (
                <div key={`${item.year}-${i}`} className="flex gap-8 items-start">
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

      {/* Executive Team */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            Leadership
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            Executive team
          </h2>
          <p className="text-text-gray text-base mt-3 max-w-xl leading-relaxed">
            The people driving Sliquid's mission of clean, body-safe intimacy
            wellness for every body, everywhere.
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
                  alt={exec.imageAlt}
                  loading="lazy"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="w-full h-full object-cover object-top"
                />
              </div>
              <p className="text-text-dark font-semibold text-base leading-tight">
                {exec.name}
              </p>
              <p className="text-text-gray text-sm mt-1 leading-snug">
                {exec.title}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* B2B CTA */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6 text-center">
          <h2 className="text-text-dark text-[32px] font-semibold mb-4">
            Ready to become a Sliquid partner?
          </h2>
          <p className="text-text-gray text-base max-w-xl mx-auto leading-relaxed mb-8">
            Whether you are a retailer, healthcare provider, or global
            distributor, our B2B team is ready to build a partnership that
            works for your business.
          </p>
          <a
            href="/contact"
            className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                       text-white font-semibold px-8 py-3.5 rounded-lg text-[15px] transition-colors duration-150"
          >
            Get in touch
          </a>
        </div>
      </div>
    </div>
  )
}
