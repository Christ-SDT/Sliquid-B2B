import { Link } from 'react-router-dom'
import { TOP_BAR_LINKS } from '@/utils/constants'
import type { TopBarLink } from '@/types'

function TopBarItem({ link }: { link: TopBarLink }) {
  const cls = `text-sm font-medium transition-colors duration-150 ${
    link.highlighted
      ? 'text-sliquid-blue font-semibold'
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
      <div className="max-w-[1240px] mx-auto px-6 flex justify-end gap-6">
        {TOP_BAR_LINKS.map((link) => (
          <TopBarItem key={link.href} link={link} />
        ))}
      </div>
    </div>
  )
}
