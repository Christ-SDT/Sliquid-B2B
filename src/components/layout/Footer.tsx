import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { NAV_LINKS, TOP_BAR_LINKS } from '@/utils/constants'


export default function Footer() {
  const year = new Date().getFullYear()
  const { t } = useTranslation()

  return (
    <footer className="bg-footer text-gray-300">
      <div className="max-w-[1240px] mx-auto px-6 pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-16">
          {/* Col 1: Brand */}
          <div className="space-y-5 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <img
                src="/images/cropped-lotus.png"
                alt={t('footer.logoAlt')}
                width="28"
                height="28"
                className="w-7 h-7 object-contain"
              />
              <span className="text-white font-bold tracking-widest text-xl">
                <strong>SLIQUID</strong>{' '}
                <span className="font-normal text-gray-400">HQ</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-sm text-gray-400">
              {t('footer.tagline')}
            </p>
          </div>

          {/* Col 2: Quick Links */}
          <div>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              {t('footer.quickLinks')}
            </h3>
            <ul className="space-y-3">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    to={link.href}
                    className="text-sm text-gray-400 hover:text-white transition-colors duration-150"
                  >
                    {link.labelKey ? t(`nav.${link.labelKey}`) : link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link to="/catalog" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  {t('nav.productCatalog')}
                </Link>
              </li>
              <li>
                <Link to="/health-practitioners" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  {t('nav.healthPractitioners')}
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Other Sites + Contact CTA */}
          <div>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              {t('footer.otherSites')}
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
                    {link.labelKey ? t(`nav.${link.labelKey}`) : link.label}
                  </a>
                </li>
              ))}
            </ul>
            <h3 className="text-white text-sm font-bold uppercase tracking-wider mb-5">
              {t('footer.contactHeading')}
            </h3>
            <ul className="space-y-3 mb-5">
              <li>
                <Link to="/about" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  {t('footer.about')}
                </Link>
              </li>
              <li>
                <Link to="/contact" className="text-sm text-gray-400 hover:text-white transition-colors duration-150">
                  {t('footer.careers')}
                </Link>
              </li>
            </ul>
            <Link
              to="/contact"
              className="inline-block bg-sliquid-blue hover:bg-sliquid-dark-blue text-white
                         text-sm font-semibold px-5 py-2.5 rounded-lg transition-colors duration-150
                         text-center"
            >
              {t('footer.contactUs')}
            </Link>
          </div>
        </div>

        {/* Bottom bar */}
        {/* text-gray-400 (was gray-500, 3.04:1 on this bg — below the 4.5:1 AA floor for normal text) */}
        <div className="border-t border-gray-700 pt-8 flex flex-col sm:flex-row justify-between
                        items-center gap-4 text-xs text-gray-400">
          <p>{t('footer.copyright', { year })}</p>
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link to="/accessibility" className="hover:text-gray-300 transition-colors">
              {t('footer.accessibility')}
            </Link>
            <Link to="/data-rights" className="hover:text-gray-300 transition-colors">
              {t('footer.dataRights')}
            </Link>
            <Link to="/privacy-policy" className="hover:text-gray-300 transition-colors">
              {t('footer.privacy')}
            </Link>
            <Link to="/terms" className="hover:text-gray-300 transition-colors">
              {t('footer.terms')}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
