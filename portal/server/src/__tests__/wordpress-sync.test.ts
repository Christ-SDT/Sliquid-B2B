import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import { db, resetDb, seedTestUsers } from './helpers/db.js'
import {
  runAnnouncementSync,
  upsertFromWpPost,
  wp,
  getSetting,
  setSetting,
  type WPConfig,
  type WPPost,
} from '../wordpress.js'

const CFG: WPConfig = { baseUrl: 'https://sliquid.com', categoryId: 245, cutoffDate: '2025-01-01' }

beforeEach(() => {
  resetDb()
  seedTestUsers()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

afterAll(() => db.close())

/**
 * Minimal Response stand-in. Only `ok`, `status`, `headers.get` and `json` are
 * used by fetchPosts, so a full Response is unnecessary.
 */
function wpResponse(posts: WPPost[], totalPages = 1) {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (k: string) => {
        const n = k.toLowerCase()
        if (n === 'x-wp-totalpages') return String(totalPages)
        if (n === 'x-wp-total') return String(posts.length)
        return null
      },
    },
    json: async () => posts,
  } as unknown as Response
}

function post(overrides: Partial<WPPost> & { id: number }): WPPost {
  return {
    slug: `post-${overrides.id}`,
    link: `https://sliquid.com/post-${overrides.id}/`,
    status: 'publish',
    date: '2026-06-01T10:00:00',
    date_gmt: '2026-06-01T15:00:00',
    modified: '2026-06-01T10:00:00',
    modified_gmt: '2026-06-01T15:00:00',
    title: { rendered: `Post ${overrides.id}` },
    excerpt: { rendered: '<p>Excerpt</p>' },
    content: { rendered: '<p>Body</p>' },
    categories: [245],
    ...overrides,
  }
}

const row = (wpId: number) =>
  db.prepare('SELECT * FROM announcements WHERE wp_id = ?').get(wpId) as any

const logs = () =>
  db.prepare('SELECT * FROM announcement_sync_log ORDER BY id').all() as any[]

describe('runAnnouncementSync — happy path', () => {
  it('imports posts as hidden and invisible on both surfaces', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 }), post({ id: 2 })]))

    const res = await runAnnouncementSync('manual')

    expect(res.status).toBe('ok')
    expect(res.posts_seen).toBe(2)
    expect(res.posts_created).toBe(2)
    expect(res.posts_updated).toBe(0)

    const a = row(1)
    expect(a.source).toBe('wordpress')
    expect(a.status).toBe('hidden')       // decision: admin publishes, not the sync
    expect(a.show_in_portal).toBe(0)
    expect(a.show_on_public).toBe(0)
    expect(a.slug).toBe('post-1')
    expect(a.wp_title).toBe('Post 1')
    expect(a.first_seen_at).toBeTruthy()
    expect(a.last_synced_at).toBeTruthy()
  })

  it('writes exactly one ok log row', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync('boot')

    const l = logs()
    expect(l).toHaveLength(1)
    expect(l[0].status).toBe('ok')
    expect(l[0].trigger_source).toBe('boot')
    expect(l[0].posts_created).toBe(1)
  })

  it('notifies admins about new posts needing review, but not regular users', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync('manual')

    const admin = db.prepare(
      "SELECT COUNT(*) c FROM notifications WHERE type = 'announcement_review'"
    ).get() as { c: number }
    expect(admin.c).toBe(1) // one admin seeded

    // Nothing is visible yet, so nobody gets a "new announcement" bell.
    const users = db.prepare(
      "SELECT COUNT(*) c FROM notifications WHERE type = 'new_announcement'"
    ).get() as { c: number }
    expect(users.c).toBe(0)
  })

  it('paginates on X-WP-TotalPages', async () => {
    ;(fetch as any)
      .mockResolvedValueOnce(wpResponse([post({ id: 1 })], 2))
      .mockResolvedValueOnce(wpResponse([post({ id: 2 })], 2))

    const res = await runAnnouncementSync()

    expect((fetch as any).mock.calls).toHaveLength(2)
    expect((fetch as any).mock.calls[1][0]).toContain('page=2')
    expect(res.posts_created).toBe(2)
  })

  it('is idempotent — re-syncing identical posts creates nothing new', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync()
    const second = await runAnnouncementSync()

    expect(second.posts_created).toBe(0)
    expect((db.prepare('SELECT COUNT(*) c FROM announcements').get() as any).c).toBe(1)
  })

  it('classifies an unchanged post as unchanged but still bumps last_synced_at', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync()
    db.prepare("UPDATE announcements SET last_synced_at = '2000-01-01 00:00:00'").run()

    const res = await runAnnouncementSync()
    expect(res.posts_updated).toBe(0)
    expect(row(1).last_synced_at).not.toBe('2000-01-01 00:00:00')
  })

  it('counts a genuinely edited post as updated and refreshes the body', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync()

    ;(fetch as any).mockResolvedValue(wpResponse([post({
      id: 1,
      modified: '2026-06-02T10:00:00',
      title: { rendered: 'Edited Title' },
      content: { rendered: '<p>Edited body</p>' },
    })]))
    const res = await runAnnouncementSync()

    expect(res.posts_updated).toBe(1)
    expect(row(1).wp_title).toBe('Edited Title')
    expect(row(1).wp_content_html).toContain('Edited body')
  })
})

describe('THE ANTI-CLOBBER CONTRACT', () => {
  // The single most important test in this feature. A re-sync must refresh the
  // WordPress mirror while leaving every admin-owned column untouched —
  // otherwise a routine pull silently unpublishes announcements and throws away
  // the admin's overrides, visibility, schedule and pin order.
  it('refreshes wp_* columns and preserves every admin-owned column', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 42 })]))
    await runAnnouncementSync()

    const adminState = {
      slug: 'custom-admin-slug',
      title_override: 'Admin Title',
      excerpt_override: 'Admin Excerpt',
      body_html_override: '<p>Admin body</p>',
      image_url_override: 'https://cdn.example.com/admin.jpg',
      status: 'published',
      publish_at: '2026-01-01 12:00:00',
      expires_at: '2099-01-01 12:00:00',
      show_in_portal: 1,
      show_on_public: 1,
      pinned: 1,
      sort_order: 7,
      notified_at: '2026-01-02 00:00:00',
      admin_notes: 'Reviewed by Chris',
      created_by: 1,
    }
    db.prepare(`
      UPDATE announcements SET
        slug = @slug, title_override = @title_override, excerpt_override = @excerpt_override,
        body_html_override = @body_html_override, image_url_override = @image_url_override,
        status = @status, publish_at = @publish_at, expires_at = @expires_at,
        show_in_portal = @show_in_portal, show_on_public = @show_on_public,
        pinned = @pinned, sort_order = @sort_order, notified_at = @notified_at,
        admin_notes = @admin_notes, created_by = @created_by
      WHERE wp_id = 42
    `).run(adminState)
    const firstSeen = row(42).first_seen_at

    // WordPress-side edit: new title, new body, newer modified stamp.
    ;(fetch as any).mockResolvedValue(wpResponse([post({
      id: 42,
      slug: 'wp-renamed-slug',
      modified: '2026-09-09T09:09:09',
      modified_gmt: '2026-09-09T14:09:09',
      title: { rendered: 'WordPress Changed This' },
      content: { rendered: '<p>New WP body</p>' },
    })]))
    await runAnnouncementSync()

    const after = row(42)

    // The WP mirror updated…
    expect(after.wp_title).toBe('WordPress Changed This')
    expect(after.wp_content_html).toContain('New WP body')
    expect(after.wp_slug).toBe('wp-renamed-slug')
    expect(after.wp_modified).toBe('2026-09-09T09:09:09')

    // …and not one admin-owned column moved.
    for (const [key, expected] of Object.entries(adminState)) {
      expect(after[key], `admin column "${key}" was clobbered by sync`).toBe(expected)
    }
    expect(after.first_seen_at).toBe(firstSeen)
  })

  it('never touches portal-authored announcements', async () => {
    db.prepare(`
      INSERT INTO announcements (source, wp_id, slug, wp_title, body_html_override, status, show_in_portal)
      VALUES ('portal', NULL, 'portal-only', 'Portal Only', '<p>Mine</p>', 'published', 1)
    `).run()

    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await runAnnouncementSync()

    const p = db.prepare("SELECT * FROM announcements WHERE slug = 'portal-only'").get() as any
    expect(p.source).toBe('portal')
    expect(p.wp_id).toBeNull()
    expect(p.status).toBe('published')
    expect(p.body_html_override).toBe('<p>Mine</p>')
  })

  it('keeps an admin-renamed slug and resolves new collisions with a suffix', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1, slug: 'shared-slug' })]))
    await runAnnouncementSync()
    expect(row(1).slug).toBe('shared-slug')

    // A different WP post wanting the same slug must not collide.
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 2, slug: 'shared-slug' })]))
    await runAnnouncementSync()
    expect(row(2).slug).toBe('shared-slug-2')
  })
})

describe('runAnnouncementSync — failure handling', () => {
  it('resolves (never rejects) when fetch throws, and logs the error', async () => {
    ;(fetch as any).mockRejectedValue(new Error('socket hang up'))

    const res = await runAnnouncementSync('schedule')

    expect(res.status).toBe('error')
    expect(res.message).toContain('socket hang up')
    const l = logs()
    expect(l).toHaveLength(1)
    expect(l[0].status).toBe('error')
  })

  it('resolves on a non-ok HTTP response', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false, status: 500,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response)

    const res = await runAnnouncementSync()
    expect(res.status).toBe('error')
    expect(res.message).toContain('500')
  })

  it('surfaces a 401 as an error rather than importing nothing silently', async () => {
    ;(fetch as any).mockResolvedValue({
      ok: false, status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    } as unknown as Response)

    const res = await runAnnouncementSync()
    expect(res.status).toBe('error')
    expect(res.message).toContain('401')
  })

  it('leaves the watermark untouched on failure so the window is retried', async () => {
    setSetting('wp_last_sync_modified', '2026-05-05T05:05:05')
    ;(fetch as any).mockRejectedValue(new Error('boom'))

    await runAnnouncementSync()
    expect(getSetting('wp_last_sync_modified')).toBe('2026-05-05T05:05:05')
  })
})

describe('watermark', () => {
  it('advances to max(modified) minus the 5-minute overlap on success', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([
      post({ id: 1, modified: '2026-06-01T10:00:00' }),
      post({ id: 2, modified: '2026-06-03T12:00:00' }),
    ]))

    await runAnnouncementSync()
    expect(getSetting('wp_last_sync_modified')).toBe('2026-06-03T11:55:00')
  })

  it('passes the stored watermark to WordPress as modified_after', async () => {
    setSetting('wp_last_sync_modified', '2026-02-02T02:02:02')
    ;(fetch as any).mockResolvedValue(wpResponse([]))

    await runAnnouncementSync()
    expect((fetch as any).mock.calls[0][0]).toContain('modified_after=2026-02-02T02%3A02%3A02')
  })

  it('omits modified_after on a first run', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([]))
    await runAnnouncementSync()
    expect((fetch as any).mock.calls[0][0]).not.toContain('modified_after')
  })
})

describe('upsertFromWpPost — filtering', () => {
  it('skips posts published before the cutoff', () => {
    const outcome = upsertFromWpPost(
      post({ id: 9, date_gmt: '2019-05-05T10:00:00' }),
      CFG,
    )
    expect(outcome).toBe('skipped')
    expect(row(9)).toBeUndefined()
  })

  it('skips posts that are not in the configured category', () => {
    expect(upsertFromWpPost(post({ id: 10, categories: [184] }), CFG)).toBe('skipped')
    expect(row(10)).toBeUndefined()
  })

  it('counts skips in the sync result', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([
      post({ id: 1 }),
      post({ id: 2, date_gmt: '2019-01-01T00:00:00' }),
    ]))

    const res = await runAnnouncementSync()
    expect(res.posts_created).toBe(1)
    expect(res.posts_skipped).toBe(1)
  })

  it('stores Shape A content as a standalone document', () => {
    const shapeA = `<div class="elementor e-con"><div class="elementor-widget-container">` +
      `<!DOCTYPE html><html><head><style>body{margin:0}</style></head>` +
      `<body><p>Custom</p><img src="/a.jpg"></body></html></div></div>`
    upsertFromWpPost(post({ id: 20, content: { rendered: shapeA } }), CFG)

    const r = row(20)
    expect(r.content_shape).toBe('document')
    expect(r.content_css).toContain('margin:0')
    expect(r.wp_content_html.toLowerCase().startsWith('<!doctype')).toBe(true)
    expect(r.wp_content_html).toContain('src="https://sliquid.com/a.jpg"')
  })

  it('stores Shape B content as rich with no CSS', () => {
    upsertFromWpPost(post({ id: 21, content: { rendered: '<p>Plain</p>' } }), CFG)
    const r = row(21)
    expect(r.content_shape).toBe('rich')
    expect(r.content_css).toBeNull()
  })
})

describe('WordPressService config', () => {
  it('falls back to working defaults so the feature is never dead on arrival', () => {
    const cfg = wp.getConfig()
    expect(cfg.baseUrl).toBe('https://sliquid.com')
    expect(cfg.categoryId).toBe(245)
    expect(cfg.cutoffDate).toBe('2025-01-01')
    expect(cfg.auth).toBeUndefined()
  })

  it('prefers DB settings over the default and strips a trailing slash', () => {
    setSetting('wp_base_url', 'https://staging.sliquid.com/')
    setSetting('wp_category_id', '999')
    setSetting('wp_cutoff_date', '2020-06-01')

    const cfg = wp.getConfig()
    expect(cfg.baseUrl).toBe('https://staging.sliquid.com')
    expect(cfg.categoryId).toBe(999)
    expect(cfg.cutoffDate).toBe('2020-06-01')
  })

  it('ignores malformed settings rather than producing a broken URL', () => {
    setSetting('wp_category_id', 'not-a-number')
    setSetting('wp_cutoff_date', '06/01/2020')

    const cfg = wp.getConfig()
    expect(cfg.categoryId).toBe(245)
    expect(cfg.cutoffDate).toBe('2025-01-01')
  })

  it('strips an accidental /wp-json suffix', () => {
    setSetting('wp_base_url', 'https://sliquid.com/wp-json')
    expect(wp.getConfig().baseUrl).toBe('https://sliquid.com')
  })

  it('isSyncEnabled defaults on and can be switched off', () => {
    expect(wp.isSyncEnabled()).toBe(true)
    setSetting('wp_announcements_sync_enabled', '0')
    expect(wp.isSyncEnabled()).toBe(false)
  })

  it('testConnection reports ok with a total, and never throws on failure', async () => {
    ;(fetch as any).mockResolvedValue(wpResponse([post({ id: 1 })]))
    await expect(wp.testConnection()).resolves.toMatchObject({ ok: true, total: 1 })

    ;(fetch as any).mockRejectedValue(new Error('dns failure'))
    await expect(wp.testConnection()).resolves.toMatchObject({ ok: false })
  })
})
