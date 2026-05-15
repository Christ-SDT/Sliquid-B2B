export default function TermsPage() {
  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-text-dark text-[38px] font-semibold tracking-[-0.5px] leading-tight mb-3">
            Terms of Use
          </h1>
          <p className="text-text-gray text-sm">
            Welcome to the Sliquid B2B Partner Portal. By accessing or using this site, you agree to be bound by the following terms and conditions. Please read them carefully before proceeding.
          </p>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto space-y-10 text-text-gray text-base leading-relaxed">

          {/* Privacy Policy */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Privacy Policy</h2>
            <p>
              Please review our{' '}
              <a href="/privacy-policy" className="text-sliquid-blue hover:underline font-medium">Privacy Policy</a>,
              which also governs your use of the Sliquid B2B Partner Portal, to understand our data practices.
              By using this site you acknowledge that you have read and understood our Privacy Policy.
            </p>
          </div>

          {/* Electronic Communications */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Electronic Communications</h2>
            <p>
              When you visit the Sliquid B2B Partner Portal or send emails to us, you are communicating with us electronically.
              You consent to receive communications from us electronically, including by email or by notices posted on this site.
              You agree that all agreements, notices, disclosures, and other communications that we provide to you electronically
              satisfy any legal requirement that such communications be in writing.
            </p>
          </div>

          {/* Copyright */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Copyright</h2>
            <p>
              All content included on this site, including but not limited to text, graphics, logos, product images, brand assets,
              marketing materials, audio and video clips, and training content, is the property of Sliquid, LLC or its content
              suppliers and is protected by United States and international copyright laws. The compilation of all content on
              this site is the exclusive property of Sliquid, LLC. Unauthorized reproduction or distribution of any content
              from this site is strictly prohibited.
            </p>
          </div>

          {/* License and Site Access */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">License and Site Access</h2>
            <p className="mb-4">
              Sliquid, LLC grants you a limited, non-exclusive, non-transferable license to access and use this site solely
              for legitimate B2B business purposes in connection with your authorized partnership with Sliquid. This license
              does not include the right to download, copy, or modify any portion of this site except with express written
              consent from Sliquid, LLC.
            </p>
            <p className="mb-4">
              This license does not permit any resale or unauthorized commercial use of this site or its contents, including
              any collection or redistribution of product listings, descriptions, pricing, or marketing assets outside of your
              authorized partner activities. You may not use data mining, automated scripts, robots, or similar data gathering
              tools against this site without prior written authorization.
            </p>
            <p>
              Any unauthorized use immediately terminates the license granted to you. Sliquid, LLC reserves the right to
              revoke access at any time for any violation of these terms.
            </p>
          </div>

          {/* Your Partner Account */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Your Partner Account</h2>
            <p className="mb-4">
              As an authorized partner, you are responsible for maintaining the confidentiality of your account credentials
              and for restricting access to your account. You agree to accept full responsibility for all activities that
              occur under your account or password. You must notify Sliquid immediately of any unauthorized use of your account.
            </p>
            <p>
              Sliquid, LLC reserves the right to refuse service, suspend or terminate accounts, remove or edit content,
              or cancel partner agreements at its sole discretion, including in cases of suspected misuse, fraud, or
              violation of these terms or any applicable partner agreement.
            </p>
          </div>

          {/* Authorized Use of Brand Assets */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Authorized Use of Brand Assets</h2>
            <p className="mb-4">
              Marketing assets, product imagery, logos, and other brand materials available through this portal are provided
              exclusively for use by authorized Sliquid retail partners, distributors, and healthcare practitioners in
              connection with the legitimate promotion and sale of Sliquid products.
            </p>
            <p className="mb-4">The following uses are expressly prohibited:</p>
            <ul className="space-y-2 ml-4">
              {[
                'Using brand assets to promote competing products or brands.',
                'Altering, modifying, or creating derivative works from Sliquid logos, trademarks, or product imagery without express written consent.',
                'Using the Sliquid name, trademarks, or variations thereof in your domain name, paid advertising, or marketing materials in a way that misrepresents your relationship with Sliquid.',
                'Framing or embedding any portion of this site or its assets on another website without written authorization.',
                'Representing yourself as Sliquid, LLC or creating any impression that your business is operated by or directly affiliated with Sliquid.',
                'Distributing assets to unauthorized third parties outside of your approved partner activities.',
                'Using brand assets in any content that promotes violence, hate speech, discrimination, illegal activity, or content that is defamatory or objectionable.',
              ].map((item, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-sliquid-blue/10 text-sliquid-blue flex items-center justify-center text-xs font-bold mt-0.5">
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* Partner Program Terms */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Partner Program Terms</h2>
            <p className="mb-4">
              Access to the Sliquid B2B Partner Portal is granted to approved wholesale retailers, distributors, and
              healthcare practitioners following review and approval of a partnership application. Approval of an application
              does not constitute a guarantee of continued access. Sliquid, LLC reserves the right to re-evaluate any
              partnership at any time and to revoke access at its sole discretion.
            </p>
            <p className="mb-4">
              Partners are responsible for complying with all applicable laws in their territory, including consumer protection
              laws, advertising standards, and import or distribution regulations. It is the partner's sole responsibility
              to ensure that all promotional and sales activity complies with local law.
            </p>
            <p>
              Sliquid, LLC reserves the right to terminate a partner relationship immediately and without notice in cases
              of fraud, misrepresentation, breach of these terms, or conduct detrimental to the Sliquid brand.
            </p>
          </div>

          {/* Intellectual Property */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Intellectual Property</h2>
            <p>
              All trademarks, service marks, trade names, product names, and logos appearing on this site are the property
              of Sliquid, LLC or their respective owners. Nothing on this site grants you any right or license to use any
              trademark, logo, or brand identifier without the express written permission of Sliquid, LLC or the relevant
              rights holder. Any unauthorized use of Sliquid intellectual property is strictly prohibited and may result
              in legal action.
            </p>
          </div>

          {/* Disclaimer of Warranties */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Disclaimer of Warranties and Limitation of Liability</h2>
            <p className="mb-4 text-sm uppercase font-medium text-text-dark">
              This site and all information, content, materials, products, and services included on or otherwise made available
              to you through this site are provided by Sliquid, LLC on an "as is" and "as available" basis unless otherwise
              specified in writing.
            </p>
            <p className="mb-4">
              Sliquid, LLC makes no representations or warranties of any kind, express or implied, as to the operation of
              this site or the information, content, materials, or services included on or made available through this site,
              unless otherwise specified in writing. Your use of this site is at your sole risk.
            </p>
            <p>
              Certain state or national laws do not allow limitations on implied warranties or the exclusion or limitation
              of certain damages. If these laws apply to you, some or all of the above disclaimers, exclusions, or limitations
              may not apply, and you may have additional rights.
            </p>
          </div>

          {/* Changes to Terms */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Changes to These Terms</h2>
            <p>
              Sliquid, LLC reserves the right to modify these Terms of Use at any time. Changes will be posted on this page
              with an updated effective date. Your continued use of the Sliquid B2B Partner Portal after any changes are
              posted constitutes your acceptance of the revised terms. We encourage you to review these terms periodically.
            </p>
          </div>

          {/* Contact */}
          <div className="pb-10 border-t border-gray-100 pt-10">
            <h2 className="text-text-dark text-xl font-semibold mb-3">Questions</h2>
            <p className="text-sm">
              If you have questions about these Terms of Use, please contact us at{' '}
              <a href="mailto:sales@sliquid.com" className="text-sliquid-blue hover:underline font-medium">
                sales@sliquid.com
              </a>{' '}
              or by mail at Sliquid, LLC, 2544 Irving Blvd., Dallas, Texas 75207.
            </p>
          </div>

        </div>
      </section>
    </div>
  )
}
