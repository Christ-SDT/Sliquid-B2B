import type { TopBarLink, NavLink, StrategyCard, StatItem, Brand, NewsArticle } from '@/types'

export const TOP_BAR_LINKS: readonly TopBarLink[] = [
  { label: 'Sliquid Retail', href: 'https://sliquid.com', external: true },
  { label: 'Ride BodyWorx', href: 'https://ridebodyworx.com', external: true },
  { label: 'Partner Login', href: '/partner-login', highlighted: true },
] as const

export const NAV_LINKS: readonly NavLink[] = [
  { label: 'Our Brands', href: '/our-brands' },
  { label: 'Ingredients', href: '/ingredients' },
  { label: 'About Us', href: '/about' },
  { label: 'Insights', href: '/insights' },
  { label: 'Contact', href: '/contact' },
] as const

export const STRATEGY_CARDS: readonly StrategyCard[] = [
  {
    id: 'retailers',
    title: 'Retailers',
    description:
      'Get wholesale solutions and displays that deliver high sell-through rates and improved customer satisfaction.',
    imageUrl:
      'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=600&q=80',
    imageAlt: 'Modern retail storefront with wellness products on display',
    linkHref: '/contact?type=retailer',
    linkLabel: 'See our catalog',
  },
  {
    id: 'health-practitioners',
    title: 'Health Practitioners',
    description:
      'Recommend body-safe, glycerin-free lubricants that align with pelvic health and wellness plans.',
    imageUrl:
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=600&q=80',
    imageAlt: 'Healthcare professional in a consultation setting',
    linkHref: '/contact?type=practitioner',
    linkLabel: 'View formulations',
  },
  {
    id: 'global-distributors',
    title: 'Global Distributors',
    description:
      'Collaborate to develop logistics strategies that meet the goals of our mutual clients worldwide.',
    imageUrl:
      'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&q=80',
    imageAlt: 'Global warehouse and logistics distribution center',
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
    imageUrl:
      'https://images.unsplash.com/photo-1556228578-567ba127e37f?w=800&q=80',
    imageAlt: 'Sliquid product collection on a clean white surface',
    siteUrl: 'https://sliquid.com',
  },
  {
    id: 'ride-bodyworx',
    name: 'Ride BodyWorx',
    tagline: 'Performance lubricants & men\'s care',
    imageUrl:
      'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800&q=80',
    imageAlt: 'Ride BodyWorx masculine product lineup',
    siteUrl: 'https://ridebodyworx.com',
  },
] as const

export const FEATURED_NEWS: readonly NewsArticle[] = [
  {
    id: 'news-1',
    title: 'Sliquid Expands European Distribution Network',
    excerpt:
      'Sliquid HQ announces a major distribution partnership expanding access to premium intimacy wellness products across 12 new European markets.',
    category: 'Distribution',
    date: '2025-11-20',
    imageUrl:
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&q=80',
    imageAlt: 'Aerial view of a European city skyline at dusk',
    href: '/insights/european-distribution',
    featured: true,
  },
  {
    id: 'news-2',
    title: 'New pH-Balanced Formula Line Launches Q1',
    excerpt:
      'Expanding the natural collection with six new pH-optimized personal care products.',
    category: 'Product News',
    date: '2025-10-15',
    imageUrl:
      'https://images.unsplash.com/photo-1631390108073-f94e7b7bb69b?w=400&q=80',
    imageAlt: 'Clean laboratory with glass bottles and formulation equipment',
    href: '/insights/ph-balanced-launch',
  },
  {
    id: 'news-3',
    title: 'Sliquid Named Top Wellness Brand 2025',
    excerpt:
      'Independent industry survey places Sliquid in the top three intimacy wellness brands globally.',
    category: 'Awards',
    date: '2025-09-08',
    imageUrl:
      'https://images.unsplash.com/photo-1552664730-d307ca884978?w=400&q=80',
    imageAlt: 'Award trophy on a podium with soft lighting',
    href: '/insights/top-wellness-brand',
  },
  {
    id: 'news-4',
    title: 'B2B Partner Portal Upgrade Goes Live',
    excerpt:
      'The revamped partner portal brings real-time inventory, order tracking, and enhanced analytics.',
    category: 'Platform',
    date: '2025-08-22',
    imageUrl:
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400&q=80',
    imageAlt: 'Analytics dashboard on a laptop screen',
    href: '/insights/portal-upgrade',
  },
] as const

// Unsplash image constants used directly in section components
export const IMG_HERO =
  'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=1920&q=85'
export const IMG_BRANDS_HERO =
  'https://images.unsplash.com/photo-1556228578-567ba127e37f?w=1600&q=80'
export const IMG_CEO =
  'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=400&q=80'
