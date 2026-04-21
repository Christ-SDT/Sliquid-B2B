export default function CEOQuoteSection() {
  return (
    <section
      className="py-16"
      aria-labelledby="ceo-quote-heading"
    >
      <div className="max-w-[1240px] mx-auto px-6 mb-12">
        <h2 className="text-black text-4xl font-bold text-center">
          Message from the CEO
        </h2>
        <div className="mt-4 mx-auto h-1 w-24 bg-sliquid-blue rounded-full" />
      </div>
      <div className="max-w-[1240px] mx-auto px-6">
        <div className="text-center max-w-[800px] mx-auto">
          <blockquote>
            <p
              id="ceo-quote-heading"
              className="text-text-dark text-[32px] font-medium leading-[1.4]"
              style={{ fontStyle: 'normal' }}
            >
              "Welcome to Sliquid HQ! We&rsquo;re so glad you&rsquo;re here. This space was created with you in mind, our retail and medical partners, to give you easy access to information and resources that support your work. Everything here is designed to help you feel confident and informed as you share the Sliquid mission with your customers and patients."
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
