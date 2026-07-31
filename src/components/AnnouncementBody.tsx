/**
 * Renders an announcement body from WordPress.
 *
 * ⚠️ DUPLICATED FILE — keep in sync with the sibling copy:
 *      marketing: src/components/AnnouncementBody.tsx
 *      portal:    portal/client/src/components/AnnouncementBody.tsx
 * The two copies are byte-identical; all styling lives in each app's
 * `.announcement-body` CSS block, not here. (The apps have separate lockfiles
 * and toolchains, so sharing via a workspace package would mean migrating both
 * builds to ship one feature.)
 *
 * Bodies arrive in one of two shapes:
 *
 *   'rich'     — plain WordPress content (<p>/<strong>/<a>/<img>). Rendered
 *                INLINE after sanitization, so it inherits site typography and
 *                dark mode, supports find-in-page, and stays SEO-indexable.
 *
 *   'document' — the author pasted a COMPLETE HTML document (with its own
 *                <style> using global selectors like `* {}`, `body {}` and
 *                `:root { --var }`) into an Elementor HTML widget. Rendered in
 *                a sandboxed iframe, because injecting it inline would leak
 *                those rules into the host page and browsers strip/hoist
 *                <html>/<head>/<style> unpredictably.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import createDOMPurify from 'dompurify'

// A dedicated instance: addHook() mutates the shared default export globally,
// so hooks registered here would otherwise also fire for the plain-text
// sanitizeText() calls in utils/sanitize.ts.
const purify = createDOMPurify(window)

purify.addHook('afterSanitizeAttributes', (node) => {
  const el = node as Element
  if (el.tagName === 'A' && el.hasAttribute('href')) {
    el.setAttribute('target', '_blank')
    el.setAttribute('rel', 'noopener noreferrer nofollow')
  }
  if (el.tagName === 'IMG') {
    el.setAttribute('loading', 'lazy')
    el.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin')
  }
})

/**
 * ⛔ SECURITY INVARIANT — NEVER ADD 'allow-scripts' TO THIS STRING.
 *
 * Without 'allow-scripts' the sandbox blocks ALL script execution inside the
 * frame: <script> elements, inline on* handlers and javascript: URLs are all
 * inert. 'allow-same-origin' is present ONLY so the PARENT can read
 * iframe.contentDocument to measure height — since nothing in the frame can
 * run, same-origin grants the *content* nothing.
 *
 * Adding 'allow-scripts' alongside 'allow-same-origin' removes the sandbox
 * entirely: the frame would gain full same-origin access to the parent DOM and
 * localStorage (in the portal, that includes portal_token).
 *
 * This also sidesteps CSP: a srcdoc frame inherits the embedder's policy, and
 * the marketing site sets `script-src 'self'` with no 'unsafe-inline', so an
 * injected height-reporter script would be blocked anyway. Measuring from the
 * parent needs no script in the frame at all.
 *
 * A unit test asserts this exact string. Do not "fix" that test.
 */
export const BODY_SANDBOX = 'allow-same-origin allow-popups allow-popups-to-escape-sandbox'

const ALLOWED_TAGS = [
  'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small',
  'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption',
  'span', 'div',
]

const ALLOWED_ATTR = [
  'href', 'target', 'rel', 'src', 'alt', 'title', 'width', 'height',
  'loading', 'referrerpolicy', 'colspan', 'rowspan',
]

export type BodyShape = 'document' | 'rich'

/**
 * A body needs full isolation if it declares a document OR carries any global
 * CSS. A bare <style> block is enough on its own: `body {}` / `* {}` /
 * `:root {}` would restyle the whole host page.
 */
export function classifyBody(html: string): BodyShape {
  return /<!doctype\s+html|<html[\s>]|<body[\s>]|<style[\s>]/i.test(html ?? '')
    ? 'document'
    : 'rich'
}

export function sanitizeRichHtml(dirty: string): string {
  return purify.sanitize(dirty ?? '', {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form',
      'input', 'button', 'link', 'meta', 'base', 'svg'],
    ALLOW_DATA_ATTR: false,
  })
}

const HEAD_INJECT =
  // Keep the author's light design coherent rather than half-inverting it in
  // the portal's dark theme.
  '<meta name="color-scheme" content="light">' +
  // target=_blank on <base> makes in-frame links open a new tab instead of
  // navigating the frame itself to sliquid.com in place.
  '<base href="https://sliquid.com/" target="_blank">' +
  '<style>html,body{overflow-x:hidden}img,table,pre{max-width:100%}</style>'

function injectHead(doc: string): string {
  const head = doc.match(/<head[^>]*>/i)
  if (head) return doc.replace(head[0], head[0] + HEAD_INJECT)
  const html = doc.match(/<html[^>]*>/i)
  if (html) return doc.replace(html[0], `${html[0]}<head>${HEAD_INJECT}</head>`)
  return doc
}

/**
 * Slice the real HTML document out of whatever surrounds it.
 *
 * ⚠️ QUIRKS MODE: Shape A documents arrive NESTED INSIDE Elementor wrapper
 * divs. Handing the raw body to srcDoc puts markup before the doctype, and the
 * frame then renders in quirks mode — different box model, default line-height
 * and percentage heights — so the author's design is subtly wrong with no error
 * anywhere. The server strips the wrapper too; this is the defensive half.
 */
export function extractDocument(html: string): string {
  const src = html ?? ''
  const start = src.search(/<!doctype\s+html|<html[\s>]/i)
  const end = src.toLowerCase().lastIndexOf('</html>')

  if (start >= 0 && end > start) {
    return injectHead(src.slice(start, end + '</html>'.length))
  }

  // Global CSS but no document wrapper — build a minimal host document so the
  // styles still apply inside the frame instead of leaking out of it.
  return injectHead(
    '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    `</head><body>${src}</body></html>`,
  )
}

function IsolatedBody({ html, title }: { html: string; title?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(560)
  const [loadNonce, setLoadNonce] = useState(0)
  const [isolationFailed, setIsolationFailed] = useState(false)

  const measure = useCallback(() => {
    const doc = ref.current?.contentDocument
    if (!doc) return
    const h = Math.max(
      doc.documentElement?.scrollHeight ?? 0,
      doc.body?.scrollHeight ?? 0,
    )
    if (h > 0) setHeight(h)
  }, [])

  useEffect(() => {
    // Only measure after the frame has loaded the srcDoc document — reading
    // contentDocument before that would measure about:blank.
    if (loadNonce === 0) return

    const doc = ref.current?.contentDocument
    const empty = !doc?.body || (!doc.body.childElementCount && !doc.body.textContent?.trim())
    if (!doc || empty) {
      // contentDocument unreachable or blank => CSP or the browser blocked the
      // frame. Fall back to inline rather than showing an empty box.
      setIsolationFailed(true)
      return
    }

    measure()

    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    observer?.observe(doc.documentElement)

    const images = Array.from(doc.images ?? [])
    images.forEach(img => img.addEventListener('load', measure))
    // Webfonts and late layout can settle after load; re-measure once.
    const settle = window.setTimeout(measure, 400)
    window.addEventListener('resize', measure)

    return () => {
      observer?.disconnect()
      images.forEach(img => img.removeEventListener('load', measure))
      window.clearTimeout(settle)
      window.removeEventListener('resize', measure)
    }
  }, [html, loadNonce, measure])

  if (isolationFailed) {
    return (
      <div
        className="announcement-body"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
      />
    )
  }

  return (
    <iframe
      ref={ref}
      title={title ?? 'Announcement'}
      srcDoc={extractDocument(html)}
      sandbox={BODY_SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin"
      loading="lazy"
      scrolling="no"
      onLoad={() => setLoadNonce(n => n + 1)}
      style={{ height }}
      className="w-full block border-0 bg-white"
    />
  )
}

export default function AnnouncementBody({
  html,
  shape,
  title,
}: {
  html: string | null | undefined
  /** Server classification; falls back to inspecting the HTML. */
  shape?: BodyShape | null
  title?: string
}) {
  if (!html || !html.trim()) return null

  const kind = shape ?? classifyBody(html)
  if (kind === 'document') return <IsolatedBody html={html} title={title} />

  return (
    <div
      className="announcement-body"
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(html) }}
    />
  )
}
