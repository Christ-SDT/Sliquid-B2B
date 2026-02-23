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
              &ldquo;Sliquid has completely changed the conversation around
              organic lubricants. We are more than just a manufacturer&mdash;we
              are an innovation leader in body-safe intimacy.&rdquo;
            </p>
            <footer className="mt-5">
              <cite className="not-italic font-semibold text-text-dark text-base">
                Dean Elliott, Founder &amp; CEO
              </cite>
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  )
}
