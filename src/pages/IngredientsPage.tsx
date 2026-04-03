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
    id: 'Made in the USA',
    icon: '🇺🇸',
    title: 'Made in the USA',
    description:
      'Every Sliquid product is formulated and manufactured domestically, ensuring consistent quality and oversight from start to finish.',
  },
  {
    id: 'transparent',
    icon: '🔍',
    title: 'Full Transparency',
    description:
      'Every ingredient in every formula is disclosed. No hidden fragrances, no mystery compounds.',
  },
]

const KEY_INGREDIENTS = [
  {
    id: 'purified-water',
    name: 'Purified Water',
    tag: 'Base',
    description:
      'The foundation of all water-based formulas. Triple-filtered and deionized — it makes up 96% of Naturals H2O and serves as the pure, contaminant-free carrier for every water-soluble formula.',
  },
  {
    id: 'aloe-vera',
    name: 'Organic Aloe Barbadensis Leaf Juice',
    tag: 'Soothing Base',
    description:
      'The base ingredient for the Organics line, sourced directly from the leaves of the aloe vera plant. Naturally lubricating and healing, it has been used for centuries to soothe and protect skin. Anti-inflammatory and pH-friendly for sensitive tissue.',
  },
  {
    id: 'plant-cellulose',
    name: 'Plant Cellulose',
    tag: 'Thickener — Naturals H2O',
    description:
      'Derived from cotton, plant cellulose is a natural, vegan-friendly, and gluten-free thickening agent. It gives Naturals H2O its signature silky glide and smooth consistency without synthetic polymers.',
  },
  {
    id: 'agar-agar',
    name: 'Organic Agar Agar',
    tag: 'Thickener — Organics',
    description:
      'Sourced from red algae, Agar Agar is a naturally occurring plant-based material used to create the body and thickness of the Organics Natural lubricant. A clean, seaweed-derived alternative to synthetic gelling agents.',
  },
  {
    id: 'guar-gum',
    name: 'Organic Guar Gum (Cyamopsis)',
    tag: 'Formula Stabilizer',
    description:
      'Derived from the guar bean, this non-toxic natural additive enables plant cellulose fiber to move and feel incredibly slippery while stabilizing the overall formula. Used in both the Naturals and Organics lines to condition texture and improve glide.',
  },
  {
    id: 'vitamin-e',
    name: 'Natural Tocopherols (Vitamin E)',
    tag: 'Antioxidant',
    description:
      'A natural skin moisturizer and powerful antioxidant. Conditions skin, extends shelf life without synthetic preservatives, and provides a subtle protective barrier for sensitive mucosal tissue.',
  },
  {
    id: 'flax-extract',
    name: 'Organic Flax Extract',
    tag: 'Organics Line',
    description:
      'Used in Sliquid Organics formulas as a plant-derived moisturizer and restorative emollient. Rich in omega fatty acids, it helps restore skin elasticity and supports long-lasting hydration.',
  },
  {
    id: 'hibiscus',
    name: 'Organic Hibiscus Extract',
    tag: 'Emollient — Organics',
    description:
      'Added to Sliquid Organics as a restorative and healing emollient. Hibiscus is known to restore elasticity and suppleness to the skin, making it especially beneficial for sensitive or irritated tissue.',
  },
  {
    id: 'green-tea',
    name: 'Organic Green Tea Extract',
    tag: 'Anti-Inflammatory — Organics',
    description:
      'A botanical anti-inflammatory included in the Organics Natural formula. Green tea extract helps calm irritation and provides antioxidant support, further protecting sensitive skin from environmental stressors.',
  },
  {
    id: 'sunflower-seed',
    name: 'Organic Sunflower Seed Extract',
    tag: 'Skin Tonic — Organics',
    description:
      'Used in Sliquid Organics as a gentle cleansing and calming tonic. Sunflower seed extract is rich in vitamins and fatty acids that nourish and soothe skin without disrupting the natural barrier.',
  },
  {
    id: 'citric-acid',
    name: 'Citric Acid',
    tag: 'pH Balancer',
    description:
      'A mild organic acid derived from citrus fruits, used to calibrate the pH of every formula to match the body\'s natural range. Functions as a natural antiseptic and pH buffer, and works in concert with potassium sorbate to safely extend shelf life. Used across all Sliquid lines.',
  },
  {
    id: 'potassium-sorbate',
    name: 'Potassium Sorbate & Sodium Benzoate',
    tag: 'Preservative',
    description:
      'The gentlest, most body-safe, non-toxic, non-irritating preservatives available for intimate products. Used together to extend shelf life, prevent contamination, and fight unwanted bacteria and mold — keeping formulas safer for women without the risks of parabens.',
  },
  {
    id: 'dimethicone',
    name: 'Dimethicone',
    tag: 'Silicone Base',
    description:
      'The primary base in silicone formulas. Inert, non-absorbable, and hypoallergenic — it provides ultra-long-lasting glide without water absorption. Compatible with latex, not with silicone toys.',
  },
]

const AVOIDED_INGREDIENTS = [
  {
    id: 'glycerin',
    name: 'Glycerin',
    reason:
      'A sugar alcohol that can feed Candida yeast and disrupt the vaginal microbiome, increasing the risk of yeast infections. Present in the majority of mass-market lubricants — and absent from every Sliquid formula.',
  },
  {
    id: 'parabens',
    name: 'Parabens',
    reason:
      'Synthetic preservatives (methylparaben, propylparaben, etc.) that act as xenoestrogens — mimicking estrogen in the body. Linked to hormonal disruption and found in breast tumor tissue in multiple studies.',
  },
  {
    id: 'propylene-glycol',
    name: 'Propylene Glycol',
    reason:
      'A common solvent and humectant that can cause contact dermatitis and irritation in sensitive individuals. Frequently found in budget lubricants as a cheap glycerin substitute.',
  },
  {
    id: 'nonoxynol-9',
    name: 'Nonoxynol-9',
    reason:
      'A spermicidal surfactant that strips away the vaginal epithelium with repeated use, increasing susceptibility to STIs. Once standard in "safe sex" lubricants — now widely contraindicated by healthcare providers.',
  },
  {
    id: 'benzocaine',
    name: 'Benzocaine / Numbing Agents',
    reason:
      'Topical anesthetics mask pain signals that exist to protect tissue from injury. Sliquid does not use desensitizing agents in formulas intended for general intimate use.',
  },
  {
    id: 'artificial-fragrance',
    name: 'Artificial Fragrance',
    reason:
      '"Fragrance" on an ingredient label can legally represent hundreds of undisclosed chemicals. Many are known allergens and endocrine disruptors. Sliquid uses no artificial fragrances in any formula.',
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

      {/* Key Ingredients */}
      <div className="max-w-[1240px] mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-sliquid-blue font-semibold text-sm uppercase tracking-wider mb-2">
            What's Inside
          </p>
          <h2 className="text-text-dark text-[32px] font-semibold">
            Key ingredients we use
          </h2>
          <p className="text-text-gray text-base mt-3 max-w-2xl leading-relaxed">
            Every ingredient is selected for a reason. Here is a breakdown of
            the core components across our formula families and what they do.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {KEY_INGREDIENTS.map((ing) => (
            <div
              key={ing.id}
              className="border border-gray-100 rounded-card p-7 bg-white hover:border-sliquid-blue
                         transition-colors duration-150"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className="text-text-dark text-lg font-semibold">
                  {ing.name}
                </h3>
                <span className="flex-shrink-0 bg-bg-light-blue text-sliquid-blue text-xs font-semibold
                                  px-2.5 py-1 rounded-full">
                  {ing.tag}
                </span>
              </div>
              <p className="text-text-gray text-sm leading-relaxed">
                {ing.description}
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
              Our Hard Nos
            </p>
            <h2 className="text-text-dark text-[32px] font-semibold">
              Ingredients we never use — and why
            </h2>
            <p className="text-text-gray text-base mt-3 max-w-2xl leading-relaxed">
              Knowing what is not in a product is just as important as knowing
              what is. These are the ingredients most commonly found in
              competitor formulas that Sliquid has rejected since day one.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {AVOIDED_INGREDIENTS.map((ing) => (
              <div
                key={ing.id}
                className="bg-white rounded-card p-7 border-l-4 border-red-400"
              >
                <h3 className="text-text-dark text-lg font-semibold mb-3">
                  {ing.name}
                </h3>
                <p className="text-text-gray text-sm leading-relaxed">
                  {ing.reason}
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
              Need help matching formulas to your customers?
            </h2>
            <p className="text-text-gray text-base leading-relaxed">
              Our B2B team can walk you through the full product matrix —
              water-based, silicone, hybrid, and organic — and recommend the
              right SKUs for your specific retail or clinical context.
            </p>
          </div>
          <a
            href="/contact"
            className="flex-shrink-0 inline-flex items-center justify-center bg-sliquid-blue
                       hover:bg-sliquid-dark-blue text-white font-semibold px-8 py-3.5
                       rounded-lg text-[15px] transition-colors duration-150"
          >
            Talk to our team
          </a>
        </div>
      </div>
    </div>
  )
}
