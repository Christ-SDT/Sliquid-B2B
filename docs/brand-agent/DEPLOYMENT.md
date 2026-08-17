# Sliquid Asset MCP — deployment and security runbook

The MCP server runs **inside the existing portal server** (Railway), mounted at `/mcp`, with
OAuth 2.1 against `sso.sliquid.com`. This document covers standing it up, connecting ChatGPT,
and the checks that must pass before it is shared beyond a pilot.

---

## 1. Why the security design looks like this

The MCP endpoint shares an Express process with the portal API. That process can read
`users.password_hash` and `cert_rewards` shipping addresses. A standalone service would have
made that structurally impossible; running in-process means the isolation has to be enforced by
code instead. Three controls carry that weight:

**Audience binding is the critical one.** The portal's employee SSO and this MCP endpoint both
trust the same issuer. Without an audience check, a portal session token would be a valid MCP
token and vice versa — the classic confused-deputy problem. `requireMcpScope` verifies that
`aud` contains `MCP_RESOURCE_URI` and rejects anything else with a 401. There is a regression
test for exactly this case. **Never merge `requireMcpAuth` into `requireAuth`, and never relax
the audience check.**

**The MCP surface is read-only and narrow.** Three tools, all annotated `readOnlyHint: true`,
`openWorldHint: false`. No write tools, no SQL passthrough, no URL fetching. `src/packshots.ts`
cannot select from `users` or `cert_rewards` at all. This matters because the agent processes
untrusted text: if someone prompt-injects the Brand Agent, the worst it can do through this
endpoint is list and read approved marketing packshots.

Note the SSRF sink next door: `GET /api/media/proxy-download` fetches an arbitrary caller-supplied
URL server-side. It is behind `requireAuth`, so the MCP principal cannot reach it — but do not
copy that pattern into the MCP router, and do not put the MCP principal on a route that can.

**Approval is a human action.** The import script writes every row with `approved = 0`. Nothing
is visible to the agent until an admin toggles it in the portal Media page. The server refuses
to approve a row that is discontinued, or that has a null `sha256` or `asset_key`. Every flip is
stamped with `approved_by` / `approved_at` (migration v57), in both directions — a revoke is as
much a decision as a publish.

### SSO provisioning — fixed, but check your existing rows

`upsertSsoUser` in `src/routes/sso.ts` used to provision **every** new SSO user as tier5 Admin.
That was defensible when tier5 meant "can see internal portal data"; it also came to mean "can
publish brand assets to an external AI agent", with no second signature on the approval switch.

New users are now mapped by `ssoRoleToTier()`: the IdP's coarse `admin` claim → tier5, everything
else (including an absent or unrecognized claim) → **tier1**.

⚠️ **This only affects accounts created from now on.** The existing-user branch deliberately never
changes a role ("SSO promotes, never demotes"), so every employee already provisioned through SSO
is still sitting at tier5 and can still publish packshots. Audit them before sharing past a pilot:

```sql
SELECT id, email, role FROM users WHERE sso_sub IS NOT NULL AND role = 'tier5';
```

Demote the ones who shouldn't be admins via `/users` → Account Type. Still worth deciding
separately whether packshot approval deserves a narrower gate than blanket tier5.

---

## 2. Pre-flight: two things to verify before going live

**S3 objects are currently world-readable.** Media `file_url` values are plain
`https://<bucket>.s3.<region>.amazonaws.com/<key>` URLs — no ACLs, no presigning, no CloudFront
anywhere in the codebase. Anyone with a URL can fetch the bytes without credentials.

This predates the MCP work and the MCP tools return bytes inline rather than URLs, so it is not
introduced here. But it means access control today gates *discovery*, not *access*. Before
treating approval as a real boundary, confirm what the bucket policy actually is. If packshots
should not be publicly fetchable, put them under a prefix with Block Public Access on — the MCP
server reads via the SDK and does not need them public.

**Confirm the ChatGPT workspace tier.** OpenAI's own docs disagree on which plans get full MCP
connector support. Business/Enterprise/Edu get read and write; Pro is documented as read/fetch
only; Plus is unclear. Our tools are all read-only, so read-only support is sufficient — but
verify Developer mode is actually enabled at
**Workspace Settings → Permissions & Roles → Connected Data → Developer mode** before promising
a date.

---

## 3. Register the OAuth client

At `https://sso.sliquid.com` → Admin → Apps, register a client for ChatGPT:

- **Redirect URI** — ChatGPT supplies this during connector setup. It must byte-match.
- **Scope** — add `assets:read`. This is the only scope the MCP tools require.
- **Audience** — the IdP must issue tokens whose `aud` includes the MCP resource URI
  (`https://<portal-server-domain>/mcp`). If the IdP cannot set a per-client audience, that is a
  blocker: without it, audience binding cannot be enforced and the confused-deputy risk is real.
  Resolve this before deploying with `MCP_AUTH_MODE=oauth`.
- Prefer **CIMD**, else **DCR**, else pre-registered `client_id`/`client_secret`. ChatGPT supports
  all three; the MCP spec now marks DCR deprecated in favour of CIMD.

ChatGPT cannot present an API key, a custom header, or a client-credentials grant. OAuth or no
auth are the only real options — see `AGENT-INSTRUCTIONS.md` for the sourcing on this.

---

## 4. Railway environment variables

New:

| Var | Value | Notes |
|---|---|---|
| `MCP_AUTH_MODE` | `oauth` | `none` disables verification. Pilot only, never leave it set. |
| `MCP_RESOURCE_URI` | `https://<server-domain>/mcp` | Must match the `aud` the IdP issues. Scheme required, no fragment. |

Already present and reused: `SSO_ISSUER`, `SSO_JWKS_URL`, `ALLOWED_ORIGINS`, `S3_BUCKET`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `GEMINI_API_KEY`.

`GEMINI_API_KEY` is optional: without it, `create_product_composition` falls back to a solid or
gradient background instead of a generated one, and still composites correctly.

---

## 5. Load the packshots

```bash
cd portal/server
npx tsx scripts/import-packshots.ts --dry-run     # always first
npx tsx scripts/import-packshots.ts --yes
```

Uploads to `packshots/2025/` and inserts 70 `media` rows with `approved = 0`, after re-verifying
every file's SHA-256 against the reviewed catalog. Then approve in the portal Media page →
Packshots.

Five packshots are deliberately **withheld** pending brand-team answers — see
`scripts/README.md`. Four Swirl 2 oz flavors have no matching SKU (the products table carries
Swirl in 4.2 oz only), and `Spark Studio 2025.png` has no matching product row at all. They stay
out of the catalog rather than being served under a guessed identity.

---

## 6. Connect ChatGPT

1. Settings → **Security and login** → enable **Developer mode**.
2. Plugins → **+** → add the MCP endpoint `https://<server-domain>/mcp`.
3. Choose **OAuth**; complete the consent flow.
4. Review the three discovered tools and their annotations.
5. Test in a **new** conversation — tool metadata is cached per conversation.

After changing any tool name, description, or annotation: redeploy, refresh the plugin
connection, and start another new conversation. Stale metadata is the most common cause of
"the agent isn't calling the tool."

Before connecting ChatGPT, sanity-check locally:
`npx @modelcontextprotocol/inspector@latest` against `http://localhost:3001/mcp`.
Inspector *does* render MCP image blocks, so it is the right place to confirm the bytes are
correct — ChatGPT will not show them.

---

## 7. Acceptance tests

| Condition | Expected |
|---|---|
| `Sliquid H2O 4.2 oz` | One active match, then retrieval; sha256 matches the catalog |
| `Sliquid H2O` | Returns 2 oz / 4.2 oz / 8.5 oz and asks — **no silent size choice** |
| `Sliquid H2O 4 oz` | Confirms the person means 4.2 oz rather than assuming |
| `Organics Silk` | Identified as discontinued; no active packshot returned |
| Unknown product | No match; no invented asset, no web substitute |
| Tampered S3 object | Checksum fails, asset withheld, error logged |
| No token | 401 + `WWW-Authenticate` naming the resource metadata URL |
| **Portal session token replayed at `/mcp`** | **401 — wrong audience.** The confused-deputy case |
| Valid token, missing `assets:read` | 403 + `insufficient_scope` |
| Unapproved packshot requested by exact asset_id | Not found — approval gate cannot be bypassed |
| Composition at 4:5, 1:1, 9:16 | Packaging pixel-preserved; no warp, recolor, or redraw |

The last one is the brand-critical check and needs a human eye, not an assertion.

---

## 8. Known limitation to set expectations around

`get_packshot` returns a real image block, but **ChatGPT will not display it and the model cannot
see it** — the connector renders it as `{}`. This is an OpenAI platform issue with no committed
fix, not a bug in this server.

So: the agent identifies assets from text metadata, and all visual output goes through
`create_product_composition`. Anyone who needs the raw file downloads it from the portal Media
page. Set this expectation with the brand team up front — "the agent can't show me the packshot"
will otherwise read as a broken integration.
