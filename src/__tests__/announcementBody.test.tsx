import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import AnnouncementBody, {
  BODY_SANDBOX,
  classifyBody,
  sanitizeRichHtml,
  extractDocument,
} from '@/components/AnnouncementBody'
import { sanitizeText } from '@/utils/sanitize'

const __dirname = dirname(fileURLToPath(import.meta.url))

/**
 * The genuine body of WordPress post 126182, exactly as the server stores it —
 * a complete standalone HTML document with global CSS and custom properties.
 */
const SHAPE_A = readFileSync(
  join(__dirname, 'fixtures/announcement-shape-a.html'),
  'utf8',
)

const SHAPE_B = `<p>Dallas, TX — Sliquid today announced <strong>Sliquid HQ</strong>.</p>
<p>More at <a href="https://sliquid.com/about/">our about page</a>.</p>`

describe('classifyBody', () => {
  it('classifies the real press release as needing isolation', () => {
    expect(classifyBody(SHAPE_A)).toBe('document')
  })

  it('classifies plain WordPress content as rich', () => {
    expect(classifyBody(SHAPE_B)).toBe('rich')
  })

  it('treats a bare <style> block as document — global CSS would leak', () => {
    expect(classifyBody('<style>body{background:red}</style><p>hi</p>')).toBe('document')
  })

  it('detects a <body> or <html> tag without a doctype', () => {
    expect(classifyBody('<html><body>x</body></html>')).toBe('document')
  })

  it('handles empty input', () => {
    expect(classifyBody('')).toBe('rich')
  })
})

describe('extractDocument — quirks-mode regression', () => {
  // If ANY markup precedes <!DOCTYPE html>, the iframe renders in quirks mode:
  // different box model, line-height and percentage heights. The author's
  // design then looks subtly wrong with no error reported anywhere.
  it('starts the srcDoc at the doctype even when wrapped in Elementor divs', () => {
    const wrapped =
      '\t\t<div data-elementor-type="wp-post" class="elementor elementor-126182">' +
      '<div class="e-con-inner"><div class="elementor-widget-container">' +
      SHAPE_A +
      '</div></div></div>\t\t'

    const out = extractDocument(wrapped)
    expect(out.trimStart().toLowerCase().startsWith('<!doctype')).toBe(true)
    expect(out).not.toContain('elementor-widget-container')
    expect(out).not.toContain('data-elementor-type')
  })

  it('preserves the author CSS custom properties the design depends on', () => {
    const out = extractDocument(SHAPE_A)
    expect(out).toContain('--ink')
    expect(out).toContain('var(--')
  })

  it('produces exactly one closing </html>', () => {
    const out = extractDocument(SHAPE_A)
    expect(out.toLowerCase().split('</html>').length - 1).toBe(1)
  })

  it('injects color-scheme, a base target and overflow guards into <head>', () => {
    const out = extractDocument(SHAPE_A)
    expect(out).toContain('name="color-scheme"')
    expect(out).toContain('<base href="https://sliquid.com/" target="_blank">')
    expect(out).toContain('overflow-x:hidden')
    // Injected inside head, before the author's own </head>
    expect(out.indexOf('color-scheme')).toBeLessThan(out.toLowerCase().indexOf('</head>'))
  })

  it('wraps a style-only fragment in a real document', () => {
    const out = extractDocument('<style>body{margin:0}</style><p>hi</p>')
    expect(out.toLowerCase().startsWith('<!doctype html>')).toBe(true)
    expect(out).toContain('body{margin:0}')
    expect(out).toContain('<p>hi</p>')
  })
})

describe('sanitizeRichHtml', () => {
  it('keeps the formatting authors actually use', () => {
    const out = sanitizeRichHtml(SHAPE_B)
    expect(out).toContain('<strong>Sliquid HQ</strong>')
    expect(out).toContain('<p>')
    expect(out).toContain('href="https://sliquid.com/about/"')
  })

  it('strips scripts and inline event handlers', () => {
    const out = sanitizeRichHtml(
      '<p onclick="steal()">x</p><script>alert(1)</script><img src="a.jpg" onerror="go()">',
    )
    expect(out).not.toContain('script')
    expect(out).not.toContain('alert')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onerror')
  })

  it('strips <style> so inline rendering cannot restyle the host page', () => {
    const out = sanitizeRichHtml('<style>body{display:none}</style><p>x</p>')
    expect(out).not.toContain('<style')
    expect(out).not.toContain('display:none')
    expect(out).toContain('<p>x</p>')
  })

  it('neutralizes javascript: URLs', () => {
    expect(sanitizeRichHtml('<a href="javascript:alert(1)">x</a>')).not.toContain('javascript:')
  })

  it('forces links to open safely in a new tab', () => {
    const out = sanitizeRichHtml('<a href="https://example.com">x</a>')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
  })

  it('forces lazy loading and a referrer policy on images', () => {
    const out = sanitizeRichHtml('<img src="https://sliquid.com/a.jpg" alt="a">')
    expect(out).toContain('loading="lazy"')
    expect(out).toContain('referrerpolicy="strict-origin-when-cross-origin"')
  })

  it('drops iframes and forms from inline content', () => {
    const out = sanitizeRichHtml('<iframe src="https://evil"></iframe><form><input></form>')
    expect(out).not.toContain('<iframe')
    expect(out).not.toContain('<form')
    expect(out).not.toContain('<input')
  })

  it('does not leak its DOMPurify hooks into utils/sanitize.ts', () => {
    // Both modules would share the default DOMPurify instance if we had not
    // created a dedicated one; the afterSanitizeAttributes hook above would
    // then start adding target/rel inside sanitizeText output.
    expect(sanitizeText('<a href="x">hi</a>')).toBe('hi')
    expect(sanitizeText('<p>plain</p>')).toBe('plain')
  })
})

describe('<AnnouncementBody /> rendering', () => {
  it('renders rich content inline, inside .announcement-body', () => {
    const { container } = render(<AnnouncementBody html={SHAPE_B} shape="rich" />)
    const body = container.querySelector('.announcement-body')
    expect(body).not.toBeNull()
    expect(container.querySelector('iframe')).toBeNull()
    expect(body!.innerHTML).toContain('<strong>Sliquid HQ</strong>')
  })

  it('renders a document body in a sandboxed iframe', () => {
    const { container } = render(<AnnouncementBody html={SHAPE_A} shape="document" />)
    const iframe = container.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(container.querySelector('.announcement-body')).toBeNull()
    expect(iframe!.getAttribute('srcdoc')).toContain('--ink')
  })

  it('SECURITY: the sandbox must never permit scripts', () => {
    const { container } = render(<AnnouncementBody html={SHAPE_A} shape="document" />)
    const sandbox = container.querySelector('iframe')!.getAttribute('sandbox')

    expect(sandbox).toBe(BODY_SANDBOX)
    // allow-scripts together with allow-same-origin would defeat the sandbox
    // entirely, granting the frame access to the parent DOM and localStorage.
    expect(sandbox).not.toContain('allow-scripts')
    expect(sandbox).toContain('allow-same-origin')
  })

  it('falls back to its own classification when the server sends no shape', () => {
    const { container: a } = render(<AnnouncementBody html={SHAPE_A} />)
    expect(a.querySelector('iframe')).not.toBeNull()

    const { container: b } = render(<AnnouncementBody html={SHAPE_B} />)
    expect(b.querySelector('iframe')).toBeNull()
    expect(b.querySelector('.announcement-body')).not.toBeNull()
  })

  it('renders nothing for empty, null or whitespace bodies', () => {
    expect(render(<AnnouncementBody html={null} />).container.innerHTML).toBe('')
    expect(render(<AnnouncementBody html="" />).container.innerHTML).toBe('')
    expect(render(<AnnouncementBody html="   " />).container.innerHTML).toBe('')
  })

  it('sets a referrer policy and an accessible title on the frame', () => {
    const { container } = render(
      <AnnouncementBody html={SHAPE_A} shape="document" title="Sample Packets" />,
    )
    const iframe = container.querySelector('iframe')!
    expect(iframe.getAttribute('referrerpolicy')).toBe('strict-origin-when-cross-origin')
    expect(iframe.getAttribute('title')).toBe('Sample Packets')
  })

  it('never injects the raw document inline (no style leak into the host page)', () => {
    const { container } = render(<AnnouncementBody html={SHAPE_A} shape="document" />)
    // The author's CSS must live only inside the frame's srcdoc attribute.
    expect(container.querySelector('style')).toBeNull()
    expect(container.textContent).not.toContain('box-sizing')
  })
})
