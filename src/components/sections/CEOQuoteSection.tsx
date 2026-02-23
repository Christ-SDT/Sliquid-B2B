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
              &ldquo;Dean built something extraordinary — a company rooted in
              integrity, inclusion, and the belief that clean products change
              lives. It is our honor to carry that mission forward and bring
              Sliquid&rsquo;s wellness vision to every partner and customer
              around the world.&rdquo;
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
                  Co-Founder &amp; CEO, Sliquid
                </span>
              </cite>
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  )
}
