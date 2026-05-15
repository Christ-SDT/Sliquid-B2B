export default function AccessibilityPage() {
  return (
    <div className="bg-white min-h-screen">

      {/* Header */}
      <section className="bg-bg-off-white border-b border-gray-100 py-12 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto">
          <p className="text-sliquid-blue text-sm font-semibold uppercase tracking-widest mb-2">Legal</p>
          <h1 className="text-text-dark text-[38px] font-semibold tracking-[-0.5px] leading-tight">
            Accessibility Statement
          </h1>
        </div>
      </section>

      {/* Body */}
      <section className="py-14 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto space-y-10 text-text-gray text-base leading-relaxed">

          {/* Compliance status */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Compliance Status</h2>
            <p className="mb-4">
              We firmly believe that the internet should be available and accessible to anyone, and are committed to providing a website that is accessible to the widest possible audience, regardless of circumstance and ability.
            </p>
            <p className="mb-4">
              To fulfill this, we aim to adhere as strictly as possible to the World Wide Web Consortium's (W3C) Web Content Accessibility Guidelines 2.1 (WCAG 2.1) at the AA level. These guidelines explain how to make web content accessible to people with a wide array of disabilities. Complying with those guidelines helps us ensure that the Sliquid B2B Partner Portal is accessible to all people: blind people, people with motor impairments, visual impairment, cognitive disabilities, and more.
            </p>
            <p className="mb-4">
              This website utilizes various technologies that are meant to make it as accessible as possible at all times. We utilize an accessibility interface that allows persons with specific disabilities to adjust the website's UI (user interface) and design it to their personal needs.
            </p>
            <p>
              Additionally, the website utilizes an AI-based application that runs in the background and optimizes its accessibility level constantly. This application remediates the website's HTML, adapts its functionality and behavior for screen-readers used by blind users, and for keyboard functions used by individuals with motor impairments.
            </p>
          </div>

          {/* Contact */}
          <div className="bg-bg-off-white rounded-xl p-6 border border-gray-100">
            <p>
              If you wish to contact the website's owner please email us at{' '}
              <a href="mailto:info@sliquid.com" className="text-sliquid-blue hover:underline font-medium">
                info@sliquid.com
              </a>
            </p>
          </div>

          {/* Screen-reader and keyboard navigation */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Screen-Reader and Keyboard Navigation</h2>
            <p className="mb-4">
              Our website implements the ARIA attributes (Accessible Rich Internet Applications) technique, alongside various different behavioral changes, to ensure blind users visiting with screen-readers are able to read, comprehend, and enjoy the website's functions. As soon as a user with a screen-reader enters the site, they immediately receive a prompt to enter the Screen-Reader Profile so they can browse and operate the site effectively.
            </p>

            <h3 className="text-text-dark text-lg font-semibold mb-3">Screen-Reader Optimization</h3>
            <p className="mb-4">
              We run a background process that learns the website's components from top to bottom, to ensure ongoing compliance even when updating the website. In this process, we provide screen-readers with meaningful data using the ARIA set of attributes. For example, we provide accurate form labels; descriptions for actionable icons (social media icons, search icons, cart icons, etc.); validation guidance for form inputs; element roles such as buttons, menus, modal dialogues (popups), and others.
            </p>
            <p className="mb-4">
              Additionally, the background process scans all of the website's images and provides an accurate and meaningful image-object-recognition-based description as an ALT (alternate text) tag for images that are not described. It will also extract texts that are embedded within the image, using an OCR (optical character recognition) technology. To turn on screen-reader adjustments at any time, users need only to press the <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Alt+1</kbd> keyboard combination. Screen-reader users also get automatic announcements to turn the Screen-reader mode on as soon as they enter the website.
            </p>
            <p className="mb-6">
              These adjustments are compatible with all popular screen readers, including JAWS and NVDA.
            </p>

            <h3 className="text-text-dark text-lg font-semibold mb-3">Keyboard Navigation Optimization</h3>
            <p className="mb-4">
              The background process also adjusts the website's HTML, and adds various behaviors using JavaScript code to make the website operable by the keyboard. This includes the ability to navigate the website using the <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Tab</kbd> and <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Shift+Tab</kbd> keys, operate dropdowns with the arrow keys, close them with <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Esc</kbd>, trigger buttons and links using the <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Enter</kbd> key, navigate between radio and checkbox elements using the arrow keys, and fill them in with the <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Spacebar</kbd> or <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Enter</kbd> key.
            </p>
            <p>
              Additionally, keyboard users will find quick-navigation and content-skip menus, available at any time by clicking <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">Alt+1</kbd>, or as the first element of the site while navigating with the keyboard. Users can also use shortcuts such as <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">M</kbd> (menus), <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">H</kbd> (headings), <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">F</kbd> (forms), <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">B</kbd> (buttons), and <kbd className="bg-gray-100 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-dark">G</kbd> (graphics) to jump to specific elements.
            </p>
          </div>

          {/* Disability profiles */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Disability Profiles Supported</h2>
            <div className="space-y-4">
              {[
                {
                  title: 'Epilepsy Safe Profile',
                  desc: 'This profile enables people with epilepsy to use the website safely by eliminating the risk of seizures that result from flashing or blinking animations and risky color combinations.',
                },
                {
                  title: 'Vision Impaired Profile',
                  desc: 'This profile adjusts the website so that it is accessible to the majority of visual impairments such as Degrading Eyesight, Tunnel Vision, Cataract, Glaucoma, and others.',
                },
                {
                  title: 'Cognitive Disability Profile',
                  desc: 'This profile provides various assistive features to help users with cognitive disabilities such as Autism, Dyslexia, CVA, and others, to focus on the essential elements more easily.',
                },
                {
                  title: 'ADHD Friendly Profile',
                  desc: 'This profile significantly reduces distractions and noise, to help people with ADHD and Neurodevelopmental disorders browse, read, and focus on the essential elements more easily.',
                },
                {
                  title: 'Blind Users Profile (Screen-readers)',
                  desc: 'This profile adjusts the website to be compatible with screen-readers such as JAWS, NVDA, VoiceOver, and TalkBack. A screen-reader is installed on the blind user\'s computer, and this site is compatible with it.',
                },
                {
                  title: 'Keyboard Navigation Profile (Motor-Impaired)',
                  desc: 'This profile enables motor-impaired persons to operate the website using the keyboard Tab, Shift+Tab, and the Enter keys. Users can also use shortcuts such as "M" (menus), "H" (headings), "F" (forms), "B" (buttons), and "G" (graphics) to jump to specific elements.',
                },
              ].map(profile => (
                <div key={profile.title} className="bg-bg-off-white rounded-xl p-5 border border-gray-100">
                  <h3 className="text-text-dark font-semibold mb-1">{profile.title}</h3>
                  <p className="text-sm">{profile.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* UI adjustments */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Additional UI, Design, and Readability Adjustments</h2>
            <ul className="space-y-3">
              {[
                { label: 'Font adjustments', desc: 'Users can increase and decrease font size, change its family (type), adjust the spacing, alignment, line height, and more.' },
                { label: 'Color adjustments', desc: 'Users can select various color contrast profiles such as light, dark, inverted, and monochrome. Additionally, users can swap color schemes of titles, texts, and backgrounds, with over 7 different coloring options.' },
                { label: 'Animations', desc: 'Epileptic users can stop all running animations with the click of a button. Animations controlled by the interface include videos, GIFs, and CSS flashing transitions.' },
                { label: 'Content highlighting', desc: 'Users can choose to emphasize important elements such as links and titles. They can also choose to highlight focused or hovered elements only.' },
                { label: 'Audio muting', desc: 'Users with hearing devices may experience headaches or other issues due to automatic audio playing. This option lets users mute the entire website instantly.' },
                { label: 'Cognitive disorders', desc: 'We utilize a search engine that is linked to Wikipedia and Wiktionary, allowing people with cognitive disorders to decipher meanings of phrases, initials, slang, and others.' },
                { label: 'Additional functions', desc: 'We provide users the option to change cursor color and size, use a printing mode, enable a virtual keyboard, and many other functions.' },
              ].map(item => (
                <li key={item.label} className="flex gap-3">
                  <span className="mt-1 flex-shrink-0 w-2 h-2 rounded-full bg-sliquid-blue" />
                  <span><span className="text-text-dark font-medium">{item.label}</span> — {item.desc}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Browser compatibility */}
          <div>
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Assistive Technology and Browser Compatibility</h2>
            <p>
              We aim to support the widest array of browsers and assistive technologies as possible, so our users can choose the best fitting tools for them, with as few limitations as possible. We have worked very hard to support all major systems that comprise over 95% of the user market share including Google Chrome, Mozilla Firefox, Apple Safari, Opera and Microsoft Edge, JAWS, and NVDA (screen readers), both for Windows and for Mac users.
            </p>
          </div>

          {/* Notes and feedback */}
          <div className="pb-10">
            <h2 className="text-text-dark text-2xl font-semibold mb-4">Notes, Comments, and Feedback</h2>
            <p className="mb-4">
              Despite our very best efforts to allow anybody to adjust the website to their needs, there may still be pages or sections that are not fully accessible, are in the process of becoming accessible, or are lacking an adequate technological solution to make them accessible. Still, we are continually improving our accessibility, adding, updating, and improving its options and features, and developing and adopting new technologies. All this is meant to reach the optimal level of accessibility, following technological advancements.
            </p>
            <p>
              If you wish to contact the website's owner please email{' '}
              <a href="mailto:info@sliquid.com" className="text-sliquid-blue hover:underline font-medium">
                info@sliquid.com
              </a>
            </p>
          </div>

        </div>
      </section>
    </div>
  )
}
