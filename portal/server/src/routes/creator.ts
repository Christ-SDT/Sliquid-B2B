import { Router } from 'express'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
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

const MODEL_IMAGEN  = 'imagen-3.0-generate-002'
const MODEL_GEMINI  = 'gemini-3-flash-preview'
const VALID_MODELS  = [MODEL_IMAGEN, MODEL_GEMINI] as const

function getActiveModel(): string {
  try {
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'ai_model'").get() as any
    return row?.value ?? MODEL_GEMINI
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

  const { prompt, referenceImage } = req.body as {
    prompt?: string
    referenceImage?: { data: string; mimeType: string }
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

    // ── Build parts: optional user reference image first, then the prompt ──
    const imageParts = referenceImage?.data
      ? [{ inlineData: { data: referenceImage.data, mimeType: referenceImage.mimeType } }]
      : []

    const textPart = imageParts.length > 0
      ? `REFERENCE IMAGE PROVIDED ABOVE: Copy the exact product appearance (bottle shape, label, colors, typography) from the reference.\n\nScene to create: ${prompt.trim()}\n\nOnly the background, environment, and lighting should change from the reference.`
      : prompt.trim()

    // ── Gemini image generation ──
    const response = await ai.models.generateContent({
      model: MODEL_GEMINI,
      contents: [{ role: 'user', parts: [...imageParts, { text: textPart }] }],
      config: {
        systemInstruction: BRAND_BRIEF,
        responseModalities: ['IMAGE', 'TEXT'] as any,
      },
    })

    const parts = (response as any).candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find((p: any) => p.inlineData?.data)
    const imageBytes = imagePart?.inlineData?.data
    const mimeType = imagePart?.inlineData?.mimeType ?? 'image/png'
    if (!imageBytes) return res.status(500).json({ error: 'No image returned from AI' })

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
  const images = db.prepare('SELECT * FROM ai_images ORDER BY created_at DESC').all()
  return res.json(images)
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
