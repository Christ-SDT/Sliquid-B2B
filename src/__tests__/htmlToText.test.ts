import { describe, it, expect } from 'vitest'
import { htmlToText } from '@/utils/htmlToText'

describe('htmlToText (WordPress excerpts)', () => {
  it('decodes the entities WordPress emits instead of showing them literally', () => {
    // Verbatim shape of a live /api/announcements/public excerpt.
    const excerpt = '<p>What Today&#8217;s Lube Customer Wants: A Retail Buyer&#8217;s Guide Sliquid Trade Resources &middot; Retail &amp; Distribution [&hellip;]</p>\n'
    expect(htmlToText(excerpt)).toBe(
      'What Today’s Lube Customer Wants: A Retail Buyer’s Guide Sliquid Trade Resources · Retail & Distribution […]',
    )
  })

  it('keeps words from adjacent block elements apart', () => {
    expect(htmlToText('<p>First</p><p>Second</p>')).toBe('First Second')
  })

  it('handles curly quotes, hex entities and nbsp', () => {
    expect(htmlToText('&#8220;pillow-style&#8221; caf&#xe9;&nbsp;bar')).toBe('“pillow-style” café bar')
  })

  it('returns text only — markup inside is never interpreted', () => {
    expect(htmlToText('<img src=x onerror="alert(1)">safe<script>alert(1)</script>')).toBe('safe alert(1)')
  })

  it('treats null/empty as empty', () => {
    expect(htmlToText(null)).toBe('')
    expect(htmlToText('')).toBe('')
  })
})
