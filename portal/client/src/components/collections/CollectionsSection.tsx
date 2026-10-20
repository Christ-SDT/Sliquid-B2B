import { useTranslation } from 'react-i18next'
import { Images, Clock, EyeOff, CheckCircle2 } from 'lucide-react'
import type { AssetCollection } from '@/types'
import { formatDateTime } from '@/lib/utils'
import { displayBrand, isNewCollection } from './shared'
import { FOCUS_RING } from './Dialog'

/** Admin/Legal-only status chip — admin UI stays English. */
export function CollectionStatusChip({ collection }: { collection: AssetCollection }) {
  if (collection.status === 'released') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-600 text-white">
        <CheckCircle2 className="w-3 h-3" aria-hidden="true" /> Released
      </span>
    )
  }
  if (collection.status === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-600 text-white">
        <Clock className="w-3 h-3" aria-hidden="true" /> Scheduled for {formatDateTime(collection.release_at)}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-600 text-white">
      <EyeOff className="w-3 h-3" aria-hidden="true" /> Draft
    </span>
  )
}

interface Props {
  collections: AssetCollection[]
  /** Admin/Legal: show the status chip on every card. */
  showStatus: boolean
  onOpen: (c: AssetCollection) => void
}

export default function CollectionsSection({ collections, showStatus, onOpen }: Props) {
  const { t } = useTranslation('assets')
  if (collections.length === 0) return null

  return (
    <section aria-labelledby="collections-heading" className="bg-surface border border-portal-border rounded-2xl p-4 sm:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-portal-accent/10 flex items-center justify-center flex-shrink-0">
          <Images className="w-4 h-4 text-portal-accent" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id="collections-heading" className="text-on-canvas font-semibold text-sm">{t('collections.title')}</h2>
          <p className="text-on-canvas-muted text-xs mt-0.5">{t('collections.subtitle')}</p>
        </div>
      </div>

      <ul className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {collections.map(c => {
          const isNew = isNewCollection(c)
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onOpen(c)}
                aria-label={t('collections.open', { name: c.name })}
                className={`group w-full text-left bg-portal-bg border border-portal-border rounded-xl overflow-hidden
                            hover:border-portal-accent/50 transition-colors ${FOCUS_RING}`}
              >
                <div className="relative aspect-[4/3] bg-surface-elevated">
                  {c.cover_url ? (
                    <img
                      src={c.cover_url}
                      alt=""
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Images className="w-10 h-10 text-on-canvas-muted opacity-40" aria-hidden="true" />
                    </div>
                  )}
                  {isNew && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-portal-accent text-white text-[11px] font-semibold shadow">
                      {t('collections.new')}
                    </span>
                  )}
                </div>
                <div className="p-3 space-y-1">
                  <p className="text-on-canvas text-sm font-semibold leading-snug line-clamp-2 break-words">{c.name}</p>
                  <p className="text-on-canvas-muted text-xs">
                    <span className="text-portal-accent font-medium">{displayBrand(c.brand)}</span>
                    <span aria-hidden="true"> · </span>
                    {t('collections.photos', { count: c.photo_count })}
                  </p>
                  {showStatus && <div className="pt-1"><CollectionStatusChip collection={c} /></div>}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
