import type { TopBarLink, NavLink, StrategyCard, StatItem, Brand, NewsArticle, Executive } from '@/types'

export const TOP_BAR_LINKS: readonly TopBarLink[] = [
  { label: 'Sliquid Retail', href: 'https://sliquid.com', external: true },
  { label: 'RIDE Lube', href: 'https://ridelube.com/', external: true },
  { label: 'Partner Portal', labelKey: 'partnerPortal', href: '/partner-login', highlighted: true },
] as const

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Our Brands', labelKey: 'ourBrands', href: '/our-brands' },
  { label: 'Ingredients', labelKey: 'ingredients', href: '/ingredients' },
  { label: 'About Us', labelKey: 'about', href: '/about' },
  { label: 'Announcements', labelKey: 'announcements', href: '/announcements' },
  { label: 'MAP Policy', labelKey: 'mapPolicy', href: '/map-policy' },
  { label: 'Contact', labelKey: 'contact', href: '/contact' },
] as const

export const STRATEGY_CARDS: readonly StrategyCard[] = [
  {
    id: 'retailers',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/2a120f2f-d045-457e-8990-f809d3606151.jpg',
    linkHref: '/catalog',
  },
  {
    id: 'health-practitioners',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/aa1ba35b-f7e9-4a07-a0f3-20b918622165.jpeg',
    linkHref: '/health-practitioners',
  },
  {
    id: 'global-distributors',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/9e502b65-1010-4628-bb3e-433525359746.jpeg',
    linkHref: '/contact?type=distributor',
  },
] as const

export const STATS: readonly StatItem[] = [
  { id: 'years', value: '20+' },
  { id: 'skus', value: '100+' },
  { id: 'customers', value: '1M+' },
  { id: 'zero', value: '0' },
] as const

export const BRANDS: readonly Brand[] = [
  {
    id: 'sliquid',
    name: 'Sliquid',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/assets/f6e32f00-e762-42f9-939b-6688b92dc20a.jpg',
    siteUrl: 'https://sliquid.com',
  },
  {
    id: 'ride-lube',
    name: 'RIDE LUBE',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/41526e2b-c50c-4068-bff8-ae34dce1148f.jpeg',
    siteUrl: 'https://ridelube.com',
  },
  {
    id: 'ride-rocco',
    name: 'RIDE ROCCO',
    imageUrl:
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/b32c470a-09df-4ef6-af3b-a298284a109c.png',
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
    imageUrl: '/images/team/cynthia-elliott.png',
  },
  {
    id: 'colin-roy',
    name: 'Colin Roy',
    imageUrl: '/images/team/colin-roy.png',
  },
  {
    id: 'michelle-marcus',
    name: 'Michelle Marcus',
    imageUrl: '/images/team/michelle-marcus.jpg',
  },
  {
    id: 'erik-vasquez',
    name: 'Erik Vasquez',
    imageUrl: '/images/team/erik-vasquez.png',
  },
] as const

/**
 * Point-of-contact choices on the hidden /retailer-check-in form.
 *
 * Kept here rather than inline in the page so staff changes are a one-line edit
 * in one file. The two non-person options are deliberate: a retailer who bought
 * through a distributor often has never spoken to anyone at Sliquid, and
 * forcing them to pick a name they don't recognise routes the lead wrongly.
 */
export const RETAILER_CONTACTS: readonly string[] = [
  'Michelle Marcus — VP of Sales',
  'Colin Roy — Senior Vice President',
  'Erik Vasquez — VP of Marketing',
  'My distributor rep',
  "Not sure / I don't have one",
] as const

// ─── EmailJS configuration ────────────────────────────────────────────────────
export const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined
export const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined
export const EMAILJS_CONTACT_ADMIN_TID = import.meta.env.VITE_EMAILJS_CONTACT_ADMIN_TID as string | undefined
export const EMAILJS_CONTACT_REPLY_TID = import.meta.env.VITE_EMAILJS_CONTACT_REPLY_TID as string | undefined
export const EMAILJS_NEWSLETTER_TID = import.meta.env.VITE_EMAILJS_NEWSLETTER_TID as string | undefined
export const EMAILJS_HP_TID = import.meta.env.VITE_EMAILJS_HP_TID as string | undefined
export const EMAILJS_RETAILER_ADMIN_TID = import.meta.env.VITE_EMAILJS_RETAILER_ADMIN_TID as string | undefined
export const EMAILJS_RETAILER_CONFIRM_TID = import.meta.env.VITE_EMAILJS_RETAILER_CONFIRM_TID as string | undefined

// Sliquid product image constants used directly in section components
export const IMG_HERO = '/images/semi-finalv2-sliquidb2b.png'
export const IMG_BRANDS_HERO =
  'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/ai-images/1/a0db976e-7593-4a93-b0e2-6adfedd2179c.png'
export const IMG_CEO =
  'https://sliquid.com/wp-content/uploads/2025/10/c4ocr69L_400x400.jpg'

/**
 * Base URL of the portal API (Railway). New code should import this rather than
 * redeclaring it — eight existing pages each define their own copy, and four of
 * them read VITE_PORTAL_API_URL (which .env.example does not document) while the
 * rest read VITE_API_URL.
 *
 * Note the marketing site's CSP `connect-src` allowlists only this host, so the
 * browser cannot call WordPress directly — announcements must come via the API.
 */
export const API_BASE =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  (import.meta.env.VITE_PORTAL_API_URL as string | undefined) ??
  'https://sliquid-b2b-production.up.railway.app'
