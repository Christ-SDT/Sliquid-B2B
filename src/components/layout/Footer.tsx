import { Link } from 'react-router-dom'
import { NAV_LINKS, TOP_BAR_LINKS } from '@/utils/constants'

function DropletLogo() {
  return (
    <svg width="28" height="28" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path
        d="M16 3C16 3 5 14.5 5 20.5a11 11 0 0022 0C27 14.5 16 3 16 3z"
        fill="#0A84C0"
      />
    </svg>
  )
}

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="bg-footer text-gray-300">
      <div className="max-w-[1240px] mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-16">
          {/* Col 1: Brand */}
          <div className="space-y-5 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <DropletLogo />
              <span className="text-white font-bold tracking-widest text-xl">
                <strong>SLIQUID</strong>{' '}
                <span className="font-normal text-gray-400">HQ</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-sm text-gray-400">
              Healthier happens together™ — Sliquid Business is dedicated to
              providing the cleanest, safest intimacy products to retailers and
              healthcare providers worldwide.
            </p>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              Quick Links
            </h3>
            <ul className="space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors duration-150"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3: Other Sites + Contact CTA */}
          <div>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              Other Sites
            </h3>
            <ul className="space-y-3 mb-6">
              {TOP_BAR_LINKS.filter((l) => l.external === true).map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    rel="noopener noreferrer"
                    target="_blank"
                    className="text-sm text-gray-400 hover:text-white transition-colors duration-150"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              Contact
            </h3>
            <ul className="space-y-3 mb-5">
              <li>
                <Link to="/about" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  Careers
                </Link>
              </li>
            </ul>
            <Link
              to="/contact"
              className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white
                         text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors duration-150
                         text-center"
            >
              Contact Us ›
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-700 pt-8 flex flex-col sm:flex-row justify-between
                        items-center gap-4 text-xs text-gray-500">
          <p>Copyright © {year} Sliquid, LLC. All rights reserved.</p>
          <div className="flex gap-5">
            <Link to="/accessibility" className="hover:text-gray-300 transition-colors">
              Accessibility
            </Link>
            <Link to="/privacy" className="hover:text-gray-300 transition-colors">
              Privacy Policy
            </Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">
              Terms of Use
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
