export default function CEOQuoteSection() {
  return (
    <section
      className="py-16"
      aria-labelledby="ceo-quote-heading"
    >
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-[800px] mx-auto">
          <blockquote>
            <p
              id="ceo-quote-heading"
              className="text-text-dark text-[32px] font-medium leading-[1.4]"
              style={{ fontStyle: 'normal' }}
            >
              From the beginning, Sliquid has created solutions for women, by women, rooted in care, trust, and a true understanding of intimate wellness. Our retail and medical partners are an extension of that mission, and your success reflects the impact we&rsquo;re making together. When our partners grow, we grow, and that shared purpose drives everything we do.
            </p>
            <footer className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-4">
              <img
                src="/images/team/cynthia-elliott.png"
                alt="Cynthia Elliott"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                className="w-14 h-14 rounded-full object-cover object-top bg-bg-off-white"
              />
              <cite className="not-italic text-left">
                <span className="block font-semibold text-text-dark text-base">
                  Cynthia Elliott
                </span>
                <span className="block text-text-gray text-sm">
                  Co-Founder &amp; CEO
                </span>
              </cite>
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  )
}
