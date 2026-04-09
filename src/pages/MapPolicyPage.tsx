const MAP_PDF_URL =
  'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/portal-assets/media/ac951405-53e9-4fdf-b571-1ae9ac199033.pdf'

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

export default function MapPolicyPage() {
  return (
    <main className="bg-white min-h-screen">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">
            Retail Policy
          </p>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <h1 className="text-text-dark text-[36px] font-semibold tracking-[-0.5px] leading-tight">
              Minimum Advertised Price Policy
            </h1>
            <a
              href={MAP_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 bg-sliquid-blue hover:bg-sliquid-dark-blue
                         text-white text-sm font-semibold px-5 py-2.5 rounded-xl
                         transition-colors duration-150 whitespace-nowrap flex-shrink-0 self-start sm:self-auto"
            >
              <DownloadIcon className="w-4 h-4" />
              Download PDF
            </a>
          </div>
        </div>
      </section>

      {/* ── Policy Body ───────────────────────────────────────────────────────── */}
      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto space-y-6 text-text-gray text-base leading-relaxed">

          <p>
            This Minimum Advertised Price policy has been unilaterally drafted and adopted by Sliquid, LLC.
            Nothing in this policy constitutes an agreement between Sliquid, LLC and any retailer. Each
            retailer, at its own discretion, can choose to acquiesce or not acquiesce with this policy.
            Sliquid, LLC will not discuss conditions of acceptance related to this policy. This policy is
            non-negotiable and will not be altered, modified, or amended for any retailer.
          </p>

          <p>
            This policy applies to all resellers selling directly to the end user, on all platforms. The
            Minimum Advertised Price for all Sliquid, LLC products, whether sold in brick and mortar stores,
            on company websites or third party reseller sites including but not limited to Amazon.com is
            established at{' '}
            <strong className="text-text-dark font-semibold">20% below MSRP</strong>. MSRP rates are set
            in the official Sliquid, LLC Price List, which can be obtained by{' '}
            <a href="/contact" className="text-sliquid-blue hover:underline">
              contacting your sales representative
            </a>.
          </p>

          <p>
            This Minimum Advertised Price policy does not restrict the retailer's right to establish
            independent advertised and/or resale prices of Sliquid, LLC's products. This policy was not
            developed in coordination with, or with input from, any of Sliquid, LLC's retailers.
          </p>

          <p>
            We reserve the right to determine whether a retailer has advertised our products at a net
            advertised price less than the MAP price established in this policy. If we make such a
            determination, Sliquid, LLC may, without assuming any liability, issue consequences, including
            cancelling open orders and indefinitely refusing to accept new orders from the retailer. This
            includes instructing official Sliquid, LLC wholesale distributors to cease future sales to
            retailers found to have violated this policy.
          </p>

          <p>
            Sliquid, LLC sales representatives do not have authority to modify or grant exceptions to the
            terms of this MAP policy. All questions regarding interpretation of this policy should be
            addressed to the Policy Administrator:{' '}
            <a href="mailto:colin@sliquid.com" className="text-sliquid-blue hover:underline">
              colin@sliquid.com
            </a>
          </p>

          <p>
            We recognize that our high-quality retailers invest time and resources to deliver an
            extraordinary customer experience through knowledgeable staff and compelling vendor
            presentation. To support these efforts, Sliquid, LLC wishes to establish policies that allow
            our resale partners to earn the profits necessary to maintain the high level of customer
            excellence people have come to expect from Sliquid, LLC retailers.
          </p>

          {/* Non-compliant advertising */}
          <div>
            <p className="mb-4">Advertising approaches that do not comply with this MAP policy include:</p>
            <ul className="space-y-3 pl-1">
              {[
                'Ads that request the End User to "see price in cart," "click to see price," "add to cart for lowest price"',
                'An advertised price that is struck through or otherwise crossed out',
                'An advertised price not shown at all, for example with language asking, "Why don\'t we show a price?"',
                'Any type of advertising on the product\'s main sales listing page from which the End User can infer that by clicking through to the cart they will see a lower price, and where that price will be below the price established in this MAP policy',
              ].map((item, i) => (
                <li key={i} className="flex gap-3">
                  <span className="text-sliquid-blue font-bold flex-shrink-0 mt-0.5">·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <p>
            Temporary exceptions to the MAP policy for short term promotions or holiday sales are expected
            and acknowledged. Retailers can expect not to incur any penalty for advertised prices below MAP
            when said pricing is established to be limited in duration (no more than 15 days, limited to no
            more than 4 times per calendar year), and advertised pricing returns to MAP rates after the
            established duration.
          </p>

          {/* Violations */}
          <div className="bg-bg-off-white border border-gray-200 rounded-2xl px-6 py-5">
            <p>
              If you find or suspect a retailer of violating the Sliquid, LLC MAP Policy, you can reach
              out to your sales representative or contact Sliquid, LLC at{' '}
              <a href="mailto:legal@sliquid.com" className="text-sliquid-blue hover:underline font-medium">
                legal@sliquid.com
              </a>
            </p>
          </div>

          {/* Download CTA */}
          <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row items-start sm:items-center
                          justify-between gap-4">
            <p className="text-text-gray text-sm">
              A downloadable version of this policy is available for your records.
            </p>
            <a
              href={MAP_PDF_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 border border-sliquid-blue text-sliquid-blue
                         hover:bg-sliquid-blue hover:text-white text-sm font-semibold px-5 py-2.5
                         rounded-xl transition-colors duration-150 whitespace-nowrap flex-shrink-0"
            >
              <DownloadIcon className="w-4 h-4" />
              Download MAP Policy PDF
            </a>
          </div>

        </div>
      </section>

    </main>
  )
}
