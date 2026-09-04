import { Outlet, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import TopBar from './TopBar'
import Header from './Header'
import Footer from './Footer'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { getDefaultTitle } from '@/utils/pageTitles'

export default function Layout() {
  const { pathname } = useLocation()

  // Route-level default; AnnouncementDetailPage and NotFoundPage override this
  // with a more specific title once they know what they're rendering.
  useDocumentTitle(getDefaultTitle(pathname))

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [pathname])

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <TopBar />
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
