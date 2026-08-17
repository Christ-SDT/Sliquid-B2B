import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'crypto'

/**
 * Unit tests for the packshot byte loader, focused on the public-HTTPS fallback
 * added while the server's IAM principal lacks `s3:GetObject`.
 *
 * mcp.test.ts cannot cover this: its S3 mock always succeeds, by design, because
 * those tests exercise the tools rather than the transport. Here the S3 client is
 * programmable so a permission failure can be simulated.
 */

// ─── programmable S3 mock ─────────────────────────────────────────────────────

let s3Behaviour: () => unknown

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {
    async send() {
      return s3Behaviour()
    }
  },
  GetObjectCommand: class {
    constructor(public input: unknown) {}
  },
}))

const { loadPackshotBytes, clearPackshotBytesCache, ChecksumMismatchError } = await import(
  '../mcp/bytes.js'
)

// ─── fixtures ─────────────────────────────────────────────────────────────────

const BYTES = Buffer.from('a-packshot-png-payload')
const SHA = createHash('sha256').update(BYTES).digest('hex')

function rec(overrides: Record<string, unknown> = {}) {
  return {
    asset_id: 'ps_h2o_42',
    s3_key: 'packshots/2025/h2o-4z-2025.png',
    sha256: SHA,
    ...overrides,
  } as any
}

/** An AWS SDK-shaped error. */
function awsError(name: string, httpStatusCode: number) {
  const err = new Error(name) as Error & { name: string; $metadata: unknown }
  err.name = name
  err.$metadata = { httpStatusCode }
  return err
}

function s3Succeeds(body: Buffer) {
  s3Behaviour = () => ({ Body: { transformToByteArray: async () => new Uint8Array(body) } })
}

function s3Fails(err: Error) {
  s3Behaviour = () => {
    throw err
  }
}

// ─── fetch stub ───────────────────────────────────────────────────────────────

let fetchCalls: { url: string; init: RequestInit }[] = []
let fetchImpl: (url: string) => Response

function okResponse(body: Buffer): Response {
  return { ok: true, status: 200, statusText: 'OK', arrayBuffer: async () => body } as any
}

const realFetch = globalThis.fetch

beforeEach(() => {
  clearPackshotBytesCache()
  fetchCalls = []
  fetchImpl = () => okResponse(BYTES)
  globalThis.fetch = ((url: string, init: RequestInit) => {
    fetchCalls.push({ url: String(url), init })
    return Promise.resolve(fetchImpl(String(url)))
  }) as unknown as typeof fetch

  process.env.S3_BUCKET = 'sliquid-ai-creator'
  process.env.AWS_REGION = 'us-east-2'
  delete process.env.MCP_S3_PUBLIC_FALLBACK

  s3Succeeds(BYTES)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  globalThis.fetch = realFetch
  vi.restoreAllMocks()
})

// ─── tests ────────────────────────────────────────────────────────────────────

describe('loadPackshotBytes — signed path', () => {
  it('uses the signed S3 read and never touches the network fallback', async () => {
    const buf = await loadPackshotBytes(rec())
    expect(buf.equals(BYTES)).toBe(true)
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('loadPackshotBytes — public-HTTPS fallback', () => {
  it('falls back on AccessDenied and returns verified bytes', async () => {
    s3Fails(awsError('AccessDenied', 403))
    const buf = await loadPackshotBytes(rec())
    expect(buf.equals(BYTES)).toBe(true)
    expect(fetchCalls).toHaveLength(1)
  })

  it('falls back on a bare 403 whose name is not AccessDenied', async () => {
    // HeadObject/GetObject can surface the denial as an opaque `Unknown` with
    // http=403 — that is what production actually returned.
    s3Fails(awsError('Unknown', 403))
    await expect(loadPackshotBytes(rec())).resolves.toBeInstanceOf(Buffer)
    expect(fetchCalls).toHaveLength(1)
  })

  it('warns loudly, and only once per process', async () => {
    // The once-per-process flag is module state, so this test needs a pristine
    // copy of the module — by now other tests in this file have already tripped
    // the banner, which is precisely the behaviour being asserted.
    vi.resetModules()
    const fresh = await import('../mcp/bytes.js')

    const warn = vi.mocked(console.warn)
    s3Fails(awsError('AccessDenied', 403))

    await fresh.loadPackshotBytes(rec())
    const firstCount = warn.mock.calls.length
    expect(firstCount).toBeGreaterThan(0)
    expect(warn.mock.calls.flat().join(' ')).toContain('s3:GetObject')

    fresh.clearPackshotBytesCache()
    await fresh.loadPackshotBytes(rec({ asset_id: 'ps_other', s3_key: 'packshots/2025/other.png' }))
    // No second banner — once per process, not once per request.
    expect(warn.mock.calls.length).toBe(firstCount)
  })

  it('builds the URL from env + s3_key only, never from a caller-supplied URL', async () => {
    s3Fails(awsError('AccessDenied', 403))
    // A poisoned row carrying an attacker host must not influence the fetch.
    await loadPackshotBytes(rec({ file_url: 'https://evil.example.com/x.png' }))
    expect(fetchCalls[0]!.url).toBe(
      'https://sliquid-ai-creator.s3.us-east-2.amazonaws.com/packshots/2025/h2o-4z-2025.png',
    )
  })

  it('honours AWS_REGION and percent-encodes each path segment', async () => {
    process.env.AWS_REGION = 'eu-west-1'
    s3Fails(awsError('AccessDenied', 403))
    await loadPackshotBytes(rec({ s3_key: 'packshots/2025/spark studio.png' }))
    expect(fetchCalls[0]!.url).toBe(
      'https://sliquid-ai-creator.s3.eu-west-1.amazonaws.com/packshots/2025/spark%20studio.png',
    )
  })

  it('refuses to follow redirects off the S3 host', async () => {
    s3Fails(awsError('AccessDenied', 403))
    await loadPackshotBytes(rec())
    expect(fetchCalls[0]!.init.redirect).toBe('error')
  })

  it('surfaces a non-2xx public response instead of returning empty bytes', async () => {
    s3Fails(awsError('AccessDenied', 403))
    fetchImpl = () => ({ ok: false, status: 404, statusText: 'Not Found' }) as any
    await expect(loadPackshotBytes(rec())).rejects.toThrow(/HTTP 404/)
  })

  it('caches the fallback result, so a second read makes no second request', async () => {
    s3Fails(awsError('AccessDenied', 403))
    await loadPackshotBytes(rec())
    await loadPackshotBytes(rec())
    expect(fetchCalls).toHaveLength(1)
  })
})

describe('loadPackshotBytes — the fallback stays narrow', () => {
  it('does NOT fall back on a 404 NoSuchKey', async () => {
    // A genuinely missing object must stay a clear error rather than becoming a
    // vaguer one via a public fetch that would also miss.
    s3Fails(awsError('NoSuchKey', 404))
    await expect(loadPackshotBytes(rec())).rejects.toThrow('NoSuchKey')
    expect(fetchCalls).toHaveLength(0)
  })

  it('does NOT fall back on an unrelated failure', async () => {
    s3Fails(awsError('NetworkingError', 500))
    await expect(loadPackshotBytes(rec())).rejects.toThrow('NetworkingError')
    expect(fetchCalls).toHaveLength(0)
  })

  it('does NOT fall back when MCP_S3_PUBLIC_FALLBACK=off', async () => {
    process.env.MCP_S3_PUBLIC_FALLBACK = 'off'
    s3Fails(awsError('AccessDenied', 403))
    await expect(loadPackshotBytes(rec())).rejects.toThrow('AccessDenied')
    expect(fetchCalls).toHaveLength(0)
  })
})

describe('loadPackshotBytes — integrity is transport-independent', () => {
  it('still rejects tampered bytes that arrive over the fallback', async () => {
    s3Fails(awsError('AccessDenied', 403))
    fetchImpl = () => okResponse(Buffer.from('tampered-payload'))
    await expect(loadPackshotBytes(rec())).rejects.toBeInstanceOf(ChecksumMismatchError)
  })

  it('does not cache bytes that failed verification', async () => {
    s3Fails(awsError('AccessDenied', 403))
    fetchImpl = () => okResponse(Buffer.from('tampered-payload'))
    await expect(loadPackshotBytes(rec())).rejects.toBeInstanceOf(ChecksumMismatchError)

    // A later good read must not be short-circuited by a poisoned cache entry.
    fetchImpl = () => okResponse(BYTES)
    const buf = await loadPackshotBytes(rec())
    expect(buf.equals(BYTES)).toBe(true)
  })
})
