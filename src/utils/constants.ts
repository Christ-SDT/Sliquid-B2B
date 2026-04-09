import type { TopBarLink, NavLink, StrategyCard, StatItem, Brand, NewsArticle, Executive } from '@/types'

export const TOP_BAR_LINKS: readonly TopBarLink[] = [
  { label: 'Sliquid Retail', href: 'https://sliquid.com', external: true },
  { label: 'RIDE Lube', href: 'https://ridelube.com/', external: true },
  { label: 'Partner Portal', href: '/partner-login', highlighted: true },
] as const

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Our Brands', href: '/our-brands' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'About Us', href: '/about' },
  { label: 'MAP Policy', href: '/map-policy' },
  { label: 'Contact', href: '/contact' },
] as const

export const STRATEGY_CARDS: readonly StrategyCard[] = [
  {
    id: 'retailers',
    title: 'Retailers',
    description:
      'Streamline your workflow, elevate your in-store and online presence, and connect directly with our marketing team so you can move faster, sell smarter, and grow with confidence.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/2a120f2f-d045-457e-8990-f809d3606151.jpg',
    imageAlt: 'Sliquid Organics Natural lubricant collection on a clean surface',
    linkHref: '/catalog',
    linkLabel: 'Browse our catalog',
  },
  {
    id: 'health-practitioners',
    title: 'Health Practitioners',
    description:
      'Support your practice with access to clinical resources, educational sheets, and patient-ready samples, designed to complement your care and help you better serve your patients.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/aa1ba35b-f7e9-4a07-a0f3-20b918622165.jpeg',
    imageAlt: 'Sliquid Soothe intimate wellness product group with reflections',
    linkHref: '/health-practitioners',
    linkLabel: 'Learn about our program',
  },
  {
    id: 'global-distributors',
    title: 'Global Distributors',
    description:
      'Equip your marketing and sales teams with ready-to-use resources to share with customers, driving stronger sell-through while strengthening collaboration with the Sliquid marketing team.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/9e502b65-1010-4628-bb3e-433525359746.jpeg',
    imageAlt: 'RIDE Lube water-based lubricant product lineup',
    linkHref: '/contact?type=distributor',
    linkLabel: 'Request more info',
  },
] as const

export const STATS: readonly StatItem[] = [
  { value: '20+', label: 'years in the industry, making it one of the few true legacy brands in intimate wellness.' },
  { value: '100+', label: 'SKUs across multiple collections, covering lubricants, bath & body, and wellness categories.' },
  { value: '1M+', label: 'Customers who trust Sliquid for body-safe wellness.' },
  { value: '0', label: 'unnecessary ingredients philosophy, formulated with 0 glycerin, 0 parabens, and 0 sugar derivatives, which is a defining differentiator in the category.' },
] as const

export const BRANDS: readonly Brand[] = [
  {
    id: 'sliquid',
    name: 'Sliquid',
    tagline: 'The original body-safe intimacy brand',
    description:
      'Sliquid has been pioneering clean intimate wellness since 2002. Every formula is glycerin-free, paraben-free, and crafted with body-safe ingredients, from the bestselling H2O water-based lubricant to our award-winning bath and body line. With 100+ SKUs spanning lubricants, cleansers, and massage oils, Sliquid is the trusted standard for retailers and healthcare practitioners worldwide.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/assets/f6e32f00-e762-42f9-939b-6688b92dc20a.jpg',
    imageAlt: 'Sliquid H2O apart of the Naturals collection of body-safe lubricants',
    siteUrl: 'https://sliquid.com',
  },
  {
    id: 'ride-lube',
    name: 'RIDE LUBE',
    tagline: 'High performance products for men',
    description:
      'RIDE Lube is engineered for performance. The lineup includes water-based, silicone, hybrid, and specialty formulas, each designed for thickness, slipperiness, and endurance using ingredients suited for sensitive skin. Inclusive by design, RIDE Lube serves a broad audience including the LGBTQ+ community and features the Buck Angel T-Collection, developed specifically for transgender individuals. A high-velocity SKU for adult retailers seeking a loyal, performance-driven customer base.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/41526e2b-c50c-4068-bff8-ae34dce1148f.jpeg',
    imageAlt: 'RIDE Lube water-based lubricant product group',
    siteUrl: 'https://ridelube.com',
  },
  {
    id: 'ride-rocco',
    name: 'RIDE ROCCO',
    tagline: 'The gold standard of lube',
    description:
      'Developed in partnership with adult industry icon Rocco Steele, Ride Rocco is a premium lubricant collection built for shelf presence. Available in water-based, silicone, and the unique Seed hybrid formula, each product delivers the long-lasting endurance Rocco\'s audience expects, all manufactured to the same body-safe standards as RIDE Lube. The co-branded packaging drives impulse purchases and connects retailers with a dedicated, passionate fan base that follows Rocco across platforms.',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/b32c470a-09df-4ef6-af3b-a298284a109c.png',
    imageAlt: 'Ride Rocco signature water-based lubricant collection',
    siteUrl: 'https://riderocco.com',
  },
] as const

export const FEATURED_NEWS: readonly NewsArticle[] = [
  {
    id: 'news-1',
    title: 'Sliquid Expands European Distribution Network',
    excerpt:
      'Sliquid HQ announces a major distribution partnership expanding access to premium intimacy wellness products across 12 new European markets — bringing our body-safe formulas to thousands of new retail and clinical locations.',
    category: 'Distribution',
    date: '2025-11-20',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Organics-Natural-Group.png',
    imageAlt: 'Sliquid Organics Natural product collection',
    href: '/insights/european-distribution',
    featured: true,
  },
  {
    id: 'news-2',
    title: 'New pH-Balanced Formula Line Launches Q1',
    excerpt:
      'Expanding the natural collection with six new pH-optimized personal care products formulated specifically for sensitive bodies and post-menopausal vaginal health.',
    category: 'Product News',
    date: '2025-10-15',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/8oz-Natural-Gel.png',
    imageAlt: 'Sliquid Organics Natural Gel 8oz bottle',
    href: '/insights/ph-balanced-launch',
  },
  {
    id: 'news-3',
    title: 'Sliquid Named Top Wellness Brand 2025',
    excerpt:
      'An independent industry survey places Sliquid in the top three intimacy wellness brands globally, citing ingredient transparency, inclusive formulation, and healthcare provider trust as key differentiators.',
    category: 'Awards',
    date: '2025-09-08',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/SilverGroupCloseUp.png',
    imageAlt: 'Sliquid Silver product collection close-up',
    href: '/insights/top-wellness-brand',
  },
  {
    id: 'news-4',
    title: 'B2B Partner Portal Upgrade Goes Live',
    excerpt:
      'The revamped partner portal brings real-time inventory visibility, streamlined order tracking, enhanced analytics dashboards, and a new merchandising asset library for retail partners.',
    category: 'Platform',
    date: '2025-08-22',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/10/Balance_Soak_Group_r.jpg',
    imageAlt: 'Sliquid Balance Soak intimate wellness product group',
    href: '/insights/portal-upgrade',
  },
  {
    id: 'news-5',
    title: 'Cynthia Elliott on Leading Through Change',
    excerpt:
      "CEO Cynthia Elliott shares her vision for Sliquid's next chapter — a wellness-forward brand built on the foundation of made by women for women.",
    category: 'Leadership',
    date: '2025-07-10',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Master-Soothe-Group-w-reflections.png',
    imageAlt: 'Sliquid Soothe product collection',
    href: '/insights/cynthia-leadership',
  },
  {
    id: 'news-6',
    title: "Why Glycerin-Free Matters: A Retailer's Guide",
    excerpt:
      'As customers become more ingredient-aware, understanding why glycerin-free formulas outperform conventional lubricants is becoming a competitive advantage for retailers who carry Sliquid.',
    category: 'Education',
    date: '2025-06-03',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Organics-Natural-Gel-group.png',
    imageAlt: 'Sliquid Organics Natural Gel product group',
    href: '/insights/glycerin-free-guide',
  },
] as const

export const EXECUTIVES: readonly Executive[] = [
  {
    id: 'cynthia-elliott',
    name: 'Cynthia Elliott',
    title: 'Co-Founder & CEO',
    imageUrl: '/images/team/cynthia-elliott.png',
    imageAlt: 'Cynthia Elliott, Co-Founder and CEO of Sliquid',
  },
  {
    id: 'colin-roy',
    name: 'Colin Roy',
    title: 'Senior Vice President',
    imageUrl: '/images/team/colin-roy.png',
    imageAlt: 'Colin Roy, Senior Vice President of Sliquid',
  },
  {
    id: 'michelle-marcus',
    name: 'Michelle Marcus',
    title: 'Vice President of Sales',
    imageUrl: '/images/team/michelle-marcus.jpg',
    imageAlt: 'Michelle Marcus, Vice President of Sales at Sliquid',
  },
  {
    id: 'erik-vasquez',
    name: 'Erik Vasquez',
    title: 'Vice President of Marketing',
    imageUrl: '/images/team/erik-vasquez.png',
    imageAlt: 'Erik Vasquez, Vice President of Marketing at Sliquid',
  },
] as const

// ─── EmailJS configuration ────────────────────────────────────────────────────
export const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined
export const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined
export const EMAILJS_CONTACT_ADMIN_TID = import.meta.env.VITE_EMAILJS_CONTACT_ADMIN_TID as string | undefined
export const EMAILJS_CONTACT_REPLY_TID = import.meta.env.VITE_EMAILJS_CONTACT_REPLY_TID as string | undefined
export const EMAILJS_NEWSLETTER_TID = import.meta.env.VITE_EMAILJS_NEWSLETTER_TID as string | undefined
export const EMAILJS_HP_TID = import.meta.env.VITE_EMAILJS_HP_TID as string | undefined

// Sliquid product image constants used directly in section components
export const IMG_HERO = '/images/semi-finalv2-sliquidb2b.png'
export const IMG_BRANDS_HERO =
  'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/ai-images/1/a0db976e-7593-4a93-b0e2-6adfedd2179c.png'
export const IMG_CEO =
  'https://sliquid.com/wp-content/uploads/2025/10/c4ocr69L_400x400.jpg'
