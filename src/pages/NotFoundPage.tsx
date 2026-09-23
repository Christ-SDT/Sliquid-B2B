import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

export default function NotFoundPage() {
  const { t } = useTranslation()
  useDocumentTitle(t('titles.notFound'))

  return (
    <div className="min-h-[70vh] flex items-center justify-center">
      <div className="text-center space-y-4 px-6">
        <p className="text-sliquid-blue font-extrabold text-7xl">404</p>
        <h1 className="text-text-dark text-2xl font-bold">{t('notFound.heading')}</h1>
        <p className="text-text-gray max-w-xs mx-auto">
          {t('notFound.body')}
        </p>
        <Link
          to="/"
          className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                     text-white font-semibold px-7 py-3 rounded-lg text-sm transition-colors duration-150"
        >
          {t('notFound.backHome')}
        </Link>
      </div>
    </div>
  )
}
