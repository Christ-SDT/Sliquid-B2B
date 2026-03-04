import { useEffect, useRef, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { useAuth } from '@/context/AuthContext'
import { QUIZZES } from '@/quizzes'
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Loader2,
  User,
  CalendarDays,
  Play,
  SkipForward,
  Video,
  X,
} from 'lucide-react'

// ─── YouTube IFrame API types ─────────────────────────────────────────────────
type YTPlayer = {
  getCurrentTime: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  pauseVideo: () => void
  destroy: () => void
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    API?: Record<string, any>
    YT?: {
      Player: new (
        elementId: string,
        options: {
          videoId: string
          playerVars?: Record<string, unknown>
          events?: {
            onReady?: (e: { target: YTPlayer }) => void
            onStateChange?: (e: { data: number }) => void
          }
        }
      ) => YTPlayer
      PlayerState: { ENDED: number }
    }
    onYouTubeIframeAPIReady?: () => void
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([^&?/\s]+)/)
  return m ? m[1] : null
}

function loadYouTubeScript(onReady: () => void) {
  if (window.YT?.Player) {
    onReady()
    return
  }
  const prev = window.onYouTubeIframeAPIReady
  window.onYouTubeIframeAPIReady = () => {
    prev?.()
    onReady()
  }
  if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(s)
  }
}

// ─── Phase / finish types ─────────────────────────────────────────────────────
type Phase = 'video' | 'quiz'

type FinishState = {
  score: number
  passed: boolean
  submitted: boolean
  completedAt: string
  error?: string
}

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const quiz = QUIZZES.find(q => q.id === id)
  const nextQuiz = quiz ? QUIZZES[QUIZZES.indexOf(quiz) + 1] ?? null : null

  const ytId = quiz?.videoPath ? getYouTubeId(quiz.videoPath) : null
  const isYouTube = !!ytId

  // ─── Phase ─────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>(quiz?.videoPath ? 'video' : 'quiz')

  // ─── Video state ────────────────────────────────────────────────────────────
  // For direct <video> files
  const mainVideoRef = useRef<HTMLVideoElement>(null)
  // Playback position shared between main player and modal
  const videoPositionRef = useRef(0)
  // YouTube player instances
  const ytMainRef = useRef<YTPlayer | null>(null)
  const ytModalRef = useRef<YTPlayer | null>(null)

  const [videoModalOpen, setVideoModalOpen] = useState(false)
  // Re-mount the modal player div when reopened so YT API gets a fresh target
  const [modalKey, setModalKey] = useState(0)

  // ─── SCORM state ────────────────────────────────────────────────────────────
  const scormData = useRef<Record<string, string>>({})
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const hasFinished = useRef(false)
  const [iframeReady, setIframeReady] = useState(false)
  const [finish, setFinish] = useState<FinishState | null>(null)
  const handleFinishRef = useRef<() => void>(() => {})
  // True when the user arrived at the quiz phase via video completion/skip
  // so we can auto-click the Captivate stage to start the course immediately
  const autoStartRef = useRef(false)

  // ─── Advance from video → quiz ──────────────────────────────────────────────
  const enterQuiz = useCallback(() => {
    // Save position before leaving
    if (isYouTube && ytMainRef.current) {
      videoPositionRef.current = ytMainRef.current.getCurrentTime()
      ytMainRef.current.pauseVideo()
    } else if (mainVideoRef.current) {
      videoPositionRef.current = mainVideoRef.current.currentTime
      mainVideoRef.current.pause()
    }
    autoStartRef.current = true  // signal: auto-click the course stage on load
    setPhase('quiz')
  }, [isYouTube])

  // ─── Modal open / close ─────────────────────────────────────────────────────
  const openVideoModal = useCallback(() => {
    // Snapshot position from active player
    if (isYouTube && ytMainRef.current) {
      videoPositionRef.current = ytMainRef.current.getCurrentTime()
    } else if (mainVideoRef.current) {
      videoPositionRef.current = mainVideoRef.current.currentTime
    }
    setModalKey(k => k + 1) // fresh mount → YT API gets new div id
    setVideoModalOpen(true)
  }, [isYouTube])

  const closeVideoModal = useCallback(() => {
    if (isYouTube && ytModalRef.current) {
      videoPositionRef.current = ytModalRef.current.getCurrentTime()
      ytModalRef.current.pauseVideo()
    } else if (mainVideoRef.current) {
      // modal video element shares the same ref pattern; handled separately below
    }
    setVideoModalOpen(false)
  }, [isYouTube])

  // ─── Escape closes modal ────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoModalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeVideoModal() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [videoModalOpen, closeVideoModal])

  // ─── Mount main YouTube player (video phase) ────────────────────────────────
  useEffect(() => {
    if (phase !== 'video' || !ytId) return

    loadYouTubeScript(() => {
      if (!window.YT?.Player) return
      ytMainRef.current = new window.YT.Player('yt-main-player', {
        videoId: ytId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1 },
        events: {
          onReady: ({ target }) => {
            if (videoPositionRef.current > 0) {
              target.seekTo(videoPositionRef.current, true)
            }
          },
          onStateChange: ({ data }) => {
            if (window.YT && data === window.YT.PlayerState.ENDED) {
              enterQuiz()
            }
          },
        },
      })
    })

    return () => {
      ytMainRef.current?.destroy()
      ytMainRef.current = null
    }
  }, [phase, ytId, enterQuiz])

  // ─── Mount modal YouTube player ─────────────────────────────────────────────
  useEffect(() => {
    if (!videoModalOpen || !ytId) return

    const startAt = Math.floor(videoPositionRef.current)

    loadYouTubeScript(() => {
      if (!window.YT?.Player) return
      ytModalRef.current = new window.YT.Player('yt-modal-player', {
        videoId: ytId,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, start: startAt },
        events: {},
      })
    })

    return () => {
      ytModalRef.current?.destroy()
      ytModalRef.current = null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoModalOpen, modalKey, ytId])

  // ─── Seek native video to saved position when modal opens ───────────────────
  const modalVideoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    if (videoModalOpen && !isYouTube && modalVideoRef.current) {
      modalVideoRef.current.currentTime = videoPositionRef.current
    }
  }, [videoModalOpen, isYouTube])

  // ─── SCORM finish handler ────────────────────────────────────────────────────
  useEffect(() => {
    handleFinishRef.current = () => {
      if (hasFinished.current || !quiz) return
      hasFinished.current = true

      const raw = parseFloat(scormData.current['cmi.core.score.raw'] ?? '0')
      const max = parseFloat(scormData.current['cmi.core.score.max'] ?? '100')
      const min = parseFloat(scormData.current['cmi.core.score.min'] ?? '0')
      const range = max - min
      const score = isNaN(raw)
        ? 0
        : range > 0 && max !== 100
          ? Math.round(((raw - min) / range) * 100)
          : Math.max(0, Math.min(100, raw))
      const passed = score >= quiz.passingScore
      const completedAt = new Date().toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      })

      setFinish({ score, passed, submitted: false, completedAt })

      api
        .post<{ ok: boolean; score: number; passed: boolean }>('/quiz/complete', {
          quizId: quiz.id,
          quizTitle: quiz.title,
          score,
        })
        .then(() => setFinish(prev => prev ? { ...prev, submitted: true } : prev))
        .catch(err => setFinish(prev => prev ? { ...prev, submitted: true, error: err.message } : prev))
    }
  })

  // ─── SCORM 1.2 window.API shim ───────────────────────────────────────────────
  useEffect(() => {
    if (!quiz || phase !== 'quiz') return

    window.API = {
      LMSInitialize: (_: string) => {
        hasFinished.current = false
        scormData.current = {
          'cmi.core.student_name':    user?.name ?? '',
          'cmi.core.student_id':     user?.email ?? '',
          'cmi.core.lesson_status':  'not attempted',
          'cmi.core.entry':          'ab-initio',
          'cmi.core.lesson_mode':    'normal',
          'cmi.core.credit':         'credit',
          'cmi.core.exit':           '',
          'cmi.core.lesson_location':'',
          'cmi.core.score.raw':      '',
          'cmi.core.score.min':      '',
          'cmi.core.score.max':      '',
          'cmi.core.total_time':     '0000:00:00.00',
          'cmi.suspend_data':        '',
          'cmi.launch_data':         '',
          'cmi.interactions._count': '0',
          'cmi.objectives._count':   '0',
        }
        return 'true'
      },
      LMSFinish: (_: string) => { handleFinishRef.current(); return 'true' },
      LMSGetValue: (key: string) => scormData.current[key] ?? '',
      LMSSetValue: (key: string, value: string) => {
        scormData.current[key] = value
        if (key === 'cmi.core.lesson_status' &&
            (value === 'passed' || value === 'failed' || value === 'completed')) {
          setTimeout(() => handleFinishRef.current(), 100)
        }
        return 'true'
      },
      LMSCommit:        (_: string) => 'true',
      LMSGetLastError:  () => '0',
      LMSGetErrorString:(_: string) => '',
      LMSGetDiagnostic: (_: string) => '',
    }
    setIframeReady(true)
    return () => { delete window.API }
  }, [quiz, phase, user?.name, user?.email])

  function handleIframeLoad() {
    try {
      const href = iframeRef.current?.contentWindow?.location?.href ?? ''
      if (href.includes('goodbye.html')) {
        setTimeout(() => handleFinishRef.current(), 300)
        return
      }

      // Auto-start the Captivate course when arriving from the video phase.
      // Captivate initialises its React app asynchronously after the iframe
      // loads — poll every 300 ms until a clickable target appears, then
      // dispatch a full pointer+click sequence to satisfy autoplay policy and
      // any "click to start" overlay. Hard-stop after 15 s as a safety net.
      if (autoStartRef.current) {
        autoStartRef.current = false
        const deadline = Date.now() + 15_000
        const poll = setInterval(() => {
          try {
            const doc = iframeRef.current?.contentDocument
            if (!doc || Date.now() > deadline) { clearInterval(poll); return }
            // Priority selector chain — find the Captivate play button
            const target =
              doc.querySelector<HTMLElement>('button') ??
              doc.querySelector<HTMLElement>('[class*="play" i]') ??
              doc.querySelector<HTMLElement>('[class*="start" i]') ??
              doc.getElementById('app')
            if (!target) return  // not rendered yet — try again next tick
            clearInterval(poll)
            ;['pointerdown', 'pointerup', 'click'].forEach(type =>
              target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }))
            )
          } catch { clearInterval(poll) }
        }, 300)
      }
    } catch { /* cross-origin guard */ }
  }

  // ─── Not found ───────────────────────────────────────────────────────────────
  if (!quiz) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
        <p>Quiz not found.</p>
        <button onClick={() => navigate('/trainings')} className="text-portal-accent text-sm hover:underline">
          ← Back to Trainings
        </button>
      </div>
    )
  }

  // ─── Video phase ─────────────────────────────────────────────────────────────
  if (phase === 'video' && quiz.videoPath) {
    return (
      <div className="relative flex flex-col h-full bg-black">
        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-portal-border flex-shrink-0">
          <button
            onClick={() => navigate('/trainings')}
            className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Trainings
          </button>
          <span className="text-slate-700 text-sm">/</span>
          <span className="text-white text-sm font-medium truncate">{quiz.title}</span>
          <button
            onClick={enterQuiz}
            className="ml-auto flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
          >
            <SkipForward className="w-4 h-4" />
            Skip to Quiz
          </button>
        </div>

        {/* Player */}
        <div className="flex-1 flex items-center justify-center bg-black">
          {isYouTube ? (
            /* YouTube: div replaced by YT IFrame API */
            <div id="yt-main-player" className="w-full h-full" />
          ) : (
            <video
              ref={mainVideoRef}
              src={quiz.videoPath}
              className="max-h-full max-w-full w-full h-full object-contain"
              controls
              autoPlay
              onEnded={enterQuiz}
            />
          )}
        </div>

        {/* Bottom CTA */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 bg-surface border-t border-portal-border flex-shrink-0">
          <span className="text-slate-400 text-sm">Watch the full video, or</span>
          <button
            onClick={enterQuiz}
            className="flex items-center gap-1.5 px-4 py-2 bg-portal-accent hover:bg-portal-accent/90 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Start Quiz
          </button>
        </div>
      </div>
    )
  }

  // ─── Quiz phase ───────────────────────────────────────────────────────────────
  return (
    <div className="relative flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-surface border-b border-portal-border flex-shrink-0">
        <button
          onClick={() => navigate('/trainings')}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Trainings
        </button>
        <span className="text-slate-700 text-sm">/</span>
        <span className="text-white text-sm font-medium truncate">{quiz.title}</span>

        <div className="ml-auto flex items-center gap-3">
          {quiz.videoPath && (
            <button
              onClick={openVideoModal}
              className="flex items-center gap-1.5 text-slate-400 hover:text-white text-sm transition-colors"
            >
              <Video className="w-4 h-4" />
              Watch Video
            </button>
          )}
          <span className="text-slate-500 text-xs">Pass: {quiz.passingScore}%</span>
        </div>
      </div>

      {/* SCORM iframe */}
      {iframeReady && (
        <iframe
          ref={iframeRef}
          src={quiz.path}
          title={quiz.title}
          className="flex-1 w-full border-none"
          allow="autoplay; encrypted-media; picture-in-picture"
          onLoad={handleIframeLoad}
        />
      )}

      {/* ── Video modal ─────────────────────────────────────────────────────── */}
      {videoModalOpen && quiz.videoPath && (
        <div
          className="absolute inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-40"
          onClick={e => { if (e.target === e.currentTarget) closeVideoModal() }}
        >
          <div className="relative w-full max-w-4xl mx-4 bg-black rounded-xl overflow-hidden shadow-2xl border border-portal-border">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2.5 bg-surface border-b border-portal-border">
              <span className="text-white text-sm font-medium">{quiz.title} — Training Video</span>
              <button
                onClick={closeVideoModal}
                className="text-slate-400 hover:text-white transition-colors"
                aria-label="Close video"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {/* Player */}
            {isYouTube ? (
              /* key prop forces fresh div on each open so YT API mounts cleanly */
              <div key={modalKey} id="yt-modal-player" className="w-full aspect-video" />
            ) : (
              <video
                ref={modalVideoRef}
                src={quiz.videoPath}
                className="w-full aspect-video"
                controls
                autoPlay
                onTimeUpdate={() => {
                  if (modalVideoRef.current) {
                    videoPositionRef.current = modalVideoRef.current.currentTime
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* ── Completion overlay ──────────────────────────────────────────────── */}
      {finish && (
        <div className="absolute inset-0 bg-portal-bg/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface border border-portal-border rounded-2xl p-8 w-full max-w-sm mx-4 text-center shadow-2xl">
            {finish.passed
              ? <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
              : <XCircle className="w-14 h-14 text-amber-400 mx-auto mb-4" />
            }

            <h2 className="text-white text-xl font-bold mb-1">
              {finish.passed ? 'Training Complete!' : 'Keep Practicing'}
            </h2>
            <p className="text-slate-400 text-sm mb-5">
              {finish.passed
                ? 'You passed this training. Great work!'
                : `A score of ${quiz.passingScore}% is required to pass. Give it another try!`}
            </p>

            <div className="bg-portal-bg rounded-xl p-4 mb-5 text-left space-y-3">
              <div className="flex items-center gap-2.5">
                <User className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-slate-300 text-sm truncate">{user?.name ?? '—'}</span>
              </div>
              <div className="flex items-center gap-2.5">
                <CalendarDays className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-slate-300 text-sm">{finish.completedAt}</span>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-portal-border">
                <span className="text-slate-500 text-xs uppercase tracking-wide">Score</span>
                <span className={`text-3xl font-bold ${finish.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {finish.score}%
                </span>
              </div>
            </div>

            {!finish.submitted && (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs mb-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving result…
              </div>
            )}
            {finish.passed && finish.submitted && (
              <p className="text-emerald-400 text-xs mb-4">
                A confirmation email has been sent to {user?.email}.
              </p>
            )}

            <div className="flex flex-col gap-2">
              {finish.passed && nextQuiz && (
                <button
                  onClick={() => navigate(`/quiz/${nextQuiz.id}`)}
                  className="w-full py-2.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Go to Next Module
                </button>
              )}
              <button
                onClick={() => navigate('/trainings')}
                className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${finish.passed ? 'bg-surface-elevated hover:bg-portal-border text-slate-300' : 'bg-portal-accent hover:bg-portal-accent/90 text-white'}`}
              >
                {finish.passed ? 'Done' : 'Back to Trainings'}
              </button>
              {!finish.passed && (
                <button
                  onClick={() => {
                    hasFinished.current = false
                    setFinish(null)
                    scormData.current = {}
                    setIframeReady(false)
                    setTimeout(() => setIframeReady(true), 50)
                  }}
                  className="w-full py-2.5 bg-surface-elevated hover:bg-portal-border text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Try Again
                </button>
              )}
              {quiz.videoPath && (
                <button
                  onClick={openVideoModal}
                  className="w-full py-2.5 bg-surface-elevated hover:bg-portal-border text-slate-400 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                >
                  <Video className="w-3.5 h-3.5" />
                  Rewatch Video
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
