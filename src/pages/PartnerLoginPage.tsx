import { Link } from 'react-router-dom'

export default function PartnerLoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center bg-bg-off-white">
      <div className="text-center max-w-md px-6">
        <div
          className="w-20 h-20 bg-bg-light-blue rounded-full flex items-center
                      justify-center mx-auto mb-6"
        >
          <svg
            className="w-10 h-10 text-sliquid-blue"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
        </div>
        <h1 className="text-text-dark text-2xl font-bold mb-3">Partner Login</h1>
        <p className="text-text-gray text-base leading-relaxed mb-8">
          The B2B partner portal is coming soon. For immediate wholesale access,
          please contact your Sliquid representative.
        </p>
        <Link
          to="/contact"
          className="inline-flex items-center justify-center bg-sliquid-blue hover:bg-sliquid-dark-blue
                     text-white font-semibold px-8 py-3 rounded-lg text-sm transition-colors duration-150"
        >
          Contact Us
        </Link>
      </div>
    </div>
  )
}
