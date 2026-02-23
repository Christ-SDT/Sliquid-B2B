import { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { sanitizeText } from '@/utils/sanitize'
import { NAV_LINKS } from '@/utils/constants'

function DropletLogo() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M16 3C16 3 5 14.5 5 20.5a11 11 0 0022 0C27 14.5 16 3 16 3z"
        fill="#00AEEF"
      />
      <path
        d="M16 8C16 8 10 16 10 20.5a6 6 0 0012 0C22 16 16 8 16 8z"
        fill="white"
        fillOpacity="0.3"
      />
    </svg>
  )
}

export default function Header() {
  const [searchQuery, setSearchQuery] = useState('')
  const [mobileOpen, setMobileOpen] = useState(false)

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(sanitizeText(e.target.value))
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    const clean = sanitizeText(searchQuery)
    if (clean.length > 0) {
      window.location.href = `/insights?q=${encodeURIComponent(clean)}`
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-gray-100 shadow-sm">
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="flex items-center justify-between h-16 md:h-20">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-center gap-2.5 flex-shrink-0"
            aria-label="Sliquid HQ home"
          >
            <DropletLogo />
            <span className="text-xl font-bold tracking-widest text-text-dark leading-none">
              <strong>SLIQUID</strong>{' '}
              <span className="font-normal text-text-gray">HQ</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8" aria-label="Main navigation">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.href}
                to={link.href}
                className={({ isActive }) =>
                  `text-[15px] font-medium transition-colors duration-150 ${
                    isActive
                      ? 'text-sliquid-blue'
                      : 'text-text-dark hover:text-sliquid-blue'
                  }`
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Search + mobile toggle */}
          <div className="flex items-center gap-3">
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center"
              role="search"
            >
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search"
                  maxLength={100}
                  autoComplete="off"
                  aria-label="Search"
                  className="w-[200px] pl-10 pr-4 py-2 text-sm border border-gray-200 rounded-full
                             focus:outline-none focus:ring-2 focus:ring-sliquid-blue focus:border-transparent
                             bg-bg-off-white text-text-dark placeholder:text-text-light-gray"
                />
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light-gray pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </form>

            {/* Mobile hamburger */}
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="md:hidden p-2 rounded-md text-text-gray hover:text-sliquid-blue
                         focus:outline-none focus:ring-2 focus:ring-sliquid-blue"
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              aria-controls="mobile-nav"
            >
              {mobileOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <nav
            id="mobile-nav"
            className="md:hidden pb-4 pt-2 border-t border-gray-100"
            aria-label="Mobile navigation"
          >
            <ul className="space-y-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <NavLink
                    to={link.href}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `block px-3 py-2.5 text-sm font-medium rounded-lg transition-colors duration-150 ${
                        isActive
                          ? 'text-sliquid-blue bg-bg-light-blue'
                          : 'text-text-gray hover:text-sliquid-blue hover:bg-bg-off-white'
                      }`
                    }
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>

            {/* Mobile search */}
            <form onSubmit={handleSearchSubmit} className="mt-3 px-3" role="search">
              <div className="relative">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  placeholder="Search"
                  maxLength={100}
                  autoComplete="off"
                  aria-label="Search"
                  className="w-full pl-10 pr-4 py-2.5 text-sm border border-gray-200 rounded-full
                             focus:outline-none focus:ring-2 focus:ring-sliquid-blue bg-bg-off-white"
                />
                <svg
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-light-gray pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              </div>
            </form>
          </nav>
        )}
      </div>
    </header>
  )
}
