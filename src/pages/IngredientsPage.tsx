const CERTIFICATIONS = [
  {
    id: 'glycerin-free',
    icon: '🚫',
    title: 'Glycerin-Free',
    description:
      'None of our formulas contain glycerin, which can feed yeast and disrupt vaginal pH balance.',
  },
  {
    id: 'paraben-free',
    icon: '✓',
    title: 'Paraben-Free',
    description:
      'We never use parabens — a class of synthetic preservatives linked to hormonal disruption.',
  },
  {
    id: 'body-safe',
    icon: '🛡',
    title: 'Body-Safe',
    description:
      'Every formulation is pH-matched to the body and hypoallergenic tested for sensitive skin.',
  },
  {
    id: 'vegan',
    icon: '🌱',
    title: 'Vegan & Cruelty-Free',
    description:
      'No animal-derived ingredients, no animal testing — ever. All products are certified vegan.',
  },
  {
    id: 'iso',
    icon: '📋',
    title: 'ISO Certified Manufacturing',
    description:
      'Produced in an ISO 22716-certified facility following GMP guidelines for cosmetics.',
  },
  {
    id: 'transparent',
    icon: '🔍',
    title: 'Full Transparency',
    description:
      'Every ingredient in every formula is disclosed. No hidden fragrances, no mystery compounds.',
  },
]

export default function IngredientsPage() {
  return (
    <div>
      {/* Page hero */}
      <div className="bg-bg-light-blue py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            Formulation Standards
          </p>
          <h1 className="text-text-dark text-[42px] font-semibold tracking-[-0.5px] leading-tight max-w-xl">
            Ingredients you can trust
          </h1>
          <p className="text-text-gray text-lg mt-4 max-w-2xl leading-relaxed">
            We hold our formulations to a higher standard — no harmful additives,
            no shortcuts, no compromises. Here is exactly what that means.
          </p>
        </div>
      </div>

      {/* Philosophy block */}
      <div className="max-w-[1240px] mx-auto px-6 py-16">
        <div className="max-w-3xl">
          <h2 className="text-text-dark text-[32px] font-semibold mb-6">
            Our ingredient philosophy
          </h2>
          <div className="space-y-4 text-text-gray text-base leading-relaxed">
            <p>
              Sliquid was founded on the belief that intimacy products should be
              as clean and safe as any other product you put on your body. In 2002,
              that meant going against the industry norm — rejecting glycerin,
              parabens, and artificial fragrances at a time when they were
              ubiquitous.
            </p>
            <p>
              Today, our ingredient philosophy remains unchanged. We source the
              highest-quality organic and natural ingredients, submit every
              formula to rigorous testing, and disclose every component on our
              label — no exceptions.
            </p>
          </div>
        </div>
      </div>

      {/* Certifications grid */}
      <div className="bg-bg-off-white py-16">
        <div className="max-w-[1240px] mx-auto px-6">
          <h2 className="text-text-dark text-[32px] font-semibold mb-10">
            What we stand for
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {CERTIFICATIONS.map((cert) => (
              <div
                key={cert.id}
                className="bg-white rounded-card p-8 shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <div className="text-4xl mb-4" aria-hidden="true">
                  {cert.icon}
                </div>
                <h3 className="text-text-dark text-xl font-semibold mb-3">
                  {cert.title}
                </h3>
                <p className="text-text-gray text-sm leading-relaxed">
                  {cert.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
