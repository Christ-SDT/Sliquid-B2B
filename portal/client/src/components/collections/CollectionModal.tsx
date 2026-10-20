import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Download, Loader2, ChevronLeft, ChevronRight, Images, Pencil, AlertTriangle, PackageOpen } from 'lucide-react'
import { api, ApiError } from '@/api/client'
import type { AssetCollection, AssetCollectionDetail, CollectionPhoto } from '@/types'
import { formatDate, parseServerDate } from '@/lib/utils'
import Dialog, { FOCUS_RING } from './Dialog'
import { CollectionStatusChip } from './CollectionsSection'
import {
  buildCollectionZip, displayBrand, fetchPhotoFile, isNewCollection, saveBlob, zipFilename, type ZipFailure,
} from './shared'

// ─── Large preview ────────────────────────────────────────────────────────────

interface ViewerProps {
  photos: CollectionPhoto[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}

function PhotoViewer({ photos, index, onIndex, onClose }: ViewerProps) {
  const { t } = useTranslation('assets')
  const titleId = useId()
  const photo = photos[index]
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasPrev = index > 0
  const hasNext = index < photos.length - 1

  useEffect(() => { setError(null) }, [index])

  async function download() {
    setDownloading(true)
    setError(null)
    try {
      const { blob, filename } = await fetchPhotoFile(photo)
      saveBlob(blob, filename)
    } catch {
      setError(t('collections.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }

  if (!photo) return null

  return (
    <Dialog
      labelledBy={titleId}
      onClose={onClose}
      zClass="z-[70]"
      panelClassName="max-w-6xl h-[92vh] overflow-hidden"
      onKeyDown={e => {
        if (e.key === 'ArrowLeft' && hasPrev) { e.preventDefault(); onIndex(index - 1) }
        if (e.key === 'ArrowRight' && hasNext) { e.preventDefault(); onIndex(index + 1) }
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-portal-border flex-shrink-0">
        <div className="min-w-0">
          <h3 id={titleId} className="text-on-canvas text-sm font-semibold truncate">{photo.name}</h3>
          <p className="text-on-canvas-muted text-xs">
            {t('collections.photoOf', { index: index + 1, total: photos.length })}
            {photo.dimensions && <> · {photo.dimensions}</>}
            {photo.file_size && <> · {photo.file_size}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={download}
            disabled={downloading}
            className={`flex items-center gap-2 px-3 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                        text-white rounded-lg text-sm font-medium transition-colors ${FOCUS_RING}`}
          >
            {downloading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
            <span className="hidden min-[400px]:inline">{t('actions.download')}</span>
            <span className="sr-only min-[400px]:hidden">{t('actions.download')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('actions.close')}
            className={`p-2 rounded-lg text-on-canvas-muted hover:text-on-canvas ${FOCUS_RING}`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0 bg-portal-bg flex items-center justify-center">
        <img
          key={photo.id}
          src={photo.file_url}
          alt={photo.name}
          className="max-w-full max-h-full object-contain"
        />
        <button
          type="button"
          onClick={() => onIndex(index - 1)}
          disabled={!hasPrev}
          aria-label={t('collections.previous')}
          className={`absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80
                      text-white flex items-center justify-center disabled:opacity-30 ${FOCUS_RING}`}
        >
          <ChevronLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onIndex(index + 1)}
          disabled={!hasNext}
          aria-label={t('collections.next')}
          className={`absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80
                      text-white flex items-center justify-center disabled:opacity-30 ${FOCUS_RING}`}
        >
          <ChevronRight className="w-5 h-5" aria-hidden="true" />
        </button>
      </div>
      {error && (
        <p role="alert" className="px-4 py-2 text-xs text-red-500 border-t border-portal-border">{error}</p>
      )}
    </Dialog>
  )
}

// ─── Collection modal ─────────────────────────────────────────────────────────

interface Props {
  collectionId: number
  /** Card data shown while the detail loads. */
  summary?: AssetCollection | null
  /** Admin/Legal: show the status chip. */
  showStatus: boolean
  /** Admin only; omitted for everyone else (Legal included). */
  onEdit?: (detail: AssetCollectionDetail) => void
  onClose: () => void
}

export default function CollectionModal({ collectionId, summary, showStatus, onEdit, onClose }: Props) {
  const { t } = useTranslation('assets')
  const titleId = useId()
  const [detail, setDetail] = useState<AssetCollectionDetail | null>(null)
  const [loadError, setLoadError] = useState<'notFound' | 'failed' | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [zipProgress, setZipProgress] = useState<{ done: number; total: number } | null>(null)
  const [zipFailures, setZipFailures] = useState<ZipFailure[]>([])
  const [zipError, setZipError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    let alive = true
    setDetail(null)
    setLoadError(null)
    api.get<AssetCollectionDetail>(`/collections/${collectionId}`)
      .then(d => { if (alive) setDetail({ ...d, photos: [...(d.photos ?? [])].sort((a, b) => a.sort_order - b.sort_order) }) })
      .catch(err => {
        if (!alive) return
        setLoadError(err instanceof ApiError && (err.status === 404 || err.status === 403) ? 'notFound' : 'failed')
      })
    return () => { alive = false }
  }, [collectionId])

  // Abandon an in-progress ZIP when the modal closes.
  useEffect(() => () => abortRef.current?.abort(), [])

  const head = detail ?? summary ?? null
  const photos = detail?.photos ?? []

  async function downloadAll() {
    if (!detail || photos.length === 0 || zipProgress) return
    const controller = new AbortController()
    abortRef.current = controller
    setZipFailures([])
    setZipError(null)
    setZipProgress({ done: 0, total: photos.length })
    try {
      const { blob, failures } = await buildCollectionZip(
        photos,
        (done, total) => { if (!controller.signal.aborted) setZipProgress({ done, total }) },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setZipFailures(failures)
      if (blob) saveBlob(blob, zipFilename(detail.name))
      else setZipError(t('collections.zipEmpty'))
    } catch {
      if (!controller.signal.aborted) setZipError(t('collections.downloadFailed'))
    } finally {
      if (!controller.signal.aborted) setZipProgress(null)
    }
  }

  const releasedOn = head?.status === 'released' && head.released_at
    ? formatDate(parseServerDate(head.released_at).toISOString())
    : null

  return (
    <>
      <Dialog labelledBy={titleId} onClose={onClose} zClass="z-50" panelClassName="max-w-5xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-portal-border flex-shrink-0">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              {head && (
                <span className="text-xs font-semibold text-portal-accent uppercase tracking-wider">{displayBrand(head.brand)}</span>
              )}
              {head && isNewCollection(head) && (
                <span className="px-2 py-0.5 rounded-full bg-portal-accent text-white text-[11px] font-semibold">{t('collections.new')}</span>
              )}
              {showStatus && head && <CollectionStatusChip collection={head} />}
            </div>
            <h2 id={titleId} className="text-on-canvas text-lg font-semibold leading-tight break-words">
              {head?.name ?? t('collections.title')}
            </h2>
            {head && (
              <p className="text-on-canvas-muted text-xs">
                {t('collections.photos', { count: detail ? photos.length : head.photo_count })}
                {releasedOn && <> · {t('collections.releasedOn', { date: releasedOn })}</>}
              </p>
            )}
            {head?.description && (
              <p className="text-on-canvas-subtle text-sm whitespace-pre-line">{head.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onEdit && detail && (
              <button
                type="button"
                onClick={() => onEdit(detail)}
                className={`flex items-center gap-1.5 px-3 py-2 bg-surface-elevated border border-portal-border
                            hover:border-portal-accent/40 rounded-lg text-on-canvas text-sm transition-colors ${FOCUS_RING}`}
              >
                <Pencil className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Edit</span>
                <span className="sr-only sm:hidden">Edit collection</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('actions.close')}
              className={`p-2 rounded-lg text-on-canvas-muted hover:text-on-canvas ${FOCUS_RING}`}
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Download all */}
        {detail && photos.length > 0 && (
          <div className="px-4 sm:px-6 py-3 border-b border-portal-border flex flex-wrap items-center gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={downloadAll}
              disabled={!!zipProgress}
              className={`flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 disabled:opacity-60
                          text-white rounded-lg text-sm font-medium transition-colors ${FOCUS_RING}`}
            >
              {zipProgress ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <PackageOpen className="w-4 h-4" aria-hidden="true" />}
              {t('collections.downloadAll')}
            </button>
            <div role="status" aria-live="polite" className="text-on-canvas-muted text-xs flex-1 min-w-[10rem]">
              {zipProgress && (
                <div className="space-y-1">
                  <span>{t('collections.preparingZip', { done: zipProgress.done, total: zipProgress.total })}</span>
                  <div className="h-1.5 rounded-full bg-portal-bg overflow-hidden" aria-hidden="true">
                    <div
                      className="h-full bg-portal-accent transition-all"
                      style={{ width: `${zipProgress.total ? (zipProgress.done / zipProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
              {zipError && <span className="text-red-500">{zipError}</span>}
            </div>
          </div>
        )}
        {zipFailures.length > 0 && (
          <div role="alert" className="mx-4 sm:mx-6 mt-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-on-canvas flex-shrink-0">
            <p className="flex items-center gap-1.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />
              {t('collections.zipFailed', { count: zipFailures.length })}
            </p>
            <ul className="mt-1 list-disc pl-5 space-y-0.5 max-h-24 overflow-y-auto">
              {zipFailures.map((f, i) => <li key={i} className="break-words">{f.name}</li>)}
            </ul>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4">
          {loadError ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted text-sm" role="alert">
              <Images className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
              {loadError === 'notFound' ? t('collections.notFound') : t('collections.loadFailed')}
            </div>
          ) : !detail ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3" aria-busy="true">
              {[...Array(Math.min(10, Math.max(4, summary?.photo_count ?? 8)))].map((_, i) => (
                <div key={i} className="aspect-square rounded-xl bg-portal-bg animate-pulse" />
              ))}
            </div>
          ) : photos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-on-canvas-muted text-sm">
              <Images className="w-10 h-10 mb-3 opacity-40" aria-hidden="true" />
              {t('collections.empty')}
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {photos.map((p, i) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setViewerIndex(i)}
                    aria-label={t('collections.viewPhoto', { name: p.name })}
                    className={`block w-full aspect-square rounded-xl overflow-hidden bg-portal-bg border border-portal-border
                                hover:border-portal-accent/50 transition-colors ${FOCUS_RING}`}
                  >
                    <img
                      src={p.thumbnail_url || p.file_url}
                      alt={p.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Dialog>

      {viewerIndex !== null && photos[viewerIndex] && (
        <PhotoViewer
          photos={photos}
          index={viewerIndex}
          onIndex={setViewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </>
  )
}
