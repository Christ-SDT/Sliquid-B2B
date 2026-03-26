import { Router } from 'express'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { GoogleGenAI } from '@google/genai'
import { randomUUID } from 'crypto'
import { db } from '../database.js'
import { requireAuth } from '../middleware/auth.js'
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

// Return label images whose filenames best match keywords in the prompt (up to maxCount)
function getLabelImageParts(prompt: string, maxCount = 3): { inlineData: { data: string; mimeType: string } }[] {
  try {
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../assets/labels'
    )
    if (!fs.existsSync(dir)) return []

    const files = fs.readdirSync(dir).filter(f => /\.(png|jpg|jpeg)$/i.test(f))
    if (files.length === 0) return []

    // Extract meaningful keywords from the prompt (≥2 chars, not stop words)
    const keywords = prompt
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2 && !STOP_WORDS.has(w))

    if (keywords.length === 0) return files.slice(0, maxCount).map(f => toImagePart(dir, f))

    // Score each file by how many prompt keywords appear in its name
    const scored = files
      .map(f => {
        const lower = f.toLowerCase()
        const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0)
        return { f, score }
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)

    // If nothing matched by keyword, send a small generic sample so AI has design context
    const chosen = scored.length > 0 ? scored.slice(0, maxCount).map(({ f }) => f) : files.slice(0, 2)
    return chosen.map(f => toImagePart(dir, f))
  } catch {
    return []
  }
}

function toImagePart(dir: string, filename: string) {
  return {
    inlineData: {
      data: fs.readFileSync(path.join(dir, filename)).toString('base64'),
      mimeType: filename.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
    },
  }
}

const BRAND_BRIEF =
  `You are Lampy, Sliquid's AI product image creator.
The reference images above show the EXACT Sliquid product bottles and labels — use them as your visual source of truth.
Reproduce the bottle design, label artwork, color scheme, and typography faithfully from those references; do not invent a generic bottle.
Place the product in a flattering lifestyle context (spa shelves, bathroom counters, bedside tables) with soft professional lighting.
Render realistic, high-quality imagery suitable for retail and marketing use.`

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
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
    const labelParts = getLabelImageParts(prompt.trim())
    const refNote = labelParts.length > 0
      ? `(${labelParts.length} reference image${labelParts.length > 1 ? 's' : ''} of the actual product label provided above)`
      : ''

    const response = await ai.models.generateContent({
      model: 'gemini-3.1-flash-image-preview',
      contents: [{
        role: 'user',
        parts: [
          ...labelParts,
          { text: `${BRAND_BRIEF}\n\nCreate: ${prompt.trim()} ${refNote}` },
        ],
      }],
      config: { responseModalities: ['TEXT', 'IMAGE'] as any },
    })

    // Extract image bytes from response
    let imageData: string | null = null
    const parts = (response as any).candidates?.[0]?.content?.parts ?? []
    for (const part of parts) {
      if (part?.inlineData?.data) {
        imageData = part.inlineData.data
        break
      }
    }
    if (!imageData) return res.status(500).json({ error: 'No image returned from AI' })

    // Upload to S3
    const s3 = getS3Client()
    const s3Key = `ai-images/${req.user!.id}/${randomUUID()}.png`
    const bucket = process.env.S3_BUCKET!
    const region = process.env.AWS_REGION ?? 'us-east-1'

    await s3.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: Buffer.from(imageData, 'base64'),
      ContentType: 'image/png',
    }))

    const s3Url = `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO ai_images (user_id, created_by, prompt, s3_url, s3_key)
      VALUES (?, ?, ?, ?, ?)
    `).run(req.user!.id, req.user!.name, prompt.trim(), s3Url, s3Key)

    const row = db.prepare('SELECT * FROM ai_images WHERE id = ?').get(lastInsertRowid)
    return res.json(row)
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
