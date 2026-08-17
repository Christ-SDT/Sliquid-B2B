import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { protectedResourceMetadata } from '../middleware/mcpAuth.js'

/**
 * RFC 9728 protected-resource metadata. Mounted at `/.well-known`, so the
 * document is served from `GET /.well-known/oauth-protected-resource`.
 *
 * Public and unauthenticated BY DESIGN: an MCP client discovers where to get a
 * token from here, before it has one. It exposes only config that is already
 * public (the resource URI, the IdP issuer, the scope names) — never secrets.
 */

// Generous — this is a cached discovery document, not an auth attempt.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please slow down.' },
})

export const wellKnownRouter = Router()

wellKnownRouter.get('/oauth-protected-resource', publicLimiter, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(protectedResourceMetadata())
})

/**
 * RFC 9728 §3.1 also allows the resource's path to be appended, e.g.
 * `/.well-known/oauth-protected-resource/mcp`. Some clients probe that form
 * first, so answer it with the same document rather than a 404.
 */
wellKnownRouter.get('/oauth-protected-resource/*', publicLimiter, (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  res.json(protectedResourceMetadata())
})

export default wellKnownRouter
