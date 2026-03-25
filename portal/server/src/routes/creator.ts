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

// Load up to 3 Sliquid label reference images from assets/labels/ (optional)
function getLabelImageParts(): { inlineData: { data: string; mimeType: string } }[] {
  try {
    const dir = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      '../assets/labels'
    )
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir)
      .filter(f => /\.(png|jpg|jpeg)$/i.test(f))
      .slice(0, 3)
      .map(f => ({
        inlineData: {
          data: fs.readFileSync(path.join(dir, f)).toString('base64'),
          mimeType: f.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg',
        },
      }))
  } catch {
    return []
  }
}

const BRAND_BRIEF =
  `You are Lampy, Sliquid's AI product image creator.
Generate professional product photography for Sliquid and Ride Lube intimate wellness products.
Sliquid bottles: elegant, minimalist design with clean typography. Palette: light blues, white, soft naturals.
Ride Lube bottles: bold, modern design with darker accents.
Place products in flattering lifestyle contexts (spa shelves, bathroom counters, bedside tables) with soft professional lighting.
Render realistic, high-quality imagery suitable for retail display.`

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
    const labelParts = getLabelImageParts()

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: [{
        role: 'user',
        parts: [
          ...labelParts,
          { text: `${BRAND_BRIEF}\n\nCreate: ${prompt.trim()}` },
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
