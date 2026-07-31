import { describe, it, expect } from 'vitest'
import {
  decodeEntities,
  stripTags,
  stripElementorWrapper,
  extractStandaloneDoc,
  extractStyleBlocks,
  stripUnsafeMarkup,
  absolutizeUrl,
  absolutizeUrls,
  normalizeWpContent,
  slugify,
  uniqueSlug,
  normalizeTs,
  isAfterCutoff,
  overlapWatermark,
  buildPostsUrl,
  mapPostToRow,
  type WPConfig,
} from '../wordpress.js'

const BASE = 'https://sliquid.com'
const CFG: WPConfig = { baseUrl: BASE, categoryId: 245, cutoffDate: '2025-01-01' }

/**
 * Faithful reproduction of the real Shape A structure (WP post 126182): a
 * complete standalone HTML document with global CSS, pasted into an Elementor
 * HTML widget and therefore buried under 5 levels of wrapper div.
 */
const SHAPE_A = `\t\t<div data-elementor-type="wp-post" data-elementor-id="126182" class="elementor elementor-126182" data-elementor-post-type="post">
\t\t\t\t<div class="elementor-element elementor-element-e271b14 e-flex e-con-boxed e-con e-parent" data-id="e271b14" data-element_type="container">
\t\t\t\t\t<div class="e-con-inner">
\t\t\t\t<div class="elementor-element elementor-element-a8b1161 elementor-widget elementor-widget-html" data-id="a8b1161" data-element_type="widget" data-widget_type="html.default">
\t\t\t\t<div class="elementor-widget-container">
\t\t\t\t\t<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Sliquid Debuts New 5ml Sample Packets</title>
<style>
  :root { --ink: #1e2a24; --paper: #fbfaf7; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--paper); font-family: Georgia, serif; padding: 48px 16px; }
  .page { max-width: 720px; margin: 0 auto; }
</style>
</head>
<body>
  <div class="page">
    <p class="dateline"><span class="city">Dallas, TX</span> — June 30, 2026 — Sliquid announces.</p>
    <img src="/wp-content/uploads/2026/07/packet.jpg" alt="Packet">
    <footer></footer>
  </div>
</body>
</html>\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t\t\t</div>
\t\t\t\t</div>
\t\t\t\t</div>
\t\t`

/** Shape B — plain classic WP content (63 of 64 real posts). */
const SHAPE_B = `<p>Dallas, TX — June 2, 2026 — Sliquid today announced the launch of <strong>Sliquid HQ</strong>, a next-generation B2B partner portal.</p>
<p>Read more at <a href="/about-us/">our about page</a>.</p>`

describe('decodeEntities / stripTags', () => {
  it('decodes the entities WordPress puts in titles', () => {
    expect(decodeEntities('What &#8216;Hypoallergenic&#8217; Really Means'))
      .toBe('What ‘Hypoallergenic’ Really Means')
    expect(decodeEntities('Sliquid &amp; RIDE')).toBe('Sliquid & RIDE')
    expect(decodeEntities('caf&#xe9;')).toBe('café')
  })

  it('leaves unknown entities alone rather than mangling them', () => {
    expect(decodeEntities('&notreal; x')).toBe('&notreal; x')
  })

  it('strips tags and collapses whitespace', () => {
    expect(stripTags('<p>Hello   <strong>world</strong></p>')).toBe('Hello world')
    expect(stripTags('')).toBe('')
  })
})

describe('stripElementorWrapper', () => {
  it('peels every nested Elementor wrapper off the real Shape A fixture', () => {
    const out = stripElementorWrapper(SHAPE_A)
    expect(out).not.toContain('elementor-widget-container')
    expect(out).not.toContain('data-elementor-type')
    expect(out.trimStart().toLowerCase().startsWith('<!doctype')).toBe(true)
  })

  it('unwraps an Elementor wrapper around plain content', () => {
    const wrapped = `<div class="elementor elementor-9"><div class="e-con-inner">${SHAPE_B}</div></div>`
    expect(stripElementorWrapper(wrapped).trim()).toBe(SHAPE_B)
  })

  it('leaves non-Elementor content untouched', () => {
    expect(stripElementorWrapper(SHAPE_B)).toBe(SHAPE_B)
    const plainDiv = '<div class="card">hi</div>'
    expect(stripElementorWrapper(plainDiv)).toBe(plainDiv)
  })

  it('does NOT unwrap when the div has siblings (would mangle markup)', () => {
    const twoRoots = '<div class="elementor e-con">first</div><p>second</p>'
    expect(stripElementorWrapper(twoRoots)).toBe(twoRoots)
  })

  it('tracks nesting depth rather than matching the first close tag', () => {
    const nested = '<div class="elementor"><div class="inner">a</div><div class="inner">b</div></div>'
    expect(stripElementorWrapper(nested))
      .toBe('<div class="inner">a</div><div class="inner">b</div>')
  })
})

describe('extractStandaloneDoc', () => {
  it('detects a standalone document and slices from the doctype', () => {
    const { isStandalone, doc, css } = extractStandaloneDoc(stripElementorWrapper(SHAPE_A))
    expect(isStandalone).toBe(true)
    // ⚠️ QUIRKS-MODE REGRESSION: any markup before <!DOCTYPE makes the iframe
    // render in quirks mode, silently breaking the author's box model.
    expect(doc.toLowerCase().startsWith('<!doctype')).toBe(true)
    expect(doc.toLowerCase().endsWith('</html>')).toBe(true)
    expect(doc).not.toContain('elementor')
    expect(css).toContain('--ink')
    expect(css).toContain('box-sizing')
  })

  it('treats a bare <style> block as needing isolation too', () => {
    const { isStandalone, css } = extractStandaloneDoc('<style>body{margin:0}</style><p>hi</p>')
    expect(isStandalone).toBe(true)
    expect(css).toBe('body{margin:0}')
  })

  it('classifies plain content as not standalone', () => {
    const { isStandalone, css } = extractStandaloneDoc(SHAPE_B)
    expect(isStandalone).toBe(false)
    expect(css).toBeNull()
  })

  it('extractStyleBlocks concatenates multiple blocks and returns null for none', () => {
    expect(extractStyleBlocks('<style>a{}</style>x<style>b{}</style>')).toBe('a{}\n\nb{}')
    expect(extractStyleBlocks('<p>no css</p>')).toBeNull()
  })
})

describe('stripUnsafeMarkup', () => {
  it('removes scripts, object/embed and inline handlers', () => {
    const dirty = `<p onclick="steal()">x</p><script>alert(1)</script>` +
      `<img src="a.jpg" onerror='go()'><embed src="e.swf"></embed><div onmouseover=bad>y</div>`
    const clean = stripUnsafeMarkup(dirty)
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('alert(1)')
    expect(clean).not.toContain('onclick')
    expect(clean).not.toContain('onerror')
    expect(clean).not.toContain('onmouseover')
    expect(clean).not.toContain('<embed')
    expect(clean).toContain('<img src="a.jpg"')
  })

  it('neutralizes javascript: URLs', () => {
    expect(stripUnsafeMarkup(`<a href="javascript:alert(1)">x</a>`)).toBe('<a href="#">x</a>')
  })

  it('KEEPS style, meta and link — they are the design, not a threat', () => {
    const doc = '<meta charset="UTF-8"><link rel="stylesheet" href="https://fonts.googleapis.com/x">' +
      '<style>body{margin:0}</style>'
    const clean = stripUnsafeMarkup(doc)
    expect(clean).toContain('<meta charset')
    expect(clean).toContain('fonts.googleapis.com')
    expect(clean).toContain('<style>')
  })

  it('preserves a legitimate iframe embed', () => {
    const html = '<iframe src="https://www.youtube.com/embed/abc"></iframe>'
    expect(stripUnsafeMarkup(html)).toContain('<iframe')
  })
})

describe('absolutizeUrls', () => {
  it('rewrites root-relative and relative URLs', () => {
    expect(absolutizeUrl('/wp-content/x.jpg', BASE)).toBe('https://sliquid.com/wp-content/x.jpg')
    expect(absolutizeUrl('about/team', BASE)).toBe('https://sliquid.com/about/team')
  })

  it('leaves absolute, protocol-relative and non-http URLs alone', () => {
    for (const u of [
      'https://cdn.example.com/x.jpg',
      'http://other.com/y.png',
      '//cdn.example.com/z.jpg',
      'data:image/png;base64,AAAA',
      'mailto:hi@sliquid.com',
      'tel:+15551234',
      '#section-2',
    ]) {
      expect(absolutizeUrl(u, BASE)).toBe(u)
    }
  })

  it('rewrites src, href and poster inside markup, both quote styles', () => {
    const html = `<img src="/a.jpg"><a href='/b/'>x</a><video poster="/p.png"></video>`
    const out = absolutizeUrls(html, BASE)
    expect(out).toContain('src="https://sliquid.com/a.jpg"')
    expect(out).toContain("href='https://sliquid.com/b/'")
    expect(out).toContain('poster="https://sliquid.com/p.png"')
  })

  it('rewrites every srcset candidate and keeps its descriptor', () => {
    const out = absolutizeUrls('<img srcset="/a.jpg 1x, /b.jpg 2x, https://cdn/c.jpg 3x">', BASE)
    expect(out).toContain('https://sliquid.com/a.jpg 1x')
    expect(out).toContain('https://sliquid.com/b.jpg 2x')
    expect(out).toContain('https://cdn/c.jpg 3x')
  })

  it('does not corrupt an already-absolute document', () => {
    const html = '<img src="https://sliquid.com/a.jpg">'
    expect(absolutizeUrls(html, BASE)).toBe(html)
  })
})

describe('normalizeWpContent — the full pipeline', () => {
  it('Shape A → document, unwrapped, doctype-first, CSS extracted, URLs absolute', () => {
    const r = normalizeWpContent(SHAPE_A, BASE)
    expect(r.shape).toBe('document')
    expect(r.html.toLowerCase().startsWith('<!doctype')).toBe(true)
    expect(r.html).not.toContain('elementor')
    expect(r.css).toContain('--ink')
    expect(r.html).toContain('src="https://sliquid.com/wp-content/uploads/2026/07/packet.jpg"')
  })

  it('Shape B → rich, no CSS, links absolutized', () => {
    const r = normalizeWpContent(SHAPE_B, BASE)
    expect(r.shape).toBe('rich')
    expect(r.css).toBeNull()
    expect(r.html).toContain('href="https://sliquid.com/about-us/"')
    expect(r.html).toContain('<strong>Sliquid HQ</strong>')
  })

  it('Elementor-wrapped plain content → rich, wrapper gone', () => {
    const r = normalizeWpContent(`<div class="elementor e-con">${SHAPE_B}</div>`, BASE)
    expect(r.shape).toBe('rich')
    expect(r.html).not.toContain('elementor')
  })

  it('handles empty content without throwing', () => {
    const r = normalizeWpContent('', BASE)
    expect(r.shape).toBe('rich')
    expect(r.html).toBe('')
  })
})

describe('slugify / uniqueSlug', () => {
  it('slugifies titles', () => {
    expect(slugify('Sliquid Debuts New 5ml Sample Packets!')).toBe('sliquid-debuts-new-5ml-sample-packets')
    expect(slugify("What ‘Hypoallergenic’ Really Means")).toBe('what-hypoallergenic-really-means')
    expect(slugify('   ')).toBe('announcement')
  })

  it('never returns a reserved router path as a bare slug', () => {
    for (const r of ['public', 'admin', 'sync']) {
      expect(slugify(r)).toBe(`${r}-announcement`)
      expect(slugify(r)).not.toBe(r)
    }
  })

  it('walks the collision chain', () => {
    const taken = new Set(['foo', 'foo-2'])
    expect(uniqueSlug('foo', s => taken.has(s))).toBe('foo-3')
    expect(uniqueSlug('bar', s => taken.has(s))).toBe('bar')
  })
})

describe('normalizeTs — BLOCKER: SQLite comparison format', () => {
  it('converts ISO to a SPACE-separated SQLite timestamp, not a T', () => {
    const out = normalizeTs('2026-08-01T14:00:00.000Z')
    expect(out).toBe('2026-08-01 14:00:00')
    expect(out).not.toContain('T')
  })

  it('treats a zone-less WP *_gmt value as UTC when asked', () => {
    // WP returns date_gmt without a Z; reading it as local would shift by hours.
    expect(normalizeTs('2026-07-08T21:51:39', true)).toBe('2026-07-08 21:51:39')
    expect(normalizeTs('2026-07-08 21:51:39', true)).toBe('2026-07-08 21:51:39')
  })

  it('honours an explicit offset', () => {
    expect(normalizeTs('2026-07-08T21:51:39+02:00')).toBe('2026-07-08 19:51:39')
  })

  it('returns null to clear and undefined for garbage', () => {
    expect(normalizeTs(null)).toBeNull()
    expect(normalizeTs('')).toBeNull()
    expect(normalizeTs(undefined)).toBeNull()
    expect(normalizeTs('not-a-date')).toBeUndefined()
    expect(normalizeTs(12345 as unknown)).toBeUndefined()
  })

  it('output sorts correctly against a SQLite datetime string', () => {
    // The actual bug: 'T' (0x54) > ' ' (0x20), so an ISO value compares as
    // later than any same-day datetime('now') and never becomes live.
    const now = '2026-07-31 17:49:03'
    const anHourAgoIso = '2026-07-31T16:49:03.000Z'
    expect(anHourAgoIso <= now).toBe(false)              // the bug
    expect(normalizeTs(anHourAgoIso)! <= now).toBe(true) // the fix
  })
})

describe('isAfterCutoff / overlapWatermark', () => {
  it('keeps posts on or after the cutoff and drops older ones', () => {
    expect(isAfterCutoff('2026-07-08T21:51:39', '2025-01-01')).toBe(true)
    expect(isAfterCutoff('2025-01-01T00:00:00', '2025-01-01')).toBe(true)
    expect(isAfterCutoff('2019-05-05T10:00:00', '2025-01-01')).toBe(false)
    expect(isAfterCutoff(null, '2025-01-01')).toBe(false)
  })

  it('rewinds the watermark by the overlap window', () => {
    expect(overlapWatermark('2026-07-08 12:00:00', 5)).toBe('2026-07-08T11:55:00')
  })

  it('returns the input unchanged when unparseable', () => {
    expect(overlapWatermark('nonsense', 5)).toBe('nonsense')
  })
})

describe('buildPostsUrl', () => {
  it('includes the category, cutoff, ascending modified order and field allowlist', () => {
    const url = buildPostsUrl(CFG, { page: 1 })
    expect(url).toContain('/wp-json/wp/v2/posts?')
    expect(url).toContain('categories=245')
    expect(url).toContain('per_page=100')
    expect(url).toContain('page=1')
    expect(url).toContain('orderby=modified')
    expect(url).toContain('order=asc')
    expect(url).toContain('after=2025-01-01T00%3A00%3A00')
    // date_gmt/modified_gmt must be requested or timestamps land in local time
    expect(decodeURIComponent(url)).toContain('date_gmt')
    expect(decodeURIComponent(url)).toContain('modified_gmt')
    expect(url).not.toContain('modified_after')
  })

  it('adds modified_after only when a watermark is supplied', () => {
    expect(buildPostsUrl(CFG, { page: 2, modifiedAfter: '2026-01-01T00:00:00' }))
      .toContain('modified_after=2026-01-01T00%3A00%3A00')
  })

  it('caps per_page at the WordPress maximum of 100', () => {
    expect(buildPostsUrl(CFG, { page: 1, perPage: 500 })).toContain('per_page=100')
  })

  it('tolerates a trailing slash on the base URL', () => {
    expect(buildPostsUrl({ ...CFG, baseUrl: 'https://sliquid.com/' }, { page: 1 }))
      .toContain('https://sliquid.com/wp-json/')
  })
})

describe('mapPostToRow', () => {
  const post = {
    id: 126182,
    slug: 'sliquid-debuts-new-5ml-sample-packets',
    link: 'https://sliquid.com/sliquid-debuts-new-5ml-sample-packets/',
    status: 'publish',
    date: '2026-07-08T16:51:39',
    date_gmt: '2026-07-08T21:51:39',
    modified: '2026-07-08T16:51:42',
    modified_gmt: '2026-07-08T21:51:42',
    title: { rendered: 'Sliquid Debuts New 5ml Sample Packets &#8211; Retail' },
    excerpt: { rendered: '<p>Dallas, TX — Sliquid announces.</p>' },
    content: { rendered: SHAPE_A },
    jetpack_featured_media_url: 'https://sliquid.com/wp-content/uploads/2026/07/x.jpg',
    categories: [245],
  }

  it('maps a Shape A post completely', () => {
    const row = mapPostToRow(post, CFG)
    expect(row.wp_id).toBe(126182)
    expect(row.wp_title).toBe('Sliquid Debuts New 5ml Sample Packets – Retail')
    expect(row.content_shape).toBe('document')
    expect(row.content_css).toContain('--ink')
    expect(row.wp_content_html!.toLowerCase().startsWith('<!doctype')).toBe(true)
    expect(row.wp_categories).toBe('[245]')
    expect(row.slug).toBe('sliquid-debuts-new-5ml-sample-packets')
  })

  it('normalizes *_gmt timestamps to SQLite format', () => {
    const row = mapPostToRow(post, CFG)
    expect(row.wp_date_gmt).toBe('2026-07-08 21:51:39')
    expect(row.wp_modified_gmt).toBe('2026-07-08 21:51:42')
    // site-local `modified` is kept verbatim — it is the modified_after watermark
    expect(row.wp_modified).toBe('2026-07-08T16:51:42')
  })

  it('maps a Shape B post as rich with no CSS', () => {
    const row = mapPostToRow({ ...post, content: { rendered: SHAPE_B } }, CFG)
    expect(row.content_shape).toBe('rich')
    expect(row.content_css).toBeNull()
  })

  it('falls back to a title when WordPress sends none', () => {
    const row = mapPostToRow({ id: 7, content: { rendered: '' } }, CFG)
    expect(row.wp_title).toBe('Post 7')
    expect(row.slug).toBe('post-7')
  })
})
