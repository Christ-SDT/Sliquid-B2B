import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { QUIZZES } from '@/quizzes'
import { ArrowLeft, CheckCircle2, XCircle, Loader2 } from 'lucide-react'

// Extend window to hold the SCORM 1.2 API object
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    API?: Record<string, any>
  }
}

type FinishState = {
  score: number
  passed: boolean
  submitted: boolean
  error?: string
}

export default function QuizPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const quiz = QUIZZES.find(q => q.id === id)

  const scormData = useRef<Record<string, string>>({})
  const [iframeReady, setIframeReady] = useState(false)
  const [finish, setFinish] = useState<FinishState | null>(null)

  // Install SCORM 1.2 window.API shim before the iframe loads
  useEffect(() => {
    if (!quiz) return

    window.API = {
      LMSInitialize: (_: string) => {
        scormData.current = {
          'cmi.core.lesson_status':   'not attempted',
          'cmi.core.entry':           'ab-initio',
          'cmi.core.lesson_mode':     'normal',
          'cmi.core.credit':          'credit',
          'cmi.core.exit':            '',
          'cmi.core.lesson_location': '',
          'cmi.core.score.raw':       '',
          'cmi.core.score.min':       '',
          'cmi.core.score.max':       '',
          'cmi.core.total_time':      '0000:00:00.00',
          'cmi.suspend_data':         '',
          'cmi.launch_data':          '',
          'cmi.interactions._count':  '0',
          'cmi.objectives._count':    '0',
        }
        return 'true'
      },
      LMSFinish: (_: string) => {
        const raw = parseFloat(scormData.current['cmi.core.score.raw'] ?? '0')
        const score = isNaN(raw) ? 0 : Math.max(0, Math.min(100, raw))
        const passed = score >= quiz.passingScore

        // Show overlay immediately
        setFinish({ score, passed, submitted: false })

        // Post result to backend
        api
          .post<{ ok: boolean; score: number; passed: boolean }>('/quiz/complete', {
            quizId: quiz.id,
            quizTitle: quiz.title,
            score,
          })
          .then(() => setFinish(prev => prev ? { ...prev, submitted: true } : prev))
          .catch(err => setFinish(prev => prev ? { ...prev, submitted: true, error: err.message } : prev))

        return 'true'
      },
      LMSGetValue: (key: string) => scormData.current[key] ?? '',
      LMSSetValue: (key: string, value: string) => {
        scormData.current[key] = value
        return 'true'
      },
      LMSCommit: (_: string) => 'true',
      LMSGetLastError: () => '0',
      LMSGetErrorString: (_: string) => '',
      LMSGetDiagnostic: (_: string) => '',
    }

    setIframeReady(true)

    return () => {
      delete window.API
    }
  }, [quiz])

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

  return (
    <div className="relative flex flex-col h-full">
      {/* Slim top bar */}
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
        <span className="ml-auto text-slate-500 text-xs">Pass: {quiz.passingScore}%</span>
      </div>

      {/* SCORM iframe */}
      {iframeReady && (
        <iframe
          src={quiz.path}
          title={quiz.title}
          className="flex-1 w-full border-none"
          allow="autoplay"
        />
      )}

      {/* Result overlay */}
      {finish && (
        <div className="absolute inset-0 bg-portal-bg/90 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-surface border border-portal-border rounded-2xl p-8 w-full max-w-sm mx-4 text-center shadow-2xl">
            {finish.passed ? (
              <CheckCircle2 className="w-14 h-14 text-emerald-400 mx-auto mb-4" />
            ) : (
              <XCircle className="w-14 h-14 text-amber-400 mx-auto mb-4" />
            )}

            <h2 className="text-white text-xl font-bold mb-1">
              {finish.passed ? 'Congratulations!' : 'Keep Practicing'}
            </h2>
            <p className="text-slate-400 text-sm mb-4">
              {finish.passed
                ? 'You passed this training.'
                : `You need ${quiz.passingScore}% to pass. Give it another try!`}
            </p>

            <div className="py-3 px-5 bg-portal-bg rounded-xl mb-6">
              <p className="text-slate-500 text-xs mb-1">Your Score</p>
              <p className={`text-3xl font-bold ${finish.passed ? 'text-emerald-400' : 'text-amber-400'}`}>
                {finish.score}%
              </p>
            </div>

            {!finish.submitted && (
              <div className="flex items-center justify-center gap-2 text-slate-500 text-xs mb-4">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Saving result…
              </div>
            )}

            {finish.passed && finish.submitted && (
              <p className="text-emerald-400 text-xs mb-4">
                A confirmation email has been sent to you.
              </p>
            )}

            <div className="flex flex-col gap-2">
              <button
                onClick={() => navigate('/trainings')}
                className="w-full py-2.5 bg-portal-accent hover:bg-portal-accent/90 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Back to Trainings
              </button>
              {!finish.passed && (
                <button
                  onClick={() => {
                    setFinish(null)
                    scormData.current = {}
                    // Force iframe reload by toggling iframeReady
                    setIframeReady(false)
                    setTimeout(() => setIframeReady(true), 50)
                  }}
                  className="w-full py-2.5 bg-surface-elevated hover:bg-portal-border text-slate-300 rounded-lg text-sm font-medium transition-colors"
                >
                  Try Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
