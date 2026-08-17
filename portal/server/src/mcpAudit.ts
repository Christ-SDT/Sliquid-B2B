/**
 * Structured audit log for the MCP endpoint.
 *
 * Output goes through `console`, which src/logger.ts has monkey-patched to also
 * fan out into the in-memory SSE buffer behind /api/logs/stream — so an admin can
 * watch MCP activity live without any extra plumbing. One JSON object per line so
 * the buffer stays greppable and machine-parseable.
 *
 * ⚠️ WHAT MUST NEVER APPEAR HERE:
 *   - access tokens, Authorization headers, or any bearer credential
 *   - email addresses (the `principal` subject is the ONLY identifier logged)
 *   - image/asset bytes or base64 payloads — log the sha256 checksum instead
 * `detail` is free text from callers, so it is scrubbed and truncated below
 * rather than trusted. The handoff contract requires: asset id, requesting
 * principal, timestamp, result, checksum.
 */

const DETAIL_MAX = 300

// JWTs (three base64url segments) and anything after a bearer/token/authorization label.
const TOKEN_RE = /\b[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g
const BEARER_RE = /\b(bearer|authorization|token|secret|password)\b[:=\s]+\S+/gi
const EMAIL_RE = /\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g

/** Strip credentials and emails out of caller-supplied free text. */
function scrub(text: string): string {
  const cleaned = text
    .replace(TOKEN_RE, '[redacted-token]')
    .replace(BEARER_RE, '$1 [redacted]')
    .replace(EMAIL_RE, '[redacted-email]')
  return cleaned.length > DETAIL_MAX ? cleaned.slice(0, DETAIL_MAX) + '…' : cleaned
}

export function auditMcp(entry: {
  principal: string
  tool: string
  assetId?: string
  result: 'ok' | 'denied' | 'error'
  detail?: string
  sha256?: string
}): void {
  const line: Record<string, unknown> = {
    ts: new Date().toISOString(),
    principal: entry.principal,
    tool: entry.tool,
    result: entry.result,
  }
  if (entry.assetId !== undefined) line['assetId'] = entry.assetId
  if (entry.sha256 !== undefined) line['sha256'] = entry.sha256
  if (entry.detail !== undefined) line['detail'] = scrub(entry.detail)

  const message = `[mcp-audit] ${JSON.stringify(line)}`

  // Map the result onto the logger's three levels so the admin log stream can
  // colour/filter denials and errors without parsing the JSON body.
  if (entry.result === 'error') console.error(message)
  else if (entry.result === 'denied') console.warn(message)
  else console.log(message)
}
