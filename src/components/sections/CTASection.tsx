import { useState } from 'react'
import { sanitizeText } from '@/utils/sanitize'

export default function CTASection() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const clean = sanitizeText(email.trim())
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRe.test(clean)) {
      setError('Please enter a valid email address.')
      return
    }
    setError('')
    // TODO: POST to newsletter endpoint.
    // Server must enforce per-IP rate limiting (e.g. 5 submissions/hour).
    setSubmitted(true)
  }

  return (
    <section className="mb-20">
      <div className="max-w-[1240px] mx-auto px-6">
        <div
          className="bg-white border border-gray-200 rounded-card px-10 py-10
                      flex flex-col sm:flex-row items-center justify-between gap-6
                      shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)]"
        >
          <div className="flex-1">
            <h2 className="text-text-dark text-[28px] font-semibold mb-2">
              Stay updated with the latest Sliquid news
            </h2>

            {submitted ? (
              <p className="text-sliquid-blue font-semibold mt-3">
                Thank you for subscribing!
              </p>
            ) : (
              <form
                onSubmit={handleSubmit}
                noValidate
                className="flex flex-col sm:flex-row gap-3 mt-4 max-w-md"
              >
                <div className="flex-1">
                  <label htmlFor="cta-email" className="sr-only">
                    Email address
                  </label>
                  <input
                    id="cta-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@company.com"
                    maxLength={254}
                    autoComplete="email"
                    className="w-full px-4 py-2.5 text-sm border border-gray-200 rounded-lg
                               focus:outline-none focus:ring-2 focus:ring-sliquid-blue focus:border-transparent
                               bg-bg-off-white"
                    aria-describedby={error ? 'cta-email-error' : undefined}
                  />
                  {error && (
                    <p
                      id="cta-email-error"
                      role="alert"
                      className="mt-1 text-red-600 text-xs"
                    >
                      {error}
                    </p>
                  )}
                </div>
                <button
                  type="submit"
                  className="bg-sliquid-blue hover:bg-sliquid-dark-blue text-white font-semibold
                             px-6 py-2.5 rounded-lg text-sm transition-colors duration-150 whitespace-nowrap"
                >
                  Subscribe
                </button>
              </form>
            )}
          </div>

          {/* Envelope SVG */}
          <div className="opacity-20 flex-shrink-0 hidden sm:block">
            <svg
              width="100"
              height="100"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  )
}
