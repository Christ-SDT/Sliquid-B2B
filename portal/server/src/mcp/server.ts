import { Router, type Request, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { GoogleGenAI } from '@google/genai'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'

import {
  searchPackshots,
  getPackshotByAssetId,
  type PackshotRecord,
} from '../packshots.js'
import { requireMcpScope } from '../middleware/mcpAuth.js'
import { auditMcp } from '../mcpAudit.js'
import { loadPackshotBytes } from './bytes.js'
import { composeProductImage, type Aspect, type Placement } from './compose.js'

/**
 * Sliquid packshot MCP server.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PLATFORM LIMITATION — READ BEFORE "SIMPLIFYING" ANY TOOL RESULT
 * ─────────────────────────────────────────────────────────────────────────────
 * ChatGPT's MCP connector renders an image content block — `{ type: "image",
 * data: <base64>, mimeType }` — as an empty `{}`. The bytes never become
 * model-visible. OpenAI confirmed this in April 2026 and has committed to no
 * fix.
 *
 * Consequences, which every tool below is built around:
 *   • We STILL emit the image block. MCP Inspector, Claude and other clients
 *     render it correctly, and it is the correct protocol-level answer.
 *   • The image block must NEVER be the only thing carrying meaning. Every
 *     result is fully understandable from `structuredContent` plus the text
 *     content block alone — asset id, product, size, sha256, composition
 *     parameters, warnings.
 *
 * So: do not delete the text mirror "because the image says it", and do not
 * delete the image block "because ChatGPT ignores it". Both are load-bearing,
 * for different clients.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── Gemini background generation ─────────────────────────────────────────────
// Same client + model as src/routes/creator.ts. Kept local rather than imported
// so the MCP module graph does not pull in a route file.

const MODEL_IMAGEN = 'imagen-4.0-generate-001'

const DEFAULT_BACKGROUND_COLOR = '#eceef0'

/**
 * The product is NEVER sent to the model and NEVER described to it. Only the
 * empty scene is generated; the bottle is composited on top afterwards.
 */
const BACKGROUND_BRIEF =
  'An empty product photography background plate. Clean, premium, well-lit, ' +
  'with no products, no bottles, no packaging, no text, no logos and no people ' +
  'anywhere in the frame. Leave the centre of the frame uncluttered. Scene: '

async function generateBackground(prompt: string, aspect: Aspect): Promise<Buffer | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try {
    const ai = new GoogleGenAI({ apiKey })
    const response = await ai.models.generateImages({
      model: MODEL_IMAGEN,
      prompt: `${BACKGROUND_BRIEF}${prompt.trim()}`,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/jpeg',
        aspectRatio: aspect,
      } as any,
    })
    const bytes = response.generatedImages?.[0]?.image?.imageBytes
    if (!bytes) return null
    return typeof bytes === 'string' ? Buffer.from(bytes, 'base64') : Buffer.from(bytes)
  } catch (err) {
    console.error('[mcp] background generation failed, falling back to solid colour:', err)
    return null
  }
}

// ─── principal ────────────────────────────────────────────────────────────────

interface McpPrincipal {
  subject: string
  email?: string
  clientId?: string
  scopes: string[]
}

/** Read the authenticated principal without depending on a global augmentation. */
function principalOf(req: Request): string {
  const mcp = (req as Request & { mcp?: McpPrincipal }).mcp
  return mcp?.email ?? mcp?.subject ?? 'unknown'
}

// ─── shared shapes ────────────────────────────────────────────────────────────

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const

const candidateShape = z.object({
  asset_id: z.string(),
  product: z.string(),
  size: z.string().nullable(),
  package_version: z.string().nullable(),
  status: z.string(),
  sku: z.string().nullable(),
})

function toCandidate(r: PackshotRecord) {
  return {
    asset_id: r.asset_id,
    product: r.product,
    size: r.size ?? null,
    package_version: r.package_version ?? null,
    status: r.status,
    sku: r.sku ?? null,
  }
}

function describe(r: PackshotRecord): string {
  const bits = [r.product]
  if (r.size) bits.push(r.size)
  if (r.package_version) bits.push(`packaging ${r.package_version}`)
  return bits.join(' · ')
}

// ─── server construction ──────────────────────────────────────────────────────

function buildServer(req: Request): McpServer {
  const principal = principalOf(req)

  const server = new McpServer(
    { name: 'sliquid-packshots', version: '1.0.0' },
    {
      instructions:
        'Approved Sliquid product packshots. Always search first, confirm the exact ' +
        'product AND size with the user before using an asset, and never substitute a ' +
        'different size or packaging version. Product imagery returned here is the ' +
        'approved artwork of record: composite it, never regenerate, recolour or relabel it.',
    },
  )

  // ── A. search_packshots ────────────────────────────────────────────────────

  server.registerTool(
    'search_packshots',
    {
      title: 'Search approved packshots',
      description:
        'Find approved Sliquid product packshots by product name, optionally narrowed ' +
        'by size. Returns every match — it deliberately does NOT pick one for you. If ' +
        'more than one size or packaging version comes back, ask the user which they ' +
        'want before calling get_packshot.',
      inputSchema: {
        product: z.string().min(1).describe('Product name or fragment, e.g. "H2O" or "Sassy".'),
        size: z.string().optional().describe('Optional size filter, e.g. "4.2 oz".'),
        include_inactive: z
          .boolean()
          .optional()
          .describe('Include discontinued and not-yet-approved packshots. Defaults to false.'),
      },
      outputSchema: {
        query: z.string(),
        count: z.number(),
        candidates: z.array(candidateShape),
        needs_disambiguation: z.boolean(),
        note: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ product, size, include_inactive }) => {
      const includeInactive = include_inactive ?? false
      let rows = searchPackshots({ product, size, includeInactive, limit: 50 })
      let note = ''

      // "That product is discontinued" is a far more useful answer than
      // "not found" — so when an active search comes back empty, look again
      // with inactive included purely to explain WHY there is nothing.
      if (rows.length === 0 && !includeInactive) {
        const inactive = searchPackshots({ product, size, includeInactive: true, limit: 50 })
        if (inactive.length > 0) {
          rows = inactive
          const statuses = [...new Set(inactive.map(r => r.status))].join(', ')
          note =
            `No ACTIVE approved packshot matches "${product}"${size ? ` in size ${size}` : ''}. ` +
            `Matching records exist but their status is: ${statuses}. ` +
            'Discontinued and pending_approval packshots must not be used in new ' +
            'marketing material — tell the user the product is no longer current ' +
            'rather than substituting a different product.'
        } else {
          note = `No packshot matches "${product}"${size ? ` in size ${size}` : ''}.`
        }
      }

      const distinctSizes = new Set(rows.map(r => r.size ?? '')).size
      const needsDisambiguation = rows.length > 1 || distinctSizes > 1

      if (!note) {
        note = needsDisambiguation
          ? `${rows.length} approved packshots match. Do NOT choose one yourself — ask the ` +
            'user which product and size they mean, then call get_packshot with that asset_id.'
          : rows.length === 1
            ? 'Exactly one approved packshot matches. Confirm the product and size with the ' +
              'user before using it.'
            : `No packshot matches "${product}".`
      }

      const candidates = rows.map(toCandidate)
      const lines = candidates.map(
        c =>
          `- ${c.asset_id}: ${c.product}${c.size ? ` — ${c.size}` : ''}` +
          `${c.package_version ? ` (packaging ${c.package_version})` : ''}` +
          `${c.sku ? ` [SKU ${c.sku}]` : ''} — status: ${c.status}`,
      )

      auditMcp({
        principal,
        tool: 'search_packshots',
        result: 'ok',
        detail: `product="${product}"${size ? ` size="${size}"` : ''} → ${rows.length} match(es)`,
      })

      return {
        structuredContent: {
          query: product,
          count: candidates.length,
          candidates,
          needs_disambiguation: needsDisambiguation,
          note,
        },
        content: [
          {
            type: 'text' as const,
            text:
              (candidates.length
                ? `Found ${candidates.length} packshot(s):\n${lines.join('\n')}\n\n`
                : '') + note,
          },
        ],
      }
    },
  )

  // ── B. get_packshot ────────────────────────────────────────────────────────

  server.registerTool(
    'get_packshot',
    {
      title: 'Get an approved packshot',
      description:
        'Retrieve the approved image bytes for one packshot by asset_id. Only ACTIVE ' +
        'approved packshots are served, and every file is SHA-256 verified before it ' +
        'leaves the server. Use the exact asset_id returned by search_packshots.',
      inputSchema: {
        asset_id: z.string().min(1).describe('Asset id from search_packshots.'),
      },
      outputSchema: {
        asset_id: z.string(),
        product: z.string(),
        size: z.string().nullable(),
        sku: z.string().nullable(),
        package_version: z.string().nullable(),
        filename: z.string(),
        sha256: z.string(),
      },
      annotations: READ_ONLY,
    },
    async ({ asset_id }) => {
      const rec = getPackshotByAssetId(asset_id)
      if (!rec) {
        auditMcp({
          principal,
          tool: 'get_packshot',
          assetId: asset_id,
          result: 'denied',
          detail: 'unknown asset_id',
        })
        throw new Error(
          `No approved packshot exists for asset id "${asset_id}". Run search_packshots ` +
            'to find the correct id — do not guess one.',
        )
      }
      if (rec.status !== 'active') {
        auditMcp({
          principal,
          tool: 'get_packshot',
          assetId: asset_id,
          result: 'denied',
          detail: `status=${rec.status}`,
        })
        throw new Error(
          `Packshot "${asset_id}" (${describe(rec)}) is not an active approved asset — its ` +
            `status is "${rec.status}". Discontinued and pending_approval packshots must not ` +
            'be used. Tell the user rather than substituting another product or size.',
        )
      }

      let bytes: Buffer
      try {
        bytes = await loadPackshotBytes(rec)
      } catch (err: any) {
        auditMcp({
          principal,
          tool: 'get_packshot',
          assetId: asset_id,
          result: 'error',
          detail: err?.message ?? 'byte load failed',
          sha256: rec.sha256 ?? undefined,
        })
        throw err
      }

      auditMcp({
        principal,
        tool: 'get_packshot',
        assetId: asset_id,
        result: 'ok',
        sha256: rec.sha256 ?? undefined,
      })

      return {
        structuredContent: {
          asset_id: rec.asset_id,
          product: rec.product,
          size: rec.size ?? null,
          sku: rec.sku ?? null,
          package_version: rec.package_version ?? null,
          filename: rec.filename,
          sha256: rec.sha256!,
        },
        content: [
          {
            type: 'text' as const,
            text:
              `Approved packshot: ${describe(rec)}${rec.sku ? ` [SKU ${rec.sku}]` : ''}.\n` +
              `asset_id: ${rec.asset_id}\nfile: ${rec.filename}\nsha256: ${rec.sha256}\n` +
              'This is the approved artwork of record. Composite it as-is — do not ' +
              'regenerate, recolour, relabel, crop through, or retouch the product.',
          },
          // See PLATFORM LIMITATION at the top of this file.
          { type: 'image' as const, data: bytes.toString('base64'), mimeType: rec.mime_type },
        ],
      }
    },
  )

  // ── C. create_product_composition ──────────────────────────────────────────

  server.registerTool(
    'create_product_composition',
    {
      title: 'Compose a product image',
      description:
        'Place an approved packshot onto a background to produce a marketing image. ' +
        'The product pixels are composited unchanged — only the background is generated. ' +
        'Supply either background_prompt (AI-generated scene) or background_color ' +
        '(solid/gradient). Confirm the product and size with the user first.',
      inputSchema: {
        asset_id: z.string().min(1).describe('Asset id of an ACTIVE approved packshot.'),
        aspect: z
          .enum(['1:1', '4:5', '9:16', '16:9'])
          .default('1:1')
          .describe('Output aspect ratio.'),
        background_prompt: z
          .string()
          .optional()
          .describe('Scene description for the generated background. No products or text.'),
        background_color: z
          .string()
          .optional()
          .describe('Hex colour for a solid/gradient background, e.g. "#eceef0".'),
        placement: z.enum(['center', 'left', 'right']).default('center'),
        scale: z
          .number()
          .optional()
          .describe('Product height as a fraction of canvas height (0.1–0.95). Default 0.72.'),
        shadow: z.boolean().default(false).describe('Soft drop shadow behind the product.'),
        reflection: z.boolean().default(false).describe('Soft reflection below the product.'),
      },
      outputSchema: {
        asset_id: z.string(),
        sku: z.string().nullable(),
        product: z.string(),
        size: z.string().nullable(),
        source_sha256: z.string(),
        composition: z.object({
          aspect: z.string(),
          width: z.number(),
          height: z.number(),
          placement: z.string(),
          scale: z.number(),
          product_scale_factor: z.number(),
          shadow: z.boolean(),
          reflection: z.boolean(),
          background: z.string(),
          background_prompt: z.string().nullable(),
          product_layer: z.string(),
          warnings: z.array(z.string()),
        }),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async args => {
      const {
        asset_id,
        aspect,
        background_prompt,
        background_color,
        placement,
        scale,
        shadow,
        reflection,
      } = args as {
        asset_id: string
        aspect: Aspect
        background_prompt?: string
        background_color?: string
        placement: Placement
        scale?: number
        shadow: boolean
        reflection: boolean
      }

      const rec = getPackshotByAssetId(asset_id)
      if (!rec || rec.status !== 'active') {
        auditMcp({
          principal,
          tool: 'create_product_composition',
          assetId: asset_id,
          result: 'denied',
          detail: rec ? `status=${rec.status}` : 'unknown asset_id',
        })
        throw new Error(
          rec
            ? `Packshot "${asset_id}" is not active (status "${rec.status}") and cannot be ` +
              'used in a composition.'
            : `No approved packshot exists for asset id "${asset_id}".`,
        )
      }

      let productPng: Buffer
      try {
        productPng = await loadPackshotBytes(rec)
      } catch (err: any) {
        auditMcp({
          principal,
          tool: 'create_product_composition',
          assetId: asset_id,
          result: 'error',
          detail: err?.message ?? 'byte load failed',
          sha256: rec.sha256 ?? undefined,
        })
        throw err
      }

      // Background: AI scene when asked for AND configured, otherwise a solid /
      // gradient colour. The tool must never hard-fail for want of an API key.
      let backgroundBytes: Buffer | null = null
      let backgroundKind = 'color'
      if (background_prompt?.trim()) {
        backgroundBytes = await generateBackground(background_prompt, aspect)
        if (backgroundBytes) backgroundKind = 'generated'
      }

      const canvasWidth = aspect === '9:16' ? 1080 : 1200
      const composed = await composeProductImage({
        productPng,
        background: backgroundBytes ?? { color: background_color ?? DEFAULT_BACKGROUND_COLOR },
        aspect,
        canvasWidth,
        placement,
        scale,
        shadow,
        reflection,
      })

      const warnings = [...composed.warnings]
      if (background_prompt?.trim() && !backgroundBytes) {
        warnings.push(
          'Background generation was unavailable (no GEMINI_API_KEY, or the request ' +
            'failed); fell back to a solid colour background.',
        )
      }

      const composition = {
        aspect,
        width: composed.width,
        height: composed.height,
        placement,
        scale: Math.max(0.1, Math.min(0.95, scale ?? 0.72)),
        product_scale_factor: composed.productScaleFactor,
        shadow,
        reflection,
        background: backgroundKind,
        background_prompt: background_prompt?.trim() ?? null,
        // Recorded in the audit trail so a reviewer can tell, from the structured
        // output alone, that the product was not regenerated.
        product_layer:
          'composited unchanged from the approved packshot (uniform scale + translation only)',
        warnings,
      }

      auditMcp({
        principal,
        tool: 'create_product_composition',
        assetId: asset_id,
        result: 'ok',
        sha256: rec.sha256 ?? undefined,
        detail: `${aspect} ${composed.width}x${composed.height} bg=${backgroundKind}`,
      })

      return {
        structuredContent: {
          asset_id: rec.asset_id,
          sku: rec.sku ?? null,
          product: rec.product,
          size: rec.size ?? null,
          source_sha256: rec.sha256!,
          composition,
        },
        content: [
          {
            type: 'text' as const,
            text:
              `Composed a ${composed.width}x${composed.height} (${aspect}) PNG of ` +
              `${describe(rec)}${rec.sku ? ` [SKU ${rec.sku}]` : ''}.\n` +
              `Product layer: composited unchanged from approved packshot ` +
              `${rec.asset_id} (sha256 ${rec.sha256}); uniform scale + translation only.\n` +
              `Background: ${backgroundKind}` +
              `${composition.background_prompt ? ` — "${composition.background_prompt}"` : ''}.\n` +
              `Placement: ${placement}, scale ${composition.scale}, shadow ${shadow}, ` +
              `reflection ${reflection}.` +
              (warnings.length ? `\nWarnings:\n- ${warnings.join('\n- ')}` : ''),
          },
          // See PLATFORM LIMITATION at the top of this file.
          {
            type: 'image' as const,
            data: composed.buffer.toString('base64'),
            mimeType: composed.mimeType,
          },
        ],
      }
    },
  )

  return server
}

// ─── transport ────────────────────────────────────────────────────────────────

const mcpLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Too many requests. Please slow down.' },
    id: null,
  },
})

function methodNotAllowed(_req: Request, res: Response) {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  })
}

export function createMcpRouter(): Router {
  const router = Router()

  router.use(mcpLimiter)
  // Auth guards the whole surface, including the 405 responses — an unauthenticated
  // caller learns nothing about which HTTP methods this endpoint implements.
  router.use(requireMcpScope('assets:read'))

  router.post('/', async (req: Request, res: Response) => {
    // STATELESS: a fresh McpServer + transport per POST. A shared instance
    // collides on JSON-RPC request ids as soon as two clients are in flight at
    // once, which surfaces as responses delivered to the wrong caller.
    const server = buildServer(req)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })

    res.on('close', () => {
      void transport.close()
      void server.close()
    })

    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[mcp] request failed:', err)
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        })
      }
    }
  })

  // No standalone SSE stream and no session teardown in stateless mode.
  router.get('/', methodNotAllowed)
  router.delete('/', methodNotAllowed)

  return router
}
