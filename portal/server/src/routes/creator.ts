import { Router } from 'express'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
import { db } from '../database.js'
import { requireAuth, requireRole } from '../middleware/auth.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

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

// Stop words to ignore when keyword-matching the prompt against label filenames
const STOP_WORDS = new Set([
  'a','an','the','in','on','at','of','for','to','and','or','with','by','is','be',
  'can','you','create','make','generate','image','photo','picture','shot','show',
  'place','put','using','use','like','as','its','it','please','me','my','our','some',
  'background','setting','scene','lifestyle','product','bottle','bottles','packaging',
])

// Return matched product label names (without extension) to describe in the prompt
function getMatchedProductNames(prompt: string, max = 3): string[] {
  try {
    const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../assets/labels')
    if (!fs.existsSync(dir)) return []
    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    const keywords = prompt.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w))
    if (keywords.length === 0) return []
    return files
      .map(f => ({ f, score: keywords.reduce((a, k) => a + (f.toLowerCase().includes(k) ? 1 : 0), 0) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, max)
      .map(({ f }) => f.replace(/\.(png|jpg|jpeg)$/i, ''))
  } catch { return [] }
}

const BRAND_BRIEF =
  `You are Lampy, Sliquid's AI product image creator.
Generate professional product photography for Sliquid and Ride Lube intimate wellness products.
Sliquid bottles: elegant, minimalist design with light blues, white, and soft naturals palette, clean typography.
Ride Lube bottles: bold, modern design with darker accents.
Place products in flattering lifestyle contexts — spa shelves, bathroom counters, bedside tables — with soft professional lighting.
Render photorealistic, high-resolution imagery suitable for retail display and marketing.`

// ─── Model constants ──────────────────────────────────────────────────────────

const MODEL_IMAGEN  = 'imagen-3.0-generate-002'
const MODEL_GEMINI  = 'gemini-2.0-flash-exp'
const VALID_MODELS  = [MODEL_IMAGEN, MODEL_GEMINI] as const

function getActiveModel(): string {
  try {
    const row = db.prepare("SELECT value FROM woo_settings WHERE key = 'ai_model'").get() as any
    return row?.value ?? MODEL_IMAGEN
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

  const { prompt } = req.body as { prompt?: string }
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

    const productNames = getMatchedProductNames(prompt.trim())
    const productRef = productNames.length > 0
      ? `Specific Sliquid product(s) to feature: ${productNames.join(', ')}. Reproduce the actual bottle design for this variant accurately. `
      : ''

    let imageBytes: string
    let mimeType = 'image/png'

    if (activeModel === MODEL_GEMINI) {
      // ── Gemini path — generateContent with quality improvements ──
      const enrichedPrompt = `${productRef}Create: ${prompt.trim()}`
      const response = await ai.models.generateContent({
        model: MODEL_GEMINI,
        contents: [{ role: 'user', parts: [{ text: enrichedPrompt }] }],
        config: {
          systemInstruction: BRAND_BRIEF,
          responseModalities: ['IMAGE', 'TEXT'],
          imageConfig: { personGeneration: 'ALLOW_ADULT' },
        },
      })
      const parts = (response as any).candidates?.[0]?.content?.parts ?? []
      const imagePart = parts.find((p: any) => p.inlineData?.data)
      imageBytes = imagePart?.inlineData?.data
      mimeType = imagePart?.inlineData?.mimeType ?? 'image/png'
    } else {
      // ── Imagen path — original stable model ──
      const enrichedPrompt = `${BRAND_BRIEF}\n\n${productRef}Create: ${prompt.trim()}`
      const response = await (ai.models as any).generateImages({
        model: MODEL_IMAGEN,
        prompt: enrichedPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1',
          personGeneration: 'allow_adult',
          safetyFilterLevel: 'block_only_high',
        },
      })
      imageBytes = response?.generatedImages?.[0]?.image?.imageBytes
    }

    if (!imageBytes!) return res.status(500).json({ error: 'No image returned from AI' })

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
