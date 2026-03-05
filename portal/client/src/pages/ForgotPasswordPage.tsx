import { Link } from 'react-router-dom'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-portal-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-portal-accent flex items-center justify-center mb-4">
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
              <path d="M16 3C16 3 5 14.5 5 20.5a11 11 0 0022 0C27 14.5 16 3 16 3z" fill="white"/>
            </svg>
          </div>
          <h1 className="text-on-canvas font-bold text-2xl tracking-wider">SLIQUID</h1>
          <p className="text-on-canvas-muted text-xs font-medium tracking-widest mt-1">PARTNER PORTAL</p>
        </div>

        {/* Card */}
        <div className="bg-surface border border-portal-border rounded-2xl p-8 text-center">
          <h2 className="text-on-canvas text-xl font-semibold mb-3">Reset your password</h2>
          <p className="text-on-canvas-subtle text-sm leading-relaxed mb-2">
            To reset your password, please contact your Sliquid administrator at
          </p>
          <a
            href="mailto:portal@sliquid.com"
            className="text-portal-accent font-medium hover:underline text-sm"
          >
            portal@sliquid.com
          </a>

          <div className="mt-8">
            <Link
              to="/login"
              className="text-on-canvas-muted hover:text-on-canvas-subtle text-sm transition-colors"
            >
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
