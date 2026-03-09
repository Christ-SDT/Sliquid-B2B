import type { TopBarLink, NavLink, StrategyCard, StatItem, Brand, NewsArticle, Executive } from '@/types'

export const TOP_BAR_LINKS: readonly TopBarLink[] = [
  { label: 'Sliquid Retail', href: 'https://sliquid.com', external: true },
  { label: 'RIDE Lube', href: 'https://ridebodyworx.com', external: true },
  { label: 'Partner Login', href: '/partner-login', highlighted: true },
] as const

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Our Brands', href: '/our-brands' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'About Us', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const

export const STRATEGY_CARDS: readonly StrategyCard[] = [
  {
    id: 'retailers',
    title: 'Retailers',
    description:
      'Get wholesale solutions and displays that deliver high sell-through rates and improved customer satisfaction.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Organics-Natural-Group.png',
    imageAlt: 'Sliquid Organics Natural lubricant collection on a clean surface',
    linkHref: '/contact?type=retailer',
    linkLabel: 'See our catalog',
  },
  {
    id: 'health-practitioners',
    title: 'Health Practitioners',
    description:
      'Recommend body-safe, glycerin-free lubricants that align with pelvic health and wellness plans.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Master-Soothe-Group-w-reflections.png',
    imageAlt: 'Sliquid Soothe intimate wellness product group with reflections',
    linkHref: '/contact?type=practitioner',
    linkLabel: 'View formulations',
  },
  {
    id: 'global-distributors',
    title: 'Global Distributors',
    description:
      'Collaborate to develop logistics strategies that meet the goals of our mutual clients worldwide.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/RideRocco-WaterBased-Group.png',
    imageAlt: 'RIDE Lube water-based lubricant product lineup',
    linkHref: '/contact?type=distributor',
    linkLabel: 'Partner with us',
  },
] as const

export const STATS: readonly StatItem[] = [
  { value: '20+', label: 'Years defining the standard for clean intimacy products.' },
  { value: '100+', label: 'SKUs formulated for every body type and sensitivity.' },
  { value: '50+', label: 'Countries reached through our distribution network.' },
  { value: '1M+', label: 'Customers who trust Sliquid for body-safe wellness.' },
] as const

export const BRANDS: readonly Brand[] = [
  {
    id: 'sliquid',
    name: 'Sliquid',
    tagline: 'The original body-safe intimacy brand',
    description:
      'Sliquid pioneered clean intimate wellness starting in 2002. Every formula is glycerin-free, paraben-free, and crafted with body-safe ingredients — from the bestselling H2O water-based lubricant to the USDA-certified Organics line. With 100+ SKUs spanning lubricants, cleansers, and massage oils, Sliquid is the trusted standard for retailers and healthcare practitioners worldwide.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Silver-Studio-Collection.png',
    imageAlt: 'Sliquid Silver studio collection of body-safe lubricants',
    siteUrl: 'https://sliquid.com',
  },
  {
    id: 'ride-lube',
    name: 'RIDE Lube',
    tagline: 'High performance products for men',
    description:
      'RIDE Lube is built for performance. The lineup — water-based, silicone, hybrid, and specialty formulas — is engineered for thickness, slipperiness, and endurance with ingredients chosen for sensitive skin. Inclusive by design, RIDE Lube serves a broad audience including the LGBTQ+ community and features the Buck Angel T-Collection developed specifically for transgender individuals. A high-velocity SKU for adult retailers seeking a loyal, performance-driven customer base.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/Master_RIDE-LUBE-WATERBASEDGROUP-1000x1000-1.jpg',
    imageAlt: 'RIDE Lube water-based lubricant product group',
    siteUrl: 'https://ridelube.com',
  },
  {
    id: 'ride-rocco',
    name: 'Ride Rocco',
    tagline: 'The gold standard of lube',
    description:
      'Developed in partnership with adult industry icon Rocco Steele, Ride Rocco is a premium lubricant collection that demands shelf presence. Water-based, silicone, and the unique Seed hybrid formula deliver the long-lasting endurance Rocco\'s audience expects, all manufactured to the same body-safe standards as RIDE Lube. The co-branded packaging drives impulse purchase and connects with a dedicated, passionate fan base that follows Rocco across platforms.',
    imageUrl:
      'https://sliquid.com/wp-content/uploads/2025/03/RideRocco-WaterBased-Group.png',
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
      "CEO Cynthia Elliott shares her vision for Sliquid's next chapter — a wellness-forward brand built on the foundation Dean created, designed for a world that is finally ready for honest conversations about intimate health.",
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

// Sliquid product image constants used directly in section components
export const IMG_HERO = '/images/semi-finalv2-sliquidb2b.png'
export const IMG_BRANDS_HERO =
  'https://sliquid.com/wp-content/uploads/2025/03/H2OGroup-850x850-1.webp'
export const IMG_CEO =
  'https://sliquid.com/wp-content/uploads/2025/10/c4ocr69L_400x400.jpg'
