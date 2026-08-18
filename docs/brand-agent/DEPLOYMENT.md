# Sliquid Asset MCP — deployment and security runbook

The MCP server runs **inside the existing portal server** (Railway), mounted at `/mcp`, as an
OAuth 2.1 resource server trusting the Sliquid IdP at `https://sso-api.sliquid.com`. This document
covers standing it up, connecting ChatGPT, and the checks that must pass before it is shared
beyond a pilot.

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

### ⛔ BLOCKER: the IAM user cannot read from S3

**Verified against production on 2026-08-17.** The IAM user the portal runs as —
`arn:aws:iam::034527724284:user/sliquid-portal-s3` — has `s3:PutObject` but **not `s3:GetObject`
and not `s3:ListBucket`** on `sliquid-ai-creator`:

| Call | Result |
|---|---|
| `PutObject` | ✅ works — all 70 packshots uploaded |
| `HeadObject` | ❌ 403 (surfaces as an unhelpful `UnknownError`) |
| `GetObject` | ❌ 403 `AccessDenied` — *not authorized to perform: s3:GetObject* |
| `ListObjectsV2` | ❌ 403 `AccessDenied` |

`src/mcp/bytes.ts` reads packshot bytes with `GetObjectCommand`, so **`get_packshot` and
`create_product_composition` will fail at runtime until this is granted.** `search_packshots`
is unaffected — it never touches S3.

This also means `--verify-objects` cannot be used, and it explains why the existing
`GET /api/product-shots/:id/download` endpoint (same `GetObjectCommand` pattern) has never
worked. This is a latent pre-existing bug, not something the MCP work introduced.

#### The bucket policy is NOT the lever — do not keep editing it

Follow-up probing on 2026-08-17 narrowed this considerably. The bucket policy already grants
`s3:GetObject` twice over: once to `Principal: "*"` on `sliquid-ai-creator/*`, and once explicitly
to `user/sliquid-portal-s3` on `product-shots/*`. Both are ineffective for this principal:

| Probe (403 = denied, 404 = permitted but key absent) | Result |
|---|---|
| `GetObject packshots/…` | 403 |
| `GetObject product-shots/…` — *explicitly granted in the bucket policy* | **403** |
| `GetObject portal-assets/…` | 403 |
| anonymous HTTPS GET, any prefix | **200** |

`product-shots/*` failing is the conclusive part: a prefix the bucket policy explicitly grants that
user is still denied, while anonymous reads of the same bucket succeed. Anonymous requests are
unaffected by anything attached to an IAM principal, so the cap is **IAM-side** — a permissions
boundary, an explicit `Deny`, or an SCP. Since `PutObject` works, a boundary covering
`PutObject`/`DeleteObject` but not `GetObject` fits without needing any `Deny` at all: a boundary
limits the principal to `boundary ∩ (identity ∪ resource)`, so a public bucket policy cannot reach
past it.

Confirm the principal first — the running container's key id is `AKIAQQCQDIL6EIEFLHDW` (the
non-secret half; paste it into IAM search). Then on that user, in order:

1. **Permissions boundary** — if set, it must include `s3:GetObject`. Primary suspect.
2. **Attached / inline policies** — look for an explicit `Deny` on `s3:GetObject`, or a `NotAction`
   deny that catches it.
3. **SCPs**, if the account belongs to an AWS Organization.
4. Then add `s3:GetObject` (+ `s3:ListBucket` on the bucket ARN **without** `/*`) to the identity
   policy.

Retest immediately — S3 evaluates per request, no deploy needed:

```bash
railway ssh node -e 'const{S3Client,GetObjectCommand}=require("@aws-sdk/client-s3");new S3Client({region:"us-east-2"}).send(new GetObjectCommand({Bucket:"sliquid-ai-creator",Key:"packshots/2025/balance-soak-green-tea.png"})).then(r=>console.log("OK",r.ContentLength)).catch(e=>console.log("FAIL",e.name))'
```

#### Interim: the public-HTTPS fallback in `bytes.ts`

Because the IAM change may be org-gated, `loadPackshotBytes` now falls back to reading the object
over plain HTTPS **when — and only when — the signed call fails with a permission error**. It is
deliberately narrow and loud:

- A 404 `NoSuchKey` or any non-permission error still throws; a missing object stays a clear error.
- The URL is built from `S3_BUCKET` + `AWS_REGION` + `s3_key` — **never** from a DB `file_url`
  column, which would be a server-side request forgery sink. `redirect: 'error'` keeps a redirect
  from moving the fetch off that host.
- `MCP_S3_PUBLIC_FALLBACK=off` disables it and restores hard failure.
- It logs a one-per-process banner naming the IAM remediation.

**The checksum gate is unaffected.** Verification runs on whatever buffer arrives, after the fetch,
so tamper protection is identical on both transports — confirmed against production: three
packshots fetched anonymously hash exactly to their recorded `sha256`. What the stopgap borrows is
only the "we could make this bucket private later" property.

⚠️ **This is a stopgap with a `TODO(iam)` at the top of `src/mcp/bytes.ts`. Delete it once
`s3:GetObject` is granted** — leaving it in place makes retrieval permanently dependent on the
bucket staying public, and buries the misconfiguration instead of surfacing it.

### S3 objects are currently world-readable

Media `file_url` values are plain `https://<bucket>.s3.<region>.amazonaws.com/<key>` URLs — no
ACLs, no presigning, no CloudFront anywhere in the codebase. Confirmed live: the uploaded
packshots return `200` to an anonymous `curl`. So the bucket is readable by anyone with a URL
even though the *IAM user* cannot read it — reads happen over public HTTP, writes over IAM.

This predates the MCP work, and the MCP tools return bytes inline rather than URLs, so nothing
here makes it worse. But it means access control today gates *discovery*, not *access*, and
"approved" is not a real boundary on the bytes. If packshots should not be publicly fetchable,
put them under a prefix with Block Public Access on — which makes the `s3:GetObject` grant above
mandatory rather than merely correct.

**Confirm the ChatGPT workspace tier.** OpenAI's own docs disagree on which plans get full MCP
connector support. Business/Enterprise/Edu get read and write; Pro is documented as read/fetch
only; Plus is unclear. Our tools are all read-only, so read-only support is sufficient — but
verify Developer mode is actually enabled at
**Workspace Settings → Permissions & Roles → Connected Data → Developer mode** before promising
a date.

---

## 3. Register the OAuth client

The IdP lives in a **separate repo** — `~/Desktop/sliquid-sso` (`Christ-SDT/Sliquid-SSO-Portal`).
Audience pinning and the `assets:read` scope were added there in `53d8ec9`. MCP work routinely
spans both repos; the portal alone is never the whole picture.

**Two hosts, easy to confuse:**

| | |
|---|---|
| `https://sso-api.sliquid.com` | The **issuer**. Serves `/oauth2/*` and `/.well-known/openid-configuration`. This is `SSO_ISSUER`. |
| `https://sso.sliquid.com` | The **admin UI** (React SPA). Where you register clients. Not the issuer. |

The production `OIDC_ISSUER` value is a Railway env var and isn't committed anywhere, so confirm
it before relying on it:

```bash
curl -s https://sso-api.sliquid.com/.well-known/openid-configuration | jq '{issuer, jwks_uri, scopes_supported}'
```

### Register at `https://sso.sliquid.com/admin/apps`

| Field | Value | Notes |
|---|---|---|
| **Name** | e.g. `ChatGPT Brand Agent` | The `client_id` is **generated** from this (`slug-XXXX`). You cannot choose it. |
| **Redirect URIs** | `https://chatgpt.com/connector_platform_oauth_redirect` | See the redirect-URI note below — you may need to add a second one. |
| **Scopes** | ✅ `openid` **and** ✅ `assets:read` | `openid` is locked on. **`assets:read` must be ticked explicitly.** |
| **Audience** | `https://sliquid-b2b-production.up.railway.app/mcp` | Must equal `MCP_RESOURCE_URI` byte for byte. |
| **Confidential** | **no** — `token_endpoint_auth_method: none` | See below. |

### Register it as a PUBLIC client, not confidential

**Confirmed working 2026-08-18** with `chatgpt-brand-agent-9eva4g`: public, no secret,
`token_endpoint_auth_method: none`, scopes `openid assets:read`, audience byte-exact.

Choose public **because of PKCE**, not because a secret is impossible. An earlier version of this
document claimed ChatGPT's form has no secret field — it does: an **OAuth Client Secret
(Optional)** input, plus a **Token endpoint auth method** selector. Leave the secret empty and set
that selector to `none`.

Public is safe here because the IdP enforces **PKCE S256 unconditionally**, on public and
confidential clients alike, so an intercepted auth code cannot be redeemed without the verifier. A
secret would add nothing a browser-delivered client can actually keep secret, and adds one more
credential to rotate.

Keep the scope list minimal — `openid` (required by the IdP, see below) and `assets:read`. The
working client deliberately does **not** carry `profile` or `email`; the MCP endpoint reads neither.

### The redirect URI is a moving target

There is **no single documented value**, and OpenAI is mid-migration between two shapes:

| Value | Status |
|---|---|
| `https://chatgpt.com/connector_platform_oauth_redirect` | Legacy but still supported and still what most integrations register. Start here. |
| `https://chatgpt.com/connector/oauth/{callback_id}` | Current, and **per-connector** — the id does not exist until the connector does. |

Because this IdP has no DCR, expect a one-time chicken-and-egg. What actually worked:

1. Pre-register the legacy fixed URI above.
2. Start creating the connector in ChatGPT and read the **per-connector callback** off the screen —
   it looks like `https://chatgpt.com/connector/oauth/7x7MfTHT93nO`.
3. Add that verbatim **alongside** the legacy one (the working client carries both), then re-run
   the OAuth connect.

⚠️ Do **not** put ChatGPT's agent *trigger* URL in this field. A
`https://api.chatgpt.com/v1/workspace_agents/<agent-id>/trigger` URL is the endpoint you POST to in
order to invoke the agent — it is not an OAuth callback, and registering it fails the authorize step
with a redirect_uri mismatch. The first attempt at this client did exactly that.

Matching is exact — protocol, host, path, trailing slash. Ignore
`https://chatgpt.com/backend-api/aip/connectors/links/oauth/callback` if you see it in an error
trace; it is an internal hop, not a redirect URI to register. Do **not** register the GPT Actions
form (`.../aip/{g-id}/oauth/callback`) — that is a different product surface.

Register a **new** client rather than reusing the seeded `marketing-portal` one — that row has
neither `assets:read` nor an audience, and it needs different redirect URIs anyway.

### Two silent failure modes to know about

⚠️ **An ungranted or unrecognized scope is dropped with no error.** The IdP's `parseScopes` /
`effectiveScopes` filter silently; authorize still succeeds and a token is minted *without*
`assets:read`. Every MCP call then 403s `insufficient_scope`, and nothing is logged on the IdP
side. If you see that 403, inspect the `scope` value in the token response before debugging the
resource server.

⚠️ **ChatGPT reports DCR and CIMD as unavailable — both are cosmetic.** Its UI says "DCR is
unavailable until a Registration URL is present" and "CIMD is unavailable because the server did not
advertise CIMD support". Neither blocks anything: the pasted `client_id` path is what this IdP
supports, and it completed the OAuth round trip. No `registration_endpoint` work is needed.

⚠️ **A blank `audience` falls back to the client id.** `accessTokenAudience()` returns the pinned
value if set, else `client.clientId`. Leaving the field empty means every token is rejected here —
correctly, but the error gives no hint why.

### What this IdP does not support

- **No Dynamic Client Registration and no CIMD** — explicitly out of scope for v1, and no
  `registration_endpoint` in discovery. Pre-registered `client_id`/`client_secret` is the only path.
  (An earlier draft of this doc said to prefer CIMD then DCR. Neither exists here.)
- **No `resource` parameter (RFC 8707).** Deliberate: the audience is pinned per client because
  ChatGPT's connector may not send `resource`. Sending it is harmless but has no effect.
- **No `client_credentials` grant.** Every token is user-bound through the browser auth-code flow,
  so an MCP call is always attributable to a person who consented.
- **No `/.well-known/oauth-authorization-server`** — only `openid-configuration`. Clients must fall
  back to OIDC Discovery for AS metadata.
- **No token introspection, and access tokens cannot be revoked.** Only refresh tokens are
  revocable, so cutting off access takes up to one access-token TTL (**10 minutes** by default).
  To cut it off immediately, unapprove the packshots or set `MCP_AUTH_MODE` away from `oauth`.

PKCE **S256 is mandatory** for every client including confidential ones, `response_type` is `code`
only, and grants are `authorization_code` + `refresh_token`.

ChatGPT cannot present an API key, a custom header, or a client-credentials grant. OAuth or no
auth are the only real options — see `AGENT-INSTRUCTIONS.md` for the sourcing on this.

---

## 4. Railway environment variables

> **Status: set and verified live on 2026-08-17.** Railway project `sliquid-hq-b2b`, service
> `Sliquid-B2B`, environment `production`. Verified against the deployed endpoint:
> `/.well-known/oauth-protected-resource` returns the correct document, and an unauthenticated
> `POST /mcp` returns 401 with a `WWW-Authenticate` challenge naming the metadata URL and
> `scope="assets:read"`. The IdP's live discovery document confirms `issuer` and that
> `assets:read` is in `scopes_supported`.
>
> Note `GET /mcp` returns **401, not 405**, when unauthenticated — auth runs before method
> dispatch, so an anonymous caller learns nothing about the endpoint. 405 is what an
> authenticated GET gets.

New:

| Var | Value | Notes |
|---|---|---|
| `MCP_AUTH_MODE` | `oauth` | `none` disables verification. Pilot only, never leave it set. Any other or missing value fails closed to `oauth`. |
| `MCP_RESOURCE_URI` | `https://<server-domain>/mcp` | Must equal the client's `audience` byte for byte. Valid URL, no fragment. |
| `MCP_SCOPES_SUPPORTED` | `openid assets:read` | Optional; this is the default. Both are needed — see §3. |

Verify against the two SSO vars that already exist:

| Var | Expected |
|---|---|
| `SSO_ISSUER` | `https://sso-api.sliquid.com` — the API origin, **not** `sso.sliquid.com` |
| `SSO_JWKS_URL` | `https://sso-api.sliquid.com/oauth2/jwks` |

Both must be set whenever `MCP_AUTH_MODE=oauth`, or `/mcp` returns **503**. That is deliberate:
serving traffic with no audience to bind against is exactly the replay condition the audience check
exists to prevent, so it fails closed rather than passing requests through.

Also present and reused: `ALLOWED_ORIGINS`, `S3_BUCKET`, `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `GEMINI_API_KEY`.

Note the IdP applies a global **300 req/min** rate limit covering its token endpoint and JWKS; the
MCP router adds its own 60/min.

`GEMINI_API_KEY` is optional: without it, `create_product_composition` falls back to a solid or
gradient background instead of a generated one, and still composites correctly.

---

## 5. Load the packshots

The import needs three things that never exist in one place:

| Needs | Only available |
|---|---|
| the 75 PNG masters | **locally** — 52 MB, gitignored, never committed |
| S3 credentials | Railway env (obtainable locally via `railway run`) |
| the SQLite DB | **on Railway** — `DB_PATH=/data/portal.db`, a mounted volume with no network access |

So the run is **split into two phases**, and the implementation lives at
`portal/server/src/scripts/importPackshots.ts` — under `src/` so `tsc` compiles it to
`dist/scripts/importPackshots.js` and it runs on plain `node` inside the container. (A file under
`scripts/` cannot run there at all: the `Dockerfile` copies only `src`, and
`npm prune --omit=dev` strips `tsx`.) The catalog rides along at
`src/assets/packshot-catalog.json`, which the existing `cp -r src/assets dist/` already ships.

```bash
cd portal/server

# phase 1 — locally, production S3 creds injected, the DB is never opened
railway run npx tsx src/scripts/importPackshots.ts --upload-only --dry-run
railway run npx tsx src/scripts/importPackshots.ts --upload-only --yes

# phase 2 — inside the container, where the volume DB lives
railway ssh node dist/scripts/importPackshots.js --db-only --verify-objects --yes
```

`--verify-objects` `HeadObject`s all 70 keys before writing anything, so a `media` row can never
point at an object phase 1 failed to upload — the two phases run on different machines and that is
otherwise unknowable.

Locally, against a local DB, pass neither phase flag and both run back to back:

```bash
npx tsx src/scripts/importPackshots.ts --dry-run     # always first
npx tsx src/scripts/importPackshots.ts --yes
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
| Token response after consent | `scope` actually contains `assets:read` — the IdP drops it silently if the client wasn't granted it |
| `MCP_RESOURCE_URI` unset | 503, not a pass-through |
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
