import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest'
import request from 'supertest'
import { createHash } from 'crypto'
import sharp from 'sharp'

// ─── fixtures ─────────────────────────────────────────────────────────────────
//
// A 1200x1200 PNG with alpha, standing in for a real packshot. Built once with
// the real sharp (sharp is NOT mocked — the compositor under test needs it).

let PACKSHOT_PNG: Buffer
let PACKSHOT_SHA: string

// A deliberately low-resolution, tall packshot — used to exercise the
// upscale quality guard, which the 1200x1200 fixture can never trip (on a
// square source the canvas WIDTH binds before the height does).
let SMALL_PNG: Buffer
let SMALL_SHA: string

// A wide, high-resolution packshot — the only shape that can trip the
// "would overflow the canvas width" guard.
let WIDE_PNG: Buffer
let WIDE_SHA: string

type Status = 'active' | 'discontinued' | 'pending_approval'
interface Rec {
  asset_id: string
  media_id: number
  sku: string | null
  product: string
  size: string | null
  package_version: string | null
  status: Status
  brand: string
  category: string | null
  upc: string | null
  filename: string
  mime_type: string
  s3_key: string
  sha256: string | null
}

let RECORDS: Rec[] = []

function rec(overrides: Partial<Rec> = {}): Rec {
  return {
    asset_id: 'ps_h2o_42',
    media_id: 1,
    sku: 'SLQ-H2O-42',
    product: 'Sliquid H2O',
    size: '4.2 oz',
    package_version: '2024',
    status: 'active',
    brand: 'Sliquid',
    category: 'Naturals',
    upc: '000000000001',
    filename: 'h2o-4.2oz.png',
    mime_type: 'image/png',
    s3_key: 'packshots/h2o-4.2oz.png',
    sha256: PACKSHOT_SHA,
    ...overrides,
  }
}

// ─── mocks ────────────────────────────────────────────────────────────────────
// These modules are owned by other agents; the MCP server is tested against
// their published interfaces only.

vi.mock('../packshots.js', () => ({
  searchPackshots: (opts: { product: string; size?: string; includeInactive?: boolean }) =>
    RECORDS.filter(
      r =>
        r.product.toLowerCase().includes(opts.product.toLowerCase()) &&
        (!opts.size || r.size === opts.size) &&
        (opts.includeInactive || r.status === 'active'),
    ),
  getPackshotByAssetId: (id: string) => RECORDS.find(r => r.asset_id === id) ?? null,
  listPackshotSizes: (sku: string) =>
    RECORDS.filter(r => r.sku === sku)
      .map(r => r.size)
      .filter((s): s is string => !!s),
}))

vi.mock('../middleware/mcpAuth.js', () => ({
  requireMcpScope: (scope: string) => (req: any, res: any, next: any) => {
    if (req.headers.authorization !== 'Bearer test-mcp-token') {
      res.status(401).json({ error: 'invalid_token' })
      return
    }
    req.mcp = { subject: 'sub-123', email: 'agent@sliquid.com', clientId: 'chatgpt', scopes: [scope] }
    next()
  },
}))

const auditSpy = vi.fn()
vi.mock('../mcpAudit.js', () => ({ auditMcp: (e: unknown) => auditSpy(e) }))

// app.ts also mounts the well-known router, owned by another agent.
vi.mock('../routes/wellKnown.js', async () => {
  const { Router } = await import('express')
  return { default: Router() }
})

// S3 — every fetch returns whatever S3_BODY currently holds, so a test can
// serve deliberately-tampered bytes.
let S3_BODY: Buffer

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send() {
      return { Body: { transformToByteArray: async () => new Uint8Array(S3_BODY) } }
    }
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
  DeleteObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

// ─── JSON-RPC helpers ─────────────────────────────────────────────────────────

let app: any
let clearCache: () => void

const AUTH = 'Bearer test-mcp-token'
const ACCEPT = 'application/json, text/event-stream'

let rpcId = 0

async function rpc(method: string, params?: unknown, auth: string | null = AUTH) {
  const req = request(app)
    .post('/mcp')
    .set('Accept', ACCEPT)
    .set('Content-Type', 'application/json')
  if (auth) req.set('Authorization', auth)
  return req.send({ jsonrpc: '2.0', id: ++rpcId, method, params: params ?? {} })
}

async function callTool(name: string, args: Record<string, unknown>) {
  const res = await rpc('tools/call', { name, arguments: args })
  expect(res.status).toBe(200)
  return res.body.result
}

function textOf(result: any): string {
  return (result.content ?? [])
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('\n')
}

beforeAll(async () => {
  process.env['S3_BUCKET'] = 'test-bucket'
  process.env['AWS_ACCESS_KEY_ID'] = 'test'
  process.env['AWS_SECRET_ACCESS_KEY'] = 'test'
  delete process.env['GEMINI_API_KEY'] // force the no-API-key fallback path

  PACKSHOT_PNG = await sharp({
    create: { width: 1200, height: 1200, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      {
        input: await sharp({
          create: { width: 400, height: 900, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
        })
          .png()
          .toBuffer(),
        left: 400,
        top: 150,
      },
    ])
    .png()
    .toBuffer()

  PACKSHOT_SHA = createHash('sha256').update(PACKSHOT_PNG).digest('hex')

  SMALL_PNG = await sharp({
    create: { width: 300, height: 600, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer()
  SMALL_SHA = createHash('sha256').update(SMALL_PNG).digest('hex')

  WIDE_PNG = await sharp({
    create: { width: 2000, height: 400, channels: 4, background: { r: 30, g: 90, b: 200, alpha: 1 } },
  })
    .png()
    .toBuffer()
  WIDE_SHA = createHash('sha256').update(WIDE_PNG).digest('hex')
  ;({ app } = await import('../app.js'))
  ;({ clearPackshotBytesCache: clearCache } = await import('../mcp/bytes.js'))
})

beforeEach(() => {
  RECORDS = [rec()]
  S3_BODY = PACKSHOT_PNG
  auditSpy.mockClear()
  clearCache()
})

// ─── transport ────────────────────────────────────────────────────────────────

describe('MCP transport', () => {
  it('rejects an unauthenticated POST with 401', async () => {
    const res = await rpc('tools/list', {}, null)
    expect(res.status).toBe(401)
  })

  it('rejects a POST with a bad token', async () => {
    const res = await rpc('tools/list', {}, 'Bearer nope')
    expect(res.status).toBe(401)
  })

  it('rejects GET with a 405 JSON-RPC error', async () => {
    const res = await request(app).get('/mcp').set('Authorization', AUTH).set('Accept', ACCEPT)
    expect(res.status).toBe(405)
    expect(res.body.jsonrpc).toBe('2.0')
    expect(res.body.error.message).toMatch(/not allowed/i)
  })

  it('rejects DELETE with a 405 JSON-RPC error', async () => {
    const res = await request(app).delete('/mcp').set('Authorization', AUTH).set('Accept', ACCEPT)
    expect(res.status).toBe(405)
    expect(res.body.error).toBeDefined()
  })
})

// ─── tools/list ───────────────────────────────────────────────────────────────

describe('tools/list', () => {
  it('exposes exactly the three packshot tools', async () => {
    const res = await rpc('tools/list')
    expect(res.status).toBe(200)
    const names = res.body.result.tools.map((t: any) => t.name).sort()
    expect(names).toEqual(['create_product_composition', 'get_packshot', 'search_packshots'])
  })

  it('marks the two read tools read-only and closed-world', async () => {
    const res = await rpc('tools/list')
    const byName = Object.fromEntries(res.body.result.tools.map((t: any) => [t.name, t]))

    for (const name of ['search_packshots', 'get_packshot']) {
      expect(byName[name].annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      })
    }
    expect(byName['create_product_composition'].annotations).toMatchObject({
      readOnlyHint: false,
      destructiveHint: false,
      openWorldHint: false,
    })
  })
})

// ─── search_packshots ─────────────────────────────────────────────────────────

describe('search_packshots', () => {
  it('returns every matching size and never auto-picks one', async () => {
    RECORDS = [
      rec({ asset_id: 'ps_h2o_42', size: '4.2 oz' }),
      rec({ asset_id: 'ps_h2o_85', size: '8.5 oz', sku: 'SLQ-H2O-85' }),
      rec({ asset_id: 'ps_h2o_20', size: '2 oz', sku: 'SLQ-H2O-20' }),
    ]

    const result = await callTool('search_packshots', { product: 'H2O' })
    expect(result.structuredContent.count).toBe(3)
    expect(result.structuredContent.needs_disambiguation).toBe(true)
    expect(result.structuredContent.candidates.map((c: any) => c.size).sort()).toEqual([
      '2 oz',
      '4.2 oz',
      '8.5 oz',
    ])
    // The instruction to ask the user must survive in text, since ChatGPT
    // cannot see image blocks and may not surface structuredContent verbatim.
    expect(textOf(result)).toMatch(/ask the user/i)
    expect(textOf(result)).toContain('ps_h2o_85')
  })

  it('narrows to a single candidate when a size is given', async () => {
    RECORDS = [
      rec({ asset_id: 'ps_h2o_42', size: '4.2 oz' }),
      rec({ asset_id: 'ps_h2o_85', size: '8.5 oz' }),
    ]
    const result = await callTool('search_packshots', { product: 'H2O', size: '8.5 oz' })
    expect(result.structuredContent.count).toBe(1)
    expect(result.structuredContent.needs_disambiguation).toBe(false)
    expect(result.structuredContent.candidates[0].asset_id).toBe('ps_h2o_85')
  })

  it('says a product is discontinued rather than returning nothing', async () => {
    RECORDS = [rec({ asset_id: 'ps_old', product: 'Sliquid Vintage', status: 'discontinued' })]
    const result = await callTool('search_packshots', { product: 'Vintage' })

    expect(result.structuredContent.count).toBe(1)
    expect(result.structuredContent.note).toMatch(/discontinued/i)
    expect(textOf(result)).toMatch(/discontinued/i)
    expect(textOf(result)).not.toMatch(/^No packshot matches/m)
  })

  it('reports a genuine miss plainly', async () => {
    const result = await callTool('search_packshots', { product: 'Nonexistent Thing' })
    expect(result.structuredContent.count).toBe(0)
    expect(textOf(result)).toMatch(/No packshot matches/i)
  })

  it('excludes inactive packshots when active ones exist', async () => {
    RECORDS = [
      rec({ asset_id: 'ps_h2o_42', size: '4.2 oz' }),
      rec({ asset_id: 'ps_h2o_old', size: '4.2 oz', status: 'discontinued' }),
    ]
    const result = await callTool('search_packshots', { product: 'H2O' })
    expect(result.structuredContent.candidates.map((c: any) => c.asset_id)).toEqual(['ps_h2o_42'])
  })
})

// ─── get_packshot ─────────────────────────────────────────────────────────────

describe('get_packshot', () => {
  it('returns verified bytes plus a self-sufficient text mirror', async () => {
    const result = await callTool('get_packshot', { asset_id: 'ps_h2o_42' })

    expect(result.isError).toBeFalsy()
    expect(result.structuredContent).toMatchObject({
      asset_id: 'ps_h2o_42',
      product: 'Sliquid H2O',
      size: '4.2 oz',
      sku: 'SLQ-H2O-42',
      sha256: PACKSHOT_SHA,
    })

    const image = result.content.find((c: any) => c.type === 'image')
    expect(image.mimeType).toBe('image/png')
    expect(Buffer.from(image.data, 'base64').equals(PACKSHOT_PNG)).toBe(true)

    // ChatGPT renders the image block as {}, so the text must carry the facts.
    const text = textOf(result)
    expect(text).toContain('Sliquid H2O')
    expect(text).toContain('4.2 oz')
    expect(text).toContain(PACKSHOT_SHA)
  })

  it('errors on a discontinued asset and names the reason', async () => {
    RECORDS = [rec({ asset_id: 'ps_old', status: 'discontinued' })]
    const result = await callTool('get_packshot', { asset_id: 'ps_old' })

    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/discontinued/i)
    expect(result.content.some((c: any) => c.type === 'image')).toBe(false)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'get_packshot', result: 'denied' }),
    )
  })

  it('errors on a pending_approval asset', async () => {
    RECORDS = [rec({ asset_id: 'ps_new', status: 'pending_approval' })]
    const result = await callTool('get_packshot', { asset_id: 'ps_new' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/pending_approval/i)
  })

  it('errors on an unknown asset id', async () => {
    const result = await callTool('get_packshot', { asset_id: 'ps_nope' })
    expect(result.isError).toBe(true)
    expect(textOf(result)).toMatch(/no approved packshot/i)
  })

  it('WITHHOLDS the asset when the checksum does not match', async () => {
    // The stored digest still says the file is the approved one; S3 hands back
    // different bytes. Nothing may be returned.
    S3_BODY = Buffer.concat([PACKSHOT_PNG, Buffer.from('tampered')])

    const result = await callTool('get_packshot', { asset_id: 'ps_h2o_42' })

    expect(result.isError).toBe(true)
    expect(result.content.some((c: any) => c.type === 'image')).toBe(false)
    expect(textOf(result)).toMatch(/checksum mismatch/i)
    expect(textOf(result)).toMatch(/withheld/i)
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({ tool: 'get_packshot', result: 'error' }),
    )
  })

  it('WITHHOLDS an asset that has no recorded checksum', async () => {
    RECORDS = [rec({ sha256: null })]
    const result = await callTool('get_packshot', { asset_id: 'ps_h2o_42' })
    expect(result.isError).toBe(true)
    expect(result.content.some((c: any) => c.type === 'image')).toBe(false)
    expect(textOf(result)).toMatch(/cannot be verified|withheld/i)
  })

  it('audits a successful fetch with the verified digest', async () => {
    await callTool('get_packshot', { asset_id: 'ps_h2o_42' })
    expect(auditSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'get_packshot',
        assetId: 'ps_h2o_42',
        result: 'ok',
        sha256: PACKSHOT_SHA,
        principal: 'agent@sliquid.com',
      }),
    )
  })
})

// ─── create_product_composition ───────────────────────────────────────────────

describe('create_product_composition', () => {
  it('produces a valid PNG at the requested aspect ratio', async () => {
    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '4:5',
      background_color: '#f2f2f4',
      placement: 'center',
      scale: 0.7,
    })

    expect(result.isError).toBeFalsy()

    const image = result.content.find((c: any) => c.type === 'image')
    const png = Buffer.from(image.data, 'base64')
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))

    const meta = await sharp(png).metadata()
    expect(meta.format).toBe('png')
    expect(meta.width! / meta.height!).toBeCloseTo(4 / 5, 2)
    expect(result.structuredContent.composition).toMatchObject({
      aspect: '4:5',
      width: meta.width,
      height: meta.height,
    })
  })

  it('honours each supported aspect ratio', async () => {
    for (const [aspect, ratio] of [
      ['1:1', 1],
      ['9:16', 9 / 16],
      ['16:9', 16 / 9],
    ] as const) {
      const result = await callTool('create_product_composition', {
        asset_id: 'ps_h2o_42',
        aspect,
        background_color: '#eeeeee',
      })
      const image = result.content.find((c: any) => c.type === 'image')
      const meta = await sharp(Buffer.from(image.data, 'base64')).metadata()
      expect(meta.width! / meta.height!).toBeCloseTo(ratio, 2)
    }
  })

  it('works without GEMINI_API_KEY by falling back to a colour background', async () => {
    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '1:1',
      background_prompt: 'a warm marble bathroom counter',
    })
    expect(result.isError).toBeFalsy()
    expect(result.structuredContent.composition.background).toBe('color')
    expect(result.structuredContent.composition.warnings.join(' ')).toMatch(
      /fell back to a solid colour/i,
    )
  })

  it('records the source digest and states the product was composited unchanged', async () => {
    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '1:1',
      shadow: true,
      reflection: true,
    })
    expect(result.structuredContent.source_sha256).toBe(PACKSHOT_SHA)
    expect(result.structuredContent.composition.product_layer).toMatch(/composited unchanged/i)
    expect(textOf(result)).toMatch(/composited unchanged/i)
    expect(textOf(result)).toContain(PACKSHOT_SHA)
  })

  it('refuses to compose a discontinued asset', async () => {
    RECORDS = [rec({ asset_id: 'ps_old', status: 'discontinued' })]
    const result = await callTool('create_product_composition', {
      asset_id: 'ps_old',
      aspect: '1:1',
    })
    expect(result.isError).toBe(true)
    expect(result.content.some((c: any) => c.type === 'image')).toBe(false)
  })

  it('withholds the composition when the source checksum does not match', async () => {
    S3_BODY = Buffer.concat([PACKSHOT_PNG, Buffer.from('tampered')])
    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '1:1',
    })
    expect(result.isError).toBe(true)
    expect(result.content.some((c: any) => c.type === 'image')).toBe(false)
    expect(textOf(result)).toMatch(/checksum mismatch/i)
  })

  it('warns rather than silently upscaling the product layer', async () => {
    RECORDS = [rec({ sha256: SMALL_SHA })]
    S3_BODY = SMALL_PNG

    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '1:1', // 1200x1200 canvas vs a 300x600 source
      scale: 0.9,
    })
    const comp = result.structuredContent.composition
    expect(comp.product_scale_factor).toBeGreaterThan(1)
    expect(comp.warnings.join(' ')).toMatch(/upscal/i)
  })

  it('scales down instead of cropping when the product would overflow the width', async () => {
    // A 2000x400 source on a square canvas: the requested height cannot be
    // honoured without the product running off the sides, so it must shrink
    // proportionally — never get cropped to fit.
    RECORDS = [rec({ sha256: WIDE_SHA })]
    S3_BODY = WIDE_PNG

    const result = await callTool('create_product_composition', {
      asset_id: 'ps_h2o_42',
      aspect: '1:1',
      scale: 0.9,
    })
    const comp = result.structuredContent.composition
    expect(comp.warnings.join(' ')).toMatch(/exceeded the canvas|rather than cropping/i)
    expect(comp.product_scale_factor).toBeLessThanOrEqual(1)
  })
})
