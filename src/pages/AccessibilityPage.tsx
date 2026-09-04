import { Link } from 'react-router-dom'

/**
 * HQ 01 (accessibility remediation plan, Sept 2026 — critical/release-blocker).
 *
 * The previous copy on this page described an AI accessibility interface,
 * automatic screen-reader prompts, an Alt+1 activation shortcut, disability
 * profiles, and color/animation controls. None of that exists on this site —
 * it was template boilerplate for a third-party overlay widget that was
 * never actually installed. Describing features that aren't present is a
 * false public representation, so this page was rewritten to describe only
 * what is actually deployed, name WCAG 2.2 Level AA as a target rather than
 * a verified conformance claim, and disclose the tested scope.
 *
 * NOTE for whoever publishes this next: the response-time commitment under
 * "Contact us" is deliberately generic. Per the remediation plan, an actual
 * response-time commitment needs content/legal approval before it's added.
 * Update REVIEW_DATE (and the scope/limitations copy below) whenever this
 * statement, the tested scope, or known limitations change.
 */
const REVIEW_DATE = 'September 4, 2026'

export default function AccessibilityPage() {
  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-text-dark text-[38px] font-semibold tracking-[-0.5px] leading-tight">
            Accessibility at Sliquid HQ
          </h1>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto space-y-10 text-text-gray text-base leading-relaxed">

          {/* Our commitment */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Our commitment</h2>
            <p>
              Sliquid HQ is committed to providing a digital experience that is usable by people
              with disabilities. We are working toward conformance with the{' '}
              <a
                href="https://www.w3.org/TR/WCAG22/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sliquid-blue hover:underline font-medium"
              >
                Web Content Accessibility Guidelines (WCAG) 2.2
              </a>{' '}
              at Level AA. This statement describes where that work currently stands — it is not
              a claim that every page fully conforms today.
            </p>
          </div>

          {/* How we assess accessibility */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">How we assess accessibility</h2>
            <p>
              We evaluate accessibility through a combination of automated checks and manual
              testing, including keyboard-only navigation, browser zoom and page reflow, color
              contrast review, and assistive-technology testing with screen readers such as
              VoiceOver and NVDA. Automated scanning tools are useful for catching regressions,
              but they do not by themselves determine conformance — the manual testing is what we
              rely on to confirm a page actually works for someone using a keyboard or a screen
              reader.
            </p>
          </div>

          {/* Current scope and limitations */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Current scope and limitations</h2>
            <p className="mb-4">
              Our most recent review covered the public home, partner login, product catalog,
              contact, health practitioners, accessibility, and privacy policy pages. We are
              continuing to verify accessibility for the authenticated partner portal — the
              features available after signing in have not yet completed the same review, and we
              are not representing them as conformant until they have.
            </p>
            <p>
              Known issues we're actively working through include ensuring every page has a
              unique, descriptive title, that interactive controls (like catalog filters and
              search) clearly announce their name and state to assistive technology, and that
              text and control colors meet WCAG contrast thresholds site-wide. If you run into
              something not listed here, please let us know using the contact information below —
              that's the fastest way for it to reach the people who can fix it.
            </p>
          </div>

          {/* Contact */}
          <div className="bg-bg-off-white rounded-xl p-6 border border-gray-100">
            <h2 className="text-text-dark text-lg font-semibold mb-2">Contact us</h2>
            <p>
              If you encounter an accessibility barrier, or need information in another format,{' '}
              <Link to="/contact" className="text-sliquid-blue hover:underline font-medium">
                reach us through our contact form
              </Link>{' '}
              or email{' '}
              <a href="mailto:info@sliquid.com" className="text-sliquid-blue hover:underline font-medium">
                info@sliquid.com
              </a>
              . Please identify the page or feature you were using, describe the problem, and let
              us know the best way to follow up with you.
            </p>
          </div>

          {/* Review date */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-2">Review date</h2>
            <p>
              Last reviewed {REVIEW_DATE}. We update this date whenever this statement, the
              tested scope, or our known limitations change.
            </p>
          </div>

          {/* Reference standards */}
          <div className="pb-10">
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Reference standards</h2>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://www.w3.org/TR/WCAG22/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sliquid-blue hover:underline font-medium"
                >
                  WCAG 2.2 Recommendation
                </a>
              </li>
              <li>
                <a
                  href="https://www.w3.org/WAI/test-evaluate/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sliquid-blue hover:underline font-medium"
                >
                  WAI: Evaluating Web Accessibility Overview
                </a>
              </li>
              <li>
                <a
                  href="https://www.w3.org/WAI/ARIA/apg/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sliquid-blue hover:underline font-medium"
                >
                  WAI ARIA Authoring Practices Guide
                </a>
              </li>
            </ul>
          </div>

        </div>
      </section>
    </div>
  )
}
