import { Router } from 'express'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { GoogleGenAI, StyleReferenceImage } from '@google/genai'
import { randomUUID } from 'crypto'
import fs from 'fs'
import path from 'path'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'

const router = Router()

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getS3Client() {
  return new S3Client({
    region: process.env.AWS_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

// ─── Label image helpers (Gemini path) ───────────────────────────────────────

const LABELS_DIR = path.join(process.cwd(), 'labels')
const MAX_LABEL_IMAGES = 5
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'on', 'in', 'at', 'of', 'for', 'to', 'and', 'or', 'with', 'by',
  'bottle', 'bottles', 'shelf', 'photo', 'image', 'picture', 'product', 'lifestyle', 'setting',
])

function getPromptKeywords(prompt: string): string[] {
  return [...new Set(
    prompt.toLowerCase().split(/\s+/)
      .map(w => w.replace(/[^a-z0-9]/g, ''))
      .filter(w => w.length > 1 && !STOP_WORDS.has(w))
  )]
}

function getLabelImageParts(prompt: string): Array<{ inlineData: { data: string; mimeType: string } }> {
  try {
    if (!fs.existsSync(LABELS_DIR)) return []
    const allFiles = (fs.readdirSync(LABELS_DIR) as string[]).filter(
      f => /\.(png|jpg|jpeg|webp)$/i.test(f)
    )
    if (allFiles.length === 0) return []
    const keywords = getPromptKeywords(prompt)
    if (keywords.length === 0) return []
    const matched = allFiles
      .filter(f => keywords.some(kw => f.toLowerCase().includes(kw)))
      .slice(0, MAX_LABEL_IMAGES)
    const parts: Array<{ inlineData: { data: string; mimeType: string } }> = []
    for (const filename of matched) {
      try {
        const data = fs.readFileSync(path.join(LABELS_DIR, filename))
        const ext = path.extname(filename).toLowerCase().slice(1)
        const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`
        parts.push({ inlineData: { data: Buffer.from(data).toString('base64'), mimeType } })
      } catch {
        // skip unreadable files
      }
    }
    return parts
  } catch {
    return []
  }
}

// ─────────────────────────────────────────────────────────────────────────────

const BRAND_BRIEF =
  `You are a professional product photographer for Sliquid, an intimate wellness brand.
Generate photorealistic product lifestyle photography — never illustrations, diagrams, or cartoons.

REFERENCE IMAGES: If images are provided before this message, they show the EXACT Sliquid product bottles, labels, colors, and typography. Reproduce those designs faithfully — do not invent a generic bottle shape or label. Match the label artwork, color scheme, and text layout precisely from the references.

SLIQUID BRAND GUIDELINES:
- Bottles are sleek, minimalist, with light blue (#0A84C0) and white color palette, clean sans-serif typography
- Ride Lube bottles have a bolder, darker aesthetic with contrasting accents
- Products belong in upscale, aspirational settings: marble bathroom countertops, spa shelves, bedside tables with linen, natural wood surfaces
- Lighting: soft diffused window light or warm studio lighting — no harsh shadows
- Mood: clean, calm, trustworthy, wellness-focused
- Never show any explicit content, nudity, or suggestive imagery — products are health and wellness items

PHOTOGRAPHY STYLE:
- Ultra-sharp product focus, shallow depth of field for background
- Colors: muted warm neutrals, soft whites, sage greens, warm grays as backgrounds
- Composition: rule of thirds, negative space, editorial-style framing
- Resolution: high detail, photorealistic render quality
- Style reference: similar to Aesop, Glossier, or Malin+Goetz product photography`

// ─── Model constants ──────────────────────────────────────────────────────────

const MODEL_IMAGEN       = 'imagen-4.0-generate-001'
const MODEL_GEMINI       = 'gemini-3.1-flash-image-preview'
const MODEL_GEMINI_NANO  = 'gemini-2.5-flash-image'
const VALID_MODELS  = [MODEL_IMAGEN, MODEL_GEMINI, MODEL_GEMINI_NANO] as const

function getActiveModel(): string {
  try {
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'ai_model'").get() as any
    const stored = row?.value
    // Validate stored value; fall back to Imagen if missing or unrecognized
    return stored && (VALID_MODELS as readonly string[]).includes(stored) ? stored : MODEL_IMAGEN
  } catch {
    return MODEL_IMAGEN
  }
}

// ─── GET /api/creator/settings ────────────────────────────────────────────────

router.get('/settings', requireAuth, requireRole('tier5', 'admin'), (_req, res) => {
  res.json({ model: getActiveModel() })
})

// ─── POST /api/creator/settings ───────────────────────────────────────────────

router.post('/settings', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const { model } = req.body as { model?: string }
  if (!model || !(VALID_MODELS as readonly string[]).includes(model)) {
    res.status(400).json({ error: `model must be one of: ${VALID_MODELS.join(', ')}` }); return
  }
  db.prepare("INSERT OR REPLACE INTO woo_settings (key, value) VALUES ('ai_model', ?)").run(model)
  res.json({ ok: true, model })
})

// ─── POST /api/creator/generate ──────────────────────────────────────────────

router.post('/generate', requireAuth, async (req, res) => {
  if (req.user!.role === 'tier4') return res.status(403).json({ error: 'Forbidden' })

  const { prompt, referenceImage, referenceImageUrl } = req.body as {
    prompt?: string
    referenceImage?: { data: string; mimeType: string }
    referenceImageUrl?: string
  }
  if (!prompt?.trim()) return res.status(400).json({ error: 'prompt is required' })

  if (!process.env.GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI image generation not configured (missing GEMINI_API_KEY)' })
  }
  if (!process.env.S3_BUCKET || !process.env.AWS_ACCESS_KEY_ID) {
    return res.status(503).json({ error: 'Image storage not configured (missing S3_BUCKET or AWS credentials)' })
  }

  try {
    const activeModel = getActiveModel()
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })

    let imageBytes: string
    let mimeType: string

    if (activeModel === MODEL_IMAGEN) {
      // ── Imagen 4 path ──────────────────────────────────────────────────────
      const enrichedPrompt = `${BRAND_BRIEF}\n\nUser request: ${prompt.trim()}`

      // Resolve reference image (URL fetch or base64 upload)
      let refBytes: string | null = null
      let refMime = 'image/jpeg'
      if (referenceImage?.data) {
        refBytes = referenceImage.data
        refMime = referenceImage.mimeType
      } else if (referenceImageUrl) {
        try {
          const imgRes = await fetch(referenceImageUrl)
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            refMime = imgRes.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
            refBytes = buffer.toString('base64')
          }
        } catch (err) {
          console.error('[creator] failed to fetch referenceImageUrl for Imagen:', err)
        }
      }

      let imgBytes: string | Uint8Array | undefined
      if (refBytes) {
        // editImage: use reference as style guidance
        const styleRef = new StyleReferenceImage()
        styleRef.referenceImage = { imageBytes: refBytes, mimeType: refMime }
        styleRef.referenceId = 1
        const response = await ai.models.editImage({
          model: MODEL_IMAGEN,
          prompt: enrichedPrompt,
          referenceImages: [styleRef],
        })
        imgBytes = response.generatedImages?.[0]?.image?.imageBytes
      } else {
        // generateImages: text-to-image (no reference)
        const response = await ai.models.generateImages({
          model: MODEL_IMAGEN,
          prompt: enrichedPrompt,
          config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        })
        imgBytes = response.generatedImages?.[0]?.image?.imageBytes
      }

      if (!imgBytes) return res.status(500).json({ error: 'No image returned from AI' })
      imageBytes = typeof imgBytes === 'string' ? imgBytes : Buffer.from(imgBytes).toString('base64')
      mimeType = 'image/jpeg'
    } else {
      // ── Gemini path (generateContent) ─────────────────────────────────────
      // Label images: load matching product label images from the local labels/ dir
      const labelParts = getLabelImageParts(prompt.trim())

      // Resolve reference image: base64 upload takes precedence; fall back to URL fetch
      let resolvedRef = referenceImage?.data ? referenceImage : null
      if (!resolvedRef && referenceImageUrl) {
        try {
          const imgRes = await fetch(referenceImageUrl)
          if (imgRes.ok) {
            const buffer = Buffer.from(await imgRes.arrayBuffer())
            const mimeType = imgRes.headers.get('content-type')?.split(';')[0] ?? 'image/jpeg'
            resolvedRef = { data: buffer.toString('base64'), mimeType }
          }
        } catch (err) {
          console.error('[creator] failed to fetch referenceImageUrl:', err)
        }
      }

      // User-provided reference image (optional)
      const userRefParts = resolvedRef
        ? [{ inlineData: { data: resolvedRef.data, mimeType: resolvedRef.mimeType } }]
        : []
      const allImageParts = [...labelParts, ...userRefParts]

      const textContent = allImageParts.length > 0
        ? `${allImageParts.length} reference image${allImageParts.length > 1 ? 's' : ''} provided above.\n\nScene to create: ${prompt.trim()}`
        : prompt.trim()

      const response = await ai.models.generateContent({
        model: activeModel,
        contents: [{ role: 'user', parts: [...allImageParts, { text: textContent }] }],
        config: {
          systemInstruction: BRAND_BRIEF,
          responseModalities: ['IMAGE', 'TEXT'] as any,
          imageConfig: { imageSize: '2K' } as any,  // 2048×2048 — 4× more pixels vs default 1K
        },
      })

      const parts = (response as any).candidates?.[0]?.content?.parts ?? []
      const imagePart = parts.find((p: any) => p.inlineData?.data)
      const imgBytes = imagePart?.inlineData?.data
      if (!imgBytes) return res.status(500).json({ error: 'No image returned from AI' })
      imageBytes = imgBytes
      mimeType = imagePart?.inlineData?.mimeType ?? 'image/png'
    }

    // Upload to S3
    const s3 = getS3Client()
    const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
    const s3Key = `ai-images/${req.user!.id}/${randomUUID()}.${ext}`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await s3.send(new PutObjectCommand({
      Bucket: bucket, Key: s3Key,
      Body: Buffer.from(imageBytes, 'base64'),
      ContentType: mimeType,
    }))

    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key, model) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.user!.id, req.user!.name, prompt.trim(), s3Url, s3Key, activeModel)

    return res.json(db.prepare('SELECT * FROM ai_images WHERE id = ?').get(lastInsertRowid))
  } catch (err: any) {
    console.error('[creator] generate error:', err)
    return res.status(500).json({ error: err.message ?? 'Failed to generate image' })
  }
})

// ─── GET /api/creator/images ──────────────────────────────────────────────────

router.get('/images', requireAuth, (req, res) => {
  if (req.user!.role === 'tier4') return res.status(403).json({ error: 'Forbidden' })
  const images = db.prepare('SELECT * FROM ai_images WHERE approved = 1 ORDER BY created_at DESC').all()
  return res.json(images)
})

// ─── POST /api/creator/images/:id/approve ────────────────────────────────────

router.post('/:id/approve', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const result = db.prepare('UPDATE ai_images SET approved = 1 WHERE id = ?').run(id)
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
  return res.json(db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id))
})

// ─── POST /api/creator/images/:id/unapprove ──────────────────────────────────

router.post('/:id/unapprove', requireAuth, requireRole('tier5', 'admin'), (req, res) => {
  const id = Number(req.params.id)
  const result = db.prepare('UPDATE ai_images SET approved = 0 WHERE id = ?').run(id)
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' })
  return res.json(db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id))
})

// ─── DELETE /api/creator/:id ──────────────────────────────────────────────────

router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id)
  const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(id) as any
  if (!row) return res.status(404).json({ error: 'Not found' })

  const isAdminRole = req.user!.role === 'tier5' || req.user!.role === 'admin'
  if (row.user_id !== req.user!.id && !isAdminRole) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  try {
    const s3 = getS3Client()
    await s3.send(new DeleteObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: row.s3_key,
    }))
  } catch (err) {
    console.error('[creator] S3 delete error:', err)
    // continue — delete from DB even if S3 fails
  }

  db.prepare('DELETE FROM ai_images WHERE id = ?').run(id)
  return res.json({ ok: true })
})

export default router
