import { Link } from 'react-router-dom'
import { TOP_BAR_LINKS } from '@/utils/constants'
import type { TopBarLink } from '@/types'
import LanguageSwitcher from '@/components/LanguageSwitcher'

function TopBarItem({ link }: { link: TopBarLink }) {
  const cls = `text-sm font-medium transition-colors duration-150 ${
    link.highlighted
      ? 'text-sliquid-blue-on-dark font-semibold'
      : 'text-gray-400 hover:text-white'
  }`

  if (link.external === true) {
    return (
      <a
        href={link.href}
        rel="noopener noreferrer"
        target="_blank"
        className={cls}
      >
        {link.label}
      </a>
    )
  }

  return (
    <Link to={link.href} className={cls}>
      {link.label}
    </Link>
  )
}

export default function TopBar() {
  return (
    <div className="bg-footer text-white text-sm py-2.5">
      <div className="max-w-[1240px] mx-auto px-6 flex flex-wrap justify-end items-center gap-x-6 gap-y-2">
        {TOP_BAR_LINKS.map((link) => (
          <TopBarItem key={link.href} link={link} />
        ))}
        <LanguageSwitcher />
      </div>
    </div>
  )
}
