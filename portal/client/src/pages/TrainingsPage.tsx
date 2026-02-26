import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '@/api/client'
import { QUIZZES, type Quiz } from '@/quizzes'
import { GraduationCap, Clock, CheckCircle2, ChevronRight, Award } from 'lucide-react'

type QuizResult = {
  id: number
  quiz_id: string
  score: number
  passed: number
  completed_at: string
}

function QuizCard({ quiz, bestResult }: { quiz: Quiz; bestResult?: QuizResult }) {
  const navigate = useNavigate()
  const hasPassed = bestResult?.passed === 1

  return (
    <div className="bg-surface border border-portal-border rounded-xl overflow-hidden hover:border-portal-accent/30 transition-all group flex flex-col">
      {/* Header band */}
      <div className="bg-portal-bg px-5 pt-5 pb-4 flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-portal-accent/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <GraduationCap className="w-5 h-5 text-portal-accent" />
        </div>
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm leading-snug">{quiz.title}</h3>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="flex items-center gap-1 text-slate-500 text-xs">
              <Clock className="w-3 h-3" />
              {quiz.estimatedMinutes} min
            </span>
            <span className="text-slate-700 text-xs">·</span>
            <span className="text-slate-500 text-xs">Pass: {quiz.passingScore}%</span>
          </div>
        </div>
        {hasPassed && (
          <div className="ml-auto flex-shrink-0">
            <span className="flex items-center gap-1 px-2 py-0.5 bg-emerald-900/30 border border-emerald-700/40 rounded-full text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3 h-3" />
              Passed
            </span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="px-5 pb-5 flex-1 flex flex-col">
        <p className="text-slate-400 text-sm leading-relaxed flex-1">{quiz.description}</p>

        {bestResult && (
          <div className="mt-4 flex items-center gap-2 py-2.5 px-3 bg-portal-bg rounded-lg">
            <Award className="w-4 h-4 text-portal-accent flex-shrink-0" />
            <span className="text-slate-400 text-xs">
              Best score: <span className={`font-semibold ${hasPassed ? 'text-emerald-400' : 'text-amber-400'}`}>{bestResult.score}%</span>
            </span>
          </div>
        )}

        <button
          onClick={() => navigate(`/quiz/${quiz.id}`)}
          className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-portal-accent hover:bg-portal-accent/90
                     text-white rounded-lg text-sm font-medium transition-colors"
        >
          {bestResult ? 'Retake Training' : 'Start Training'}
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function TrainingsPage() {
  const [results, setResults] = useState<QuizResult[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get<QuizResult[]>('/quiz/results')
      .then(setResults)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function bestFor(quizId: string): QuizResult | undefined {
    const rows = results.filter(r => r.quiz_id === quizId)
    if (!rows.length) return undefined
    return rows.reduce((best, r) => (r.score > best.score ? r : best), rows[0])
  }

  const passedCount = QUIZZES.filter(q => bestFor(q.id)?.passed === 1).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">Trainings</h1>
        <p className="text-slate-400 text-sm mt-1">
          Complete the courses below to sharpen your product knowledge and customer service skills.
        </p>
      </div>

      {/* Progress summary */}
      {!loading && (
        <div className="flex items-center gap-4 mb-6 p-4 bg-surface border border-portal-border rounded-xl">
          <div className="w-9 h-9 rounded-full bg-portal-accent/15 flex items-center justify-center">
            <Award className="w-5 h-5 text-portal-accent" />
          </div>
          <div>
            <p className="text-white text-sm font-medium">{passedCount} / {QUIZZES.length} completed</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-32 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className="h-full bg-portal-accent rounded-full transition-all"
                  style={{ width: QUIZZES.length ? `${(passedCount / QUIZZES.length) * 100}%` : '0%' }}
                />
              </div>
              <span className="text-slate-500 text-xs">{QUIZZES.length ? Math.round((passedCount / QUIZZES.length) * 100) : 0}%</span>
            </div>
          </div>
        </div>
      )}

      {/* Quiz grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {QUIZZES.map(quiz => (
          <QuizCard key={quiz.id} quiz={quiz} bestResult={loading ? undefined : bestFor(quiz.id)} />
        ))}
      </div>
    </div>
  )
}
