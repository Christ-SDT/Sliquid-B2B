import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { isAdmin } from '@/types'
import { GraduationCap, Clock, CheckCircle2, ChevronRight, Award, Plus, Pencil, Trash2, Loader2, X } from 'lucide-react'
import CertificateGenerator from '@/components/CertificateGenerator'
import CertRewardForm from '@/components/CertRewardForm'

type CertData = {
  firstName: string
  lastName: string
  rewardSubmitted: boolean
}

type Training = {
  id: number
  quiz_id: string
  title: string
  description: string | null
  video_path: string | null
  passing_score: number
  estimated_minutes: number
  sort_order: number
}

type QuizResult = {
  id: number
  quiz_id: string
  score: number
  passed: number
  completed_at: string
}

// ─── Add Training Modal ───────────────────────────────────────────────────────

function AddTrainingModal({ onClose, onAdded }: { onClose: () => void; onAdded: (t: Training) => void }) {
  const [quizId, setQuizId] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [videoPath, setVideoPath] = useState('')
  const [passingScore, setPassingScore] = useState(70)
  const [estimatedMinutes, setEstimatedMinutes] = useState(15)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const t = await api.post<Training>('/trainings', {
        quiz_id: quizId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        video_path: videoPath.trim() || null,
        passing_score: passingScore,
        estimated_minutes: estimatedMinutes,
        sort_order: 0,
      })
      onAdded(t)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to add training')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">Add Training</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Quiz ID (slug) *</label>
            <input value={quizId} onChange={e => setQuizId(e.target.value)} required placeholder="e.g. h2o-vs-sassy"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            <p className="text-on-canvas-muted text-xs mt-1">SCORM package must be at <code className="text-portal-accent">/training/{'{'} quiz-id {'}'}/index.html</code></p>
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Training title"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Brief description shown on the training card"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Video URL (optional)</label>
            <input value={videoPath} onChange={e => setVideoPath(e.target.value)} placeholder="https://youtu.be/…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Passing Score (%)</label>
              <input type="number" value={passingScore} onChange={e => setPassingScore(Number(e.target.value))} min={1} max={100}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Est. Minutes</label>
              <input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(Number(e.target.value))} min={1}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Add Training
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Edit Training Modal ──────────────────────────────────────────────────────

function EditTrainingModal({ training, onClose, onSaved }: { training: Training; onClose: () => void; onSaved: (t: Training) => void }) {
  const [quizId, setQuizId] = useState(training.quiz_id)
  const [title, setTitle] = useState(training.title)
  const [description, setDescription] = useState(training.description ?? '')
  const [videoPath, setVideoPath] = useState(training.video_path ?? '')
  const [passingScore, setPassingScore] = useState(training.passing_score)
  const [estimatedMinutes, setEstimatedMinutes] = useState(training.estimated_minutes)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const t = await api.put<Training>(`/trainings/${training.id}`, {
        quiz_id: quizId.trim(),
        title: title.trim(),
        description: description.trim() || null,
        video_path: videoPath.trim() || null,
        passing_score: passingScore,
        estimated_minutes: estimatedMinutes,
        sort_order: training.sort_order,
      })
      onSaved(t)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-portal-border rounded-xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
          <h2 className="text-on-canvas font-semibold">Edit Training</h2>
          <button onClick={onClose} className="text-on-canvas-muted hover:text-on-canvas"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Quiz ID (slug) *</label>
            <input value={quizId} onChange={e => setQuizId(e.target.value)} required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            <p className="text-on-canvas-muted text-xs mt-1">SCORM package must be at <code className="text-portal-accent">/training/{'{'} quiz-id {'}'}/index.html</code></p>
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Title *</label>
            <input value={title} onChange={e => setTitle(e.target.value)} required
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent resize-none" />
          </div>
          <div>
            <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Video URL (optional)</label>
            <input value={videoPath} onChange={e => setVideoPath(e.target.value)} placeholder="https://youtu.be/…"
              className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Passing Score (%)</label>
              <input type="number" value={passingScore} onChange={e => setPassingScore(Number(e.target.value))} min={1} max={100}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            </div>
            <div>
              <label className="block text-on-canvas-subtle text-sm font-medium mb-1.5">Est. Minutes</label>
              <input type="number" value={estimatedMinutes} onChange={e => setEstimatedMinutes(Number(e.target.value))} min={1}
                className="w-full bg-portal-bg border border-portal-border rounded-lg px-3 py-2 text-on-canvas text-sm focus:outline-none focus:border-portal-accent" />
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 py-2 rounded-lg border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-sm transition-colors">Cancel</button>
            <button type="submit" disabled={loading} className="flex-1 py-2 rounded-lg bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Quiz Card ────────────────────────────────────────────────────────────────

function QuizCard({
  training,
  bestResult,
  adminMode,
  onEdit,
  onDelete,
}: {
  training: Training
  bestResult?: QuizResult
  adminMode: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const navigate = useNavigate()
  const hasPassed = bestResult?.passed === 1
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group flex flex-col">
      {/* Header band */}
      <div className="bg-portal-bg px-5 pt-5 pb-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-portal-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <GraduationCap className="w-5 h-5 text-portal-accent" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-on-canvas font-semibold text-sm leading-snug">{training.title}</h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-on-canvas-muted text-xs">
              <Clock className="w-3 h-3" />
              {training.estimated_minutes} min
            </span>
            <span className="text-on-canvas text-xs">·</span>
            <span className="text-on-canvas-muted text-xs">Pass: {training.passing_score}%</span>
          </div>
        </div>
        {hasPassed && (
          <div className="flex-shrink-0">
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Passed
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 flex-1 flex flex-col">
        <p className="text-on-canvas-subtle text-sm leading-relaxed flex-1">{training.description}</p>

        {bestResult && (
          <div className="mt-4 flex items-center gap-2 py-2.5 px-3 bg-portal-bg rounded-lg">
            <Award className="w-4 h-4 text-portal-accent flex-shrink-0" />
            <span className="text-on-canvas-subtle text-xs">
              Best score: <span className={`font-semibold ${hasPassed ? 'text-emerald-400' : 'text-amber-400'}`}>{bestResult.score}%</span>
            </span>
          </div>
        )}

        <button
          onClick={() => navigate(`/quiz/${training.quiz_id}`)}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-portal-accent hover:bg-portal-accent/90
                     text-white rounded-lg text-sm font-medium transition-colors"
        >
          {bestResult ? 'Retake Training' : 'Start Training'}
          <ChevronRight className="w-4 h-4" />
        </button>

        {/* Admin controls */}
        {adminMode && (
          <div className="mt-3 flex gap-2">
            {confirmDelete ? (
              <>
                <span className="text-on-canvas-muted text-xs flex-1 flex items-center">Delete this training?</span>
                <button onClick={() => { setConfirmDelete(false); onDelete() }}
                  className="px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/30 transition-colors">
                  Delete
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1.5 rounded-lg bg-surface-elevated border border-portal-border text-on-canvas-subtle text-xs transition-colors hover:text-on-canvas">
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button onClick={onEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-on-canvas text-xs transition-colors">
                  <Pencil className="w-3 h-3" /> Edit
                </button>
                <button onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-elevated border border-portal-border text-on-canvas-subtle hover:text-red-400 text-xs transition-colors">
                  <Trash2 className="w-3 h-3" /> Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingsPage() {
  const { user } = useAuth()
  const adminMode = isAdmin(user?.role ?? '')
  const [trainings, setTrainings] = useState<Training[]>([])
  const [results, setResults] = useState<QuizResult[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTarget, setEditTarget] = useState<Training | null>(null)

  useEffect(() => {
    Promise.all([
      api.get<Training[]>('/trainings'),
      api.get<QuizResult[]>('/quiz/results'),
    ])
      .then(([t, r]) => { setTrainings(t); setResults(r) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function bestFor(quizId: string): QuizResult | undefined {
    const rows = results.filter(r => r.quiz_id === quizId)
    if (!rows.length) return undefined
    return rows.reduce((best, r) => (r.score > best.score ? r : best), rows[0])
  }

  function handleDelete(id: number) {
    api.delete(`/trainings/${id}`)
      .then(() => setTrainings(prev => prev.filter(t => t.id !== id)))
      .catch(console.error)
  }

  const passedCount = trainings.filter(t => bestFor(t.quiz_id)?.passed === 1).length
  const allComplete = !loading && trainings.length > 0 && passedCount === trainings.length

  const [showCertModal, setShowCertModal] = useState(false)
  const [certData, setCertData] = useState<CertData | null>(null)
  const [certDataLoading, setCertDataLoading] = useState(false)

  function openCertModal() {
    setShowCertModal(true)
    setCertData(null)
    setCertDataLoading(true)
    api.get<CertData>('/certificates/mine')
      .then(data => setCertData(data))
      .catch(() => setCertData(null))
      .finally(() => setCertDataLoading(false))
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-on-canvas text-2xl font-bold">Become a Sliquid Certified Expert</h1>
          <p className="text-on-canvas-subtle text-sm mt-1 max-w-2xl">
            Earn your official Sliquid Certification by completing this digital training course. For each section, watch the video, take the quiz, and pass at 80% or higher. Once all sections are complete, you will receive a digital certificate and be sent a Sliquid Certified Expert pin and t-shirt. As a bonus for completing the course, you will also receive a Sliquid product of your choice. Your Sliquid product knowledge journey begins here. Good luck!
          </p>
        </div>
        {adminMode && (
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Training
          </button>
        )}
      </div>

      {/* Completion banner */}
      {allComplete && (
        <div className="mb-6 p-5 bg-portal-accent/10 border border-portal-accent/30 rounded-xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Award className="w-6 h-6 text-portal-accent flex-shrink-0" />
            <div>
              <p className="text-on-canvas font-semibold text-sm">
                You're a Sliquid Certified Expert!
              </p>
              <p className="text-on-canvas-muted text-xs mt-0.5">
                All modules complete — your certificate is ready to download.
              </p>
            </div>
          </div>
          <button
            onClick={openCertModal}
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Award className="w-4 h-4" /> View Certificate
          </button>
        </div>
      )}

      {/* Progress summary */}
      {!loading && trainings.length > 0 && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-surface border border-portal-border rounded-xl">
          <div className="w-9 h-9 rounded-full bg-portal-accent/15 flex items-center justify-center">
            <Award className="w-5 h-5 text-portal-accent" />
          </div>
          <div>
            <p className="text-on-canvas text-sm font-medium">{passedCount} / {trainings.length} completed</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-portal-accent rounded-full transition-all"
                  style={{ width: trainings.length ? `${(passedCount / trainings.length) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-on-canvas-muted text-xs">{trainings.length ? Math.round((passedCount / trainings.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-portal-accent animate-spin" />
        </div>
      )}

      {/* Quiz grid */}
      {!loading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {trainings.map(training => (
            <QuizCard
              key={training.id}
              training={training}
              bestResult={bestFor(training.quiz_id)}
              adminMode={adminMode}
              onEdit={() => setEditTarget(training)}
              onDelete={() => handleDelete(training.id)}
            />
          ))}
        </div>
      )}

      {showAddModal && (
        <AddTrainingModal
          onClose={() => setShowAddModal(false)}
          onAdded={t => setTrainings(prev => [...prev, t])}
        />
      )}
      {editTarget && (
        <EditTrainingModal
          training={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={updated => {
            setTrainings(prev => prev.map(t => t.id === updated.id ? updated : t))
            setEditTarget(null)
          }}
        />
      )}

      {/* Certificate modal */}
      {showCertModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-portal-border rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-portal-border">
              <h2 className="text-on-canvas font-semibold">
                {certDataLoading || !certData
                  ? 'Sliquid Certified Expert'
                  : certData.rewardSubmitted
                    ? 'Your Certificate'
                    : 'Claim Your Rewards'}
              </h2>
              <button onClick={() => setShowCertModal(false)} className="text-on-canvas-muted hover:text-on-canvas">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Loading */}
            {certDataLoading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 text-portal-accent animate-spin" />
              </div>
            )}

            {/* Reward form — shown once before the certificate */}
            {!certDataLoading && certData && !certData.rewardSubmitted && (
              <CertRewardForm
                userName={`${certData.firstName} ${certData.lastName}`}
                onComplete={() => setCertData(prev => prev ? { ...prev, rewardSubmitted: true } : prev)}
              />
            )}

            {/* Certificate — shown after reward form is submitted (or if already done) */}
            {!certDataLoading && certData?.rewardSubmitted && (
              <CertificateGenerator />
            )}
          </div>
        </div>
      )}
    </div>
  )
}
