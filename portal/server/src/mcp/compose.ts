import sharp from 'sharp'

/**
 * Brand-safe product compositing.
 *
 * THE ENTIRE POINT OF THIS MODULE is that the product pixels are COMPOSITED,
 * NEVER REGENERATED. A generative model may produce the background; it may
 * never produce, redraw, or "improve" the bottle. The approved packshot is the
 * label of record — a hallucinated label is a regulatory problem, not a
 * cosmetic one.
 *
 * The ONLY operations this module performs on the product layer are:
 *   1. uniform proportional scale
 *   2. translation
 *
 * Explicitly NOT permitted on the product layer, and deliberately absent from
 * the code below: recolouring, relabelling, warping, non-uniform resize,
 * retouching, blurring, filtering, colour adjustment, or any crop that cuts
 * through the product. Placement is clamped so the product always lands fully
 * inside the canvas rather than being cropped to fit.
 *
 * Shadow and reflection are optional decorations. They are drawn from the
 * product's own alpha channel and composited BEHIND / BELOW the product layer,
 * so they can never sit on top of the label.
 */

export type Aspect = '1:1' | '4:5' | '9:16' | '16:9'
export type Placement = 'center' | 'left' | 'right'

export interface ComposeOptions {
  /** Approved packshot bytes — PNG with alpha. Composited as-is. */
  productPng: Buffer
  /** Background image bytes, or a solid/gradient built from a hex colour. */
  background: Buffer | { color: string }
  aspect: Aspect
  canvasWidth: number
  placement?: Placement
  /** Horizontal nudge as a fraction of canvas width (-0.5 … 0.5). */
  offsetX?: number
  /** Vertical nudge as a fraction of canvas height (-0.5 … 0.5). */
  offsetY?: number
  /** Product height as a fraction of canvas height. Clamped to 0.1 … 0.95. */
  scale?: number
  shadow?: boolean
  reflection?: boolean
}

export interface ComposeResult {
  buffer: Buffer
  mimeType: 'image/png'
  width: number
  height: number
  /** Product resize factor relative to source resolution. > 1 means upscaled. */
  productScaleFactor: number
  /** Non-fatal quality notes, e.g. the product layer was upscaled. */
  warnings: string[]
}

/** width ÷ height for each supported aspect. */
const ASPECT_RATIO: Record<Aspect, number> = {
  '1:1': 1,
  '4:5': 4 / 5,
  '9:16': 9 / 16,
  '16:9': 16 / 9,
}

const MIN_CANVAS = 256
const MAX_CANVAS = 2048
const MIN_SCALE = 0.1
const MAX_SCALE = 0.95
/** Side margin as a fraction of canvas width for left/right placement. */
const EDGE_MARGIN = 0.06
/** Product may occupy at most this fraction of canvas width. */
const MAX_WIDTH_FRACTION = 0.9

const DEFAULT_BG_COLOR = '#eceef0'

// ─── colour helpers ───────────────────────────────────────────────────────────

interface Rgb {
  r: number
  g: number
  b: number
}

function parseHexColor(input: string): Rgb {
  const raw = input.trim().replace(/^#/, '')
  const hex =
    raw.length === 3
      ? raw
          .split('')
          .map(c => c + c)
          .join('')
      : raw
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(`background_color must be a hex colour like #f4f4f5 (received "${input}")`)
  }
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16),
  }
}

function shift(c: Rgb, amount: number): Rgb {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amount)))
  return { r: f(c.r), g: f(c.g), b: f(c.b) }
}

function toHex(c: Rgb): string {
  return '#' + [c.r, c.g, c.b].map(v => v.toString(16).padStart(2, '0')).join('')
}

// ─── background ───────────────────────────────────────────────────────────────

async function buildBackground(
  background: Buffer | { color: string },
  width: number,
  height: number,
): Promise<Buffer> {
  if (Buffer.isBuffer(background)) {
    // `cover` may crop the BACKGROUND — that is fine and explicitly allowed.
    // The product layer is the only thing protected from cropping.
    return sharp(background)
      .resize(width, height, { fit: 'cover', position: 'centre' })
      .removeAlpha()
      .png()
      .toBuffer()
  }

  const base = parseHexColor(background.color || DEFAULT_BG_COLOR)
  const top = shift(base, 14)
  const bottom = shift(base, -16)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${toHex(top)}"/>
      <stop offset="100%" stop-color="${toHex(bottom)}"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
</svg>`

  try {
    return await sharp(Buffer.from(svg)).png().toBuffer()
  } catch {
    // Builds of sharp without SVG rasterisation still get a usable flat colour.
    return sharp({
      create: { width, height, channels: 3, background: base },
    })
      .png()
      .toBuffer()
  }
}

// ─── overlay clipping ─────────────────────────────────────────────────────────

interface Overlay {
  input: Buffer
  left: number
  top: number
}

/**
 * Clip a decorative overlay (shadow / reflection) to the canvas.
 *
 * sharp refuses composites that fall outside the base image, and a blurred
 * shadow legitimately extends past the edges. Only the DECORATIONS ever pass
 * through here — the product layer is clamped to fit instead of being clipped.
 */
async function clipOverlay(
  buf: Buffer,
  w: number,
  h: number,
  left: number,
  top: number,
  canvasW: number,
  canvasH: number,
): Promise<Overlay | null> {
  const x0 = Math.max(0, left)
  const y0 = Math.max(0, top)
  const x1 = Math.min(canvasW, left + w)
  const y1 = Math.min(canvasH, top + h)
  if (x1 <= x0 || y1 <= y0) return null

  if (x0 === left && y0 === top && x1 === left + w && y1 === top + h) {
    return { input: buf, left, top }
  }
  const cropped = await sharp(buf)
    .extract({ left: x0 - left, top: y0 - top, width: x1 - x0, height: y1 - y0 })
    .png()
    .toBuffer()
  return { input: cropped, left: x0, top: y0 }
}

// ─── decorations, derived from the product's own alpha ────────────────────────

const SHADOW_OPACITY = 0.32
const REFLECTION_OPACITY = 0.28
/** Reflection height as a fraction of the product height. */
const REFLECTION_FRACTION = 0.45

async function buildShadow(
  productRgba: Buffer,
  w: number,
  h: number,
): Promise<{ buffer: Buffer; width: number; height: number; margin: number }> {
  const out = Buffer.alloc(w * h * 4)
  for (let i = 0; i < w * h; i++) {
    // RGB stays black; only the product's silhouette (alpha) is reused.
    out[i * 4 + 3] = Math.round(productRgba[i * 4 + 3]! * SHADOW_OPACITY)
  }
  const sigma = Math.max(1, h * 0.02)
  const margin = Math.ceil(sigma * 3)
  const buffer = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .extend({
      top: margin,
      bottom: margin,
      left: margin,
      right: margin,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .blur(sigma)
    .png()
    .toBuffer()
  return { buffer, width: w + margin * 2, height: h + margin * 2, margin }
}

async function buildReflection(
  productRgba: Buffer,
  w: number,
  h: number,
): Promise<{ buffer: Buffer; width: number; height: number } | null> {
  const rh = Math.max(1, Math.round(h * REFLECTION_FRACTION))
  if (rh < 2) return null

  const out = Buffer.alloc(w * rh * 4)
  for (let y = 0; y < rh; y++) {
    const srcY = h - 1 - y // vertical mirror of the product's bottom edge
    const fade = 1 - y / rh
    for (let x = 0; x < w; x++) {
      const s = (srcY * w + x) * 4
      const d = (y * w + x) * 4
      out[d] = productRgba[s]!
      out[d + 1] = productRgba[s + 1]!
      out[d + 2] = productRgba[s + 2]!
      out[d + 3] = Math.round(productRgba[s + 3]! * REFLECTION_OPACITY * fade * fade)
    }
  }
  const buffer = await sharp(out, { raw: { width: w, height: rh, channels: 4 } })
    .png()
    .toBuffer()
  return { buffer, width: w, height: rh }
}

// ─── main ─────────────────────────────────────────────────────────────────────

export async function composeProductImage(opts: ComposeOptions): Promise<ComposeResult> {
  const warnings: string[] = []

  const ratio = ASPECT_RATIO[opts.aspect]
  if (!ratio) throw new Error(`Unsupported aspect "${opts.aspect}"`)

  const canvasWidth = Math.round(
    Math.max(MIN_CANVAS, Math.min(MAX_CANVAS, opts.canvasWidth || 1200)),
  )
  const canvasHeight = Math.round(canvasWidth / ratio)

  // ── product layer: uniform scale only ──────────────────────────────────────
  //
  // Packshots are 1200x1200 with the bottle floating in transparent space. That
  // padding is not the product: leaving it in makes `scale` measure the canvas
  // rather than the bottle, parks the reflection in mid-air below the real
  // bottom edge, and inflates the width so wide canvases falsely trip the
  // overflow guard.
  //
  // This is NOT "cropping through the bottle" — threshold 0 against a fully
  // transparent background trims ONLY pixels that are exactly alpha=0, so no
  // product pixel can ever be removed. Do not raise the threshold.
  let source = opts.productPng
  try {
    source = await sharp(opts.productPng)
      .ensureAlpha()
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 0 })
      .png()
      .toBuffer()
  } catch {
    // Fully transparent, or an opaque packshot with nothing to trim.
    source = opts.productPng
  }

  const meta = await sharp(source).metadata()
  const srcW = meta.width ?? 0
  const srcH = meta.height ?? 0
  if (!srcW || !srcH) throw new Error('Could not read product image dimensions')

  const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, opts.scale ?? 0.72))

  // ONE factor drives both axes. This is what keeps the scale proportional —
  // do not replace it with independent width/height targets.
  let factor = (canvasHeight * scale) / srcH
  const maxProductWidth = canvasWidth * MAX_WIDTH_FRACTION
  if (srcW * factor > maxProductWidth) {
    factor = maxProductWidth / srcW
    warnings.push(
      'Product width would have exceeded the canvas at the requested scale; ' +
        'scaled down proportionally rather than cropping.',
    )
  }

  if (factor > 1.0) {
    // Quality guard: upscaling an approved packshot softens the label. We allow
    // it (the alternative is failing a legitimate request) but always surface it.
    warnings.push(
      `Product layer upscaled ${factor.toFixed(2)}x beyond source resolution ` +
        `(${srcW}x${srcH}); label detail may be soft. Prefer a smaller scale or ` +
        'a smaller canvas for print use.',
    )
  }

  const productW = Math.max(1, Math.round(srcW * factor))
  const productH = Math.max(1, Math.round(srcH * factor))

  const productPngResized = await sharp(source)
    .ensureAlpha()
    // `fill` at exactly (srcW*f, srcH*f) IS the uniform scale — the dimensions
    // were both derived from the single `factor` above. No crop, no distortion.
    .resize(productW, productH, { fit: 'fill', kernel: 'lanczos3' })
    .png()
    .toBuffer()

  // ── placement (translation only, clamped so nothing is ever cropped) ───────
  const margin = Math.round(canvasWidth * EDGE_MARGIN)
  let x: number
  switch (opts.placement ?? 'center') {
    case 'left':
      x = margin
      break
    case 'right':
      x = canvasWidth - productW - margin
      break
    default:
      x = (canvasWidth - productW) / 2
  }
  x += (opts.offsetX ?? 0) * canvasWidth

  let y = (canvasHeight - productH) / 2
  if (opts.reflection) {
    // Lift slightly so the reflection has somewhere to land — but never so far
    // that the product ends up flush against the top edge. A reflection that
    // runs off the bottom is clipped gracefully (it is fading out by then);
    // a bottle jammed into the top border is not recoverable.
    const topMargin = canvasHeight * 0.04
    const available = Math.max(0, (canvasHeight - productH) / 2 - topMargin)
    y -= Math.min(productH * REFLECTION_FRACTION * 0.35, available)
  }
  y += (opts.offsetY ?? 0) * canvasHeight

  const productX = Math.round(Math.max(0, Math.min(canvasWidth - productW, x)))
  const productY = Math.round(Math.max(0, Math.min(canvasHeight - productH, y)))

  // ── layers, back to front ──────────────────────────────────────────────────
  const layers: Overlay[] = []

  const needsRaw = opts.shadow || opts.reflection
  const productRgba = needsRaw
    ? await sharp(productPngResized).ensureAlpha().raw().toBuffer()
    : null

  if (opts.shadow && productRgba) {
    const s = await buildShadow(productRgba, productW, productH)
    const clipped = await clipOverlay(
      s.buffer,
      s.width,
      s.height,
      productX - s.margin + Math.round(productW * 0.02),
      productY - s.margin + Math.round(productH * 0.03),
      canvasWidth,
      canvasHeight,
    )
    if (clipped) layers.push(clipped)
  }

  if (opts.reflection && productRgba) {
    const r = await buildReflection(productRgba, productW, productH)
    if (r) {
      const clipped = await clipOverlay(
        r.buffer,
        r.width,
        r.height,
        productX,
        productY + productH + Math.max(1, Math.round(productH * 0.01)),
        canvasWidth,
        canvasHeight,
      )
      if (clipped) layers.push(clipped)
    }
  }

  // Product goes on LAST so nothing can be drawn over the label.
  layers.push({ input: productPngResized, left: productX, top: productY })

  const background = await buildBackground(opts.background, canvasWidth, canvasHeight)

  const buffer = await sharp(background)
    .composite(layers.map(l => ({ input: l.input, left: l.left, top: l.top })))
    .png()
    .toBuffer()

  return {
    buffer,
    mimeType: 'image/png',
    width: canvasWidth,
    height: canvasHeight,
    productScaleFactor: Number(factor.toFixed(4)),
    warnings,
  }
}
