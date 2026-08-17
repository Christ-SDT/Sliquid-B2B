# Sliquid B2B

## Project Overview
B2B partner portal for Sliquid. Repository: https://github.com/Christ-SDT/Sliquid-B2B.git

The project has two top-level parts:
- **Main marketing site** — React/Vite/TypeScript at the repo root (Cloudflare Pages)
- **Partner portal** — full-stack app inside `portal/` (client + server)

### Main Site — Key Assets
- **Hero/header image:** referenced via `IMG_HERO` in `src/utils/constants.ts`, currently `public/images/semi-finalv2-sliquidb2b.png`. Used as the full-width background in `HeroSection.tsx`.
- Static images live in `public/images/` (served at `/images/filename`).

---

## Architecture

### Portal Client (`portal/client/`)
- **Framework:** React 18 + Vite + TypeScript
- **Styling:** Tailwind CSS with custom design tokens (`bg-surface`, `bg-portal-bg`, `bg-surface-elevated`, `border-portal-border`, `text-portal-accent`)
- **Routing:** React Router v6 (`BrowserRouter` → `Shell` layout → nested routes)
- **Auth:** JWT stored in `localStorage` as `portal_token`; `AuthContext` provides `user`, `login`, `register`, `logout`
- **API client:** `portal/client/src/api/client.ts` — `api.get`, `api.post`, `api.put`, `api.delete`; reads `VITE_API_URL` env var
- **Icons:** `lucide-react`
- **Deployment:** Cloudflare Pages — root dir `portal/client`, build cmd `npm install && npm run build`, output `dist`

### Portal Server (`portal/server/`)
- **Framework:** Node.js + Express + TypeScript
- **Database:** `better-sqlite3` SQLite (single file at `DB_PATH`, default `./data/portal.db`)
- **Auth:** `bcryptjs` for password hashing, `jsonwebtoken` for JWT (7-day expiry)
- **Email:** `@emailjs/nodejs` via `portal/server/src/email.ts`; gracefully skips if `EMAILJS_PUBLIC_KEY` / `EMAILJS_PRIVATE_KEY` / `EMAILJS_SERVICE_ID` not set
- **Deployment:** Railway via `portal/server/Dockerfile` (node:22-slim + python3/make/g++ for native modules)

### Key File Paths
| Path | Purpose |
|---|---|
| `portal/client/src/App.tsx` | Route definitions |
| `portal/client/src/context/AuthContext.tsx` | Auth state + login/register/logout |
| `portal/client/src/api/client.ts` | API client (`api.get/post/put/delete`) |
| `portal/client/src/types/index.ts` | Shared TS types, `TIER_LABEL`, `isLimitedTier()`, `isProspect()`, `isAdmin()` |
| `portal/client/src/components/layout/Shell.tsx` | Auth guard + route restriction enforcement |
| `portal/client/src/components/layout/Sidebar.tsx` | Navigation with role-based filtering (`managerOnly`, `prospectVisible`, `adminOnly` flags) |
| `portal/client/src/components/CertificateGenerator.tsx` | PDF certificate download component (uses `@react-pdf/renderer`) |
| `portal/client/src/components/CertRewardForm.tsx` | Pre-certificate reward form (product choice, shirt size, shipping address) — shown once before certificate |
| `portal/client/public/fonts/Poppins-Light.ttf` | Poppins weight 300 — registered for `@react-pdf/renderer` PDF top bar |
| `portal/client/public/fonts/Poppins-Regular.ttf` | Poppins weight 400 — registered for `@react-pdf/renderer` PDF top bar tagline |
| `portal/client/public/downloads/badge.png` | Gold badge image rendered in certificate PDF (must be placed here manually) |
| `portal/client/src/quizzes/index.ts` | Quiz registry |
| `portal/client/public/training/<id>/index.html` | SCORM packages |
| `portal/client/src/pages/AssetsPage.tsx` | Merged "Product Library" with file-explorer UX: collapsible brand sections → section pills → clickable preview strip → FileExplorerModal → FileDetailModal (download only here); admin add/edit/delete |
| `portal/client/src/pages/RetailerPage.tsx` | "Request Physical Marketing Assets" — catalog + request form for Counter Cards, Banner, Neon Signs |
| `portal/client/src/pages/StoreUsersPage.tsx` | "My Store" page for tier2 — read-only member list with quiz stats |
| `portal/client/src/pages/CertificateVerify.tsx` | Public `/verify` page — search form to verify a cert number |
| `portal/client/src/context/NotificationContext.tsx` | Notification state — polls `/api/notifications` every 60s; provides `markRead`, `markAllRead` |
| `portal/server/src/notifications.ts` | `notifyAdmins` / `notifyUsers` / `notifyEveryone` / `notifyUserIds` / `notifyUser` |
| `portal/server/src/routes/notifications.ts` | GET `/`, PUT `/read-all`, PUT `/:id/read` |
| `portal/server/src/routes/certificates.ts` | GET `/mine` (auth) + GET `/verify/:certNumber` (public) |
| `portal/server/src/app.ts` | Express app, CORS/`PUBLIC_PATHS`, **all route mounting**; exports `app` (tests import this) |
| `portal/server/src/index.ts` | `app.listen` + background intervals ONLY — excluded from coverage, so no logic belongs here |
| `portal/server/src/database.ts` | DB init, migrations, seed |
| `portal/server/src/middleware/auth.ts` | `requireAuth` + `requireRole(...roles)` |
| `portal/server/src/email.ts` | EmailJS email sender (`@emailjs/nodejs`) |
| `portal/server/src/woocommerce.ts` | WooCommerceService class + `runWooSync()` |
| `portal/server/src/routes/woo.ts` | WooCommerce API routes |
| `portal/server/src/routes/stores.ts` | Public GET /api/stores + admin POST/DELETE |
| `portal/server/src/routes/store.ts` | GET /api/store/members — tier2 sees own company; admin sees all |

---

## Development Setup

### Portal Client
```bash
cd portal/client
npm install
npm run dev        # http://localhost:5173
```

### Portal Server
```bash
cd portal/server
npm install
npm run dev        # http://localhost:3001
```

Create `portal/server/.env` for local development:
```
JWT_SECRET=any-local-secret
DB_PATH=./data/portal.db
# Optional — skip for no email (EmailJS)
EMAILJS_PUBLIC_KEY=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key
EMAILJS_SERVICE_ID=your_service_id
# Optional — override portal URL used in email links (default: https://sliquid-portal.pages.dev)
PORTAL_URL=https://your-portal-url.pages.dev
# Optional — Announcements / WordPress press-release sync. All optional: the sync
# falls back to sliquid.com + category 245 + cutoff 2025-01-01, so it works unset.
# Can also be set at runtime from /admin/announcements (stored in woo_settings).
WP_BASE_URL=https://sliquid.com
WP_ANNOUNCEMENTS_CATEGORY_ID=245
WP_ANNOUNCEMENTS_CUTOFF=2025-01-01
# Only needed to sync posts not yet published in WordPress (draft/pending/future)
# WP_APP_USER=
# WP_APP_PASSWORD=

# Optional — override WooCommerce credentials (env takes precedence over DB settings)
WC_URL=https://your-store.com
WC_CONSUMER_KEY=ck_xxx
WC_CONSUMER_SECRET=cs_xxx

# Optional — Employee SSO (OIDC). Omit/leave SSO_ENABLED unset to disable the /employee-login flow.
SSO_ENABLED=true
SSO_ISSUER=http://localhost:4000
SSO_AUTHORIZE_URL=http://localhost:4000/oauth2/authorize
SSO_TOKEN_URL=http://localhost:4000/oauth2/token
SSO_JWKS_URL=http://localhost:4000/oauth2/jwks
SSO_CLIENT_ID=partner-portal
SSO_CLIENT_SECRET=your_client_secret
SSO_REDIRECT_URI=http://localhost:3001/auth/google/callback
SSO_SCOPE=openid profile email
SSO_SUCCESS_REDIRECT=http://localhost:5173
```

Create `portal/client/.env.local`:
```
VITE_API_URL=http://localhost:3001
```

---

## Commands

| Command | What it does |
|---|---|
| `cd portal/client && npm run dev` | Start client dev server (port 5173) |
| `cd portal/server && npm run dev` | Start server dev server (port 3001) |
| `cd portal/client && npm run build` | Production build |
| `cd portal/client && npx tsc --noEmit` | TypeScript check (client) |
| `cd portal/server && npx tsc --noEmit` | TypeScript check (server) |
| `cd portal/server && npm test` | Run all server tests (vitest + supertest) |

---

## Role / Tier System

### Roles
| Role | Label | Badge Color | Description |
|---|---|---|---|
| `tier1` | Retail Store Employee | Slate gray | Restricted access (product library, distributors, trainings) |
| `tier2` | Retail Management | Emerald green | Restricted access + can view their store's users (`/store-users`) |
| `tier3` | Distributor | Cyan | Restricted access (product library, distributors, trainings) |
| `tier4` | Prospect | Orange | Prospect access (distributors, trainings, become a retailer only) |
| `tier5` | Admin | Violet | Full unrestricted access |
| `tier6` | Medical Partner | — | Restricted access (same set as tier1) |
| `tier7` | Media | — | Restricted access (routed to the tier2 allow-list) |

`isLimitedTier(role)` in `types/index.ts` returns `true` for tier1/2/3/**6/7**.
`isProspect(role)` returns `true` for tier4. `isAdmin(role)` returns `true` for tier5 or 'admin'.

**Role badge colors** — defined in `roleBadgeClass()` in `UsersPage.tsx`. Uses solid filled Tailwind classes (e.g. `bg-violet-600 text-white`) for strong readability. Do not revert to transparent/muted variants.

**Backward-compat note:** `Sidebar.tsx` checks `role === 'tier5' || role === 'admin'` so legacy `admin` DB rows still get full admin access without migration.

**Server backward-compat:** `requireRole('tier5', 'admin')` is used for all admin-only endpoints. Never remove `'admin'` from these calls.

### Shell.tsx Access Control Lists
```ts
const TIER1_ALLOWED    = ['/dashboard', '/announcements', '/assets', '/distributors', '/trainings', '/quiz', '/store-users', '/creator']
const TIER2_ALLOWED    = [...TIER1_ALLOWED, '/retailer']
const TIER3_ALLOWED    = TIER1_ALLOWED.filter(p => p !== '/distributors').concat('/retailer')
const TIER6_ALLOWED    = TIER1_ALLOWED
const PROSPECT_ALLOWED = ['/dashboard', '/announcements']
const PENDING_ALLOWED  = ['/dashboard', '/announcements']  // status = 'pending'
```
There is **no** `RESTRICTED_ALLOWED` — the arrays are `TIER1_ALLOWED` / `TIER2_ALLOWED` /
`TIER3_ALLOWED` / `TIER6_ALLOWED` / `PROSPECT_ALLOWED` / `PENDING_ALLOWED`. tier7 falls
through to `TIER2_ALLOWED`; tier5/admin is unguarded.

⚠️ Matching is `pathname.startsWith(p)`, i.e. a **prefix** match. `'/announcements'` therefore
also grants `/announcements/:slug` — which is intended — but it means a sibling route named
`/announcements-admin` would be silently granted to restricted tiers. That is why the admin
page lives at `/admin/announcements`.

⚠️ `Sidebar.tsx`'s `prospectVisible` flag is **dead code**: the `isPending || isProspectRole`
branch short-circuits before any row flag is read. Do not "fix" it by honouring the flag —
three rows carry `prospectVisible: true` that `PROSPECT_ALLOWED` immediately bounces, so you
would render nav links that redirect on click.

### Sidebar NAV Flags
Every NAV entry carries **every** key — the array is untyped, so a row missing one produces a
TS error on access. Keys: `restricted`, `tier23`, `prospectVisible`, `managerOnly`, `adminOnly`,
`medicalOnly`, `hideTier3`, `badgeType`.
- `adminOnly: true` → only tier5/admin sees it
- `medicalOnly: true` → admin only (despite the name)
- `managerOnly: true` → tier2 or admin (currently `false` on every row)
- `tier23: true` → tier2/tier3/tier7
- `hideTier3: true` → hidden from tier3
- `restricted: true` → tier1/2/3/6/7 see it
- `prospectVisible` → **dead code**, see the warning above
- `badgeType` → notification `type` whose unread count renders as a pill (`countUnreadByType`)

### Access Matrix
| Route | tier1 | tier2 | tier3 | tier4 (Prospect) | tier5 (Admin) |
|---|---|---|---|---|---|
| `/dashboard` | ✓ (mini) | ✓ (mini) | ✓ (mini) | ✓ (mini) | ✓ (full stats) |
| `/announcements` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/announcements/:slug` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/admin/announcements` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/assets` (Product Library) | ✓ | ✓ | ✓ | ✗ | ✓ |
| `/distributors` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/trainings` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/quiz/:id` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `/store-users` (My Store) | ✗ | ✓ | ✗ | ✗ | ✓ |
| `/retailer` | ✗ | ✗ | ✗ | ✓ | ✓ |
| `/products` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/inventory` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/invoices` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/stats` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/users` | ✗ | ✗ | ✗ | ✗ | ✓ |
| `/verify` | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) |
| `/employee-login` | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) |

`/verify` and `/employee-login` are outside `<Shell>` — no auth required, accessible to anyone. `/employee-login` is the Sliquid-staff SSO entry point; staff land on the tier derived by `ssoRoleToTier()` — tier5 for an IdP `admin`, tier1 otherwise.

Restricted tiers redirected to `/dashboard` for any disallowed route (enforced in `Shell.tsx`).

### Self-Registration
`POST /api/auth/register` accepts an optional `role` field. Valid values: `tier1`, `tier2`, `tier3`, `tier4` (Prospect). Defaults to `tier1`. `tier5` cannot be self-registered.

The `company` field on registration is populated via an **incremental search combobox** backed by `GET /api/stores` (public endpoint, no auth required). Typing filters the list in real-time; selecting commits the value to a hidden input for form validation. If no stores exist, falls back to a free-text input — so a brand-new company name can still be typed in.

**`stores` table growth:** New registrations start at `status = 'pending'` and do **not** add their typed company to `stores` immediately (avoids polluting the dropdown with unapproved/typo'd entries). The company is only added (`INSERT OR IGNORE`) when an admin approves the user via `POST /api/admin/users/:id/approve` — see [Admin API](#admin--apiadmin). Declined users' companies are never added.

**Requested Role hint:** Both registration forms (Portal `RegisterPage.tsx` and the main B2B site's `RegisterPage.tsx`) also show an optional, non-required pair of checkboxes — "Retail Store Employee" / "Retail Management" — that behave like a radio (checking one clears the other; either can be cleared back to no answer). The selection is sent as `requested_role` (`'tier1'` | `'tier2'` | omitted) on `POST /api/auth/register` and stored on the `users` row (migration v53). It does **not** affect the role actually granted — it's purely a hint surfaced in **Partner Requests** (`RequestsPage.tsx`) so admins know what tier to approve the person into; the Assign Role dropdown pre-selects it by default, but admins can still override before approving.

---

## Database Migrations

Managed in `portal/server/src/database.ts`. Rules:
- **Never drop or rename existing columns** — only add new ones
- Add a new `{ version, name, up }` object to the `migrations` array
- Versions must be unique and increasing
- An automatic backup is created before any pending migrations run

### Current Migrations
| Version | Name | Description |
|---|---|---|
| 1 | `initial_tables` | users, products, assets, distributors, invoices, inventory, retailer_applications, creatives |
| 2 | `products_extended_columns` | Adds vendor_number, upc, unit_size, case_pack, case_cost, unit_msrp, case_weight, unit_dimensions, case_dimensions |
| 3 | `quiz_results` | Adds quiz_results table (user_id, quiz_id, score, passed, completed_at) |
| 4 | `rename_roles_to_tier_system` | Renames admin→tier4, partner→tier2, distributor→tier3 |
| 5 | `woocommerce_tables` | Adds woo_settings (key/value credential store) and woo_sync_log (pull/push audit log) |
| 6 | `add_prospect_tier` | Renames existing tier4→tier5; inserts `prospect@demo.com` (tier4) if not exists |
| 7 | `stores_table` | Creates `stores` table; seeds from distinct existing user companies; ensures 'Demo Retail Store' exists |
| 8 | `marketing_request_fields` | Adds `requested_items TEXT` and `request_notes TEXT` to `retailer_applications` |
| 9 | `notifications_table` | Creates `notifications` table: `user_id, type, title, message, link, read (0/1), created_at`; index on `user_id` |
| 10 | `marketing_items_table` | Creates `marketing_items` table; seeds Counter Cards, Retractable Banner, Sliquid Neon Sign, Ride Lube Neon Sign |
| 11 | `trainings_table` | Creates `trainings` table; seeds H2O vs Sassy and Sea vs Tsunami entries |
| 12 | `add_satin_swirl_silver_trainings` | Seeds Satin, Swirl, Silver vs Silk training entries |
| 13 | `certificates_table` | Creates `certificates` table (certificate_number, user_id, issued_to, completion_date, is_valid); indexes on user_id and certificate_number |
| 14 | `add_last_login` | Adds `last_login TEXT` column to `users` table; stamped on every successful login |
| 15 | `add_sizzle_splash_soul_soak_soothe_trainings` | Seeds Sizzle vs Spark, Splash, Soul, Soak, Soothe training entries (sort_order 5–9) |
| 16 | `cert_rewards_table` | Creates `cert_rewards` table (user_id UNIQUE, full_name, product, shirt_size, address1, address2, city, state, zip, submitted_at); index on user_id |
| 17 | `add_ogel_training` | Seeds O Gel training entry with YouTube video `https://youtu.be/NlxXiAIs7C0` (sort_order 100) |
| 18 | `rename_sizzle_vs_sparks_to_spark` | Updates `sizzle-vs-sparks` title from "Sizzle vs Sparks" → "Sizzle vs Spark" in trainings table |
| 19 | `replace_distributors` | Adds `notes TEXT` column; deletes all old fake distributors; seeds 13 real distributors. `region` = filter category (US/Canada/UK/Mexico/US, Canada); `state` = display locations (CO, MI, AZ etc.) |
| 20 | `remove_body_spa_and_secret_amor` | Deletes Body Spa and Secret Amor (Secreto Amor MX) distributor rows |
| 28 | `update_training_video_urls` | Updates video_path for h2o-vs-sassy, sea-vs-tsunami, silver-vs-silk, satin, swirl |
| 34 | `add_featured_to_assets_and_creatives` | Adds `featured INTEGER NOT NULL DEFAULT 0` to `assets` and `creatives` tables |
| 35 | `add_password_reset_tokens` | Adds `reset_token TEXT` and `reset_token_expires TEXT` to `users` table |
| 50 | `add_sso_sub` | Adds `sso_sub TEXT` to `users` table — links a portal user to their Sliquid SSO subject (`sub`) |
| 51 | `remove_demo_test_stores` | Deletes `Demo Distribution LLC`, `Demo Retail Co.`, `Demo Retail Store`, `Prospect Co.` from the `stores` table — test data cleanup |
| 52 | `backfill_approved_user_stores` | Inserts (`INSERT OR IGNORE`) the distinct `company` of every `status = 'active'` user into the `stores` table — one-time backfill so previously-approved companies appear in the registration dropdown |
| 53 | `add_requested_role_to_users` | Adds `requested_role TEXT` to `users` table — optional self-identified role hint (`tier1`/`tier2`/`NULL`) captured at registration |
| 54 | `hp_applications_table` | Creates `hp_applications` table (`id`, `practice_name`, `contact_name`, `email`, `created_at`) — one row per Health Practitioner application, backs the sequential `SHP-XXXX` reference number |
| 55 | `announcements_tables` | Creates `announcements` (WordPress press releases + portal-authored announcements) and `announcement_sync_log`. See [Announcements](#announcements--press-releases) |

| 56 | `packshot_catalog_columns` | Adds `sku`, `unit_size`, `package_version`, `packshot_status`, `approved`, `sha256`, `asset_key` to `media`; partial UNIQUE index on `asset_key`, index on `(approved, packshot_status)`. Backs the MCP packshot catalog — see [Asset MCP Server](#asset-mcp-server--chatgpt-brand-agent) |
| 57 | `packshot_approval_audit` | Adds `approved_by`, `approved_at` to `media` — records who published an asset to the external ChatGPT agent, and when |

**Next migration version: 58**

### Seed Users (new DB only)
| Email | Password | Role |
|---|---|---|
| admin@sliquid.com | admin123 | tier5 (Admin) |
| partner@demo.com | partner123 | tier2 (Retail Management) |
| distributor@demo.com | dist123 | tier3 (Distributor) |
| prospect@demo.com | prospect123 | tier4 (Prospect) |

---

## API Routes

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/login` | — | Returns `{ token, user }`; stamps `last_login` on the user row |
| POST | `/register` | — | Accepts `name, email, company, password, role` |
| GET | `/me` | requireAuth | Returns current user |
| POST | `/forgot-password` | — | Accepts `email`; generates reset token (1hr expiry); sends `portal_password_reset` email; always returns `{ ok: true }` (no enumeration) |
| POST | `/reset-password` | — | Accepts `token, password`; validates token + expiry; updates password hash; clears token fields |

### Employee SSO — `/auth/google` (OIDC Auth Code + PKCE against Sliquid SSO IdP)
Mounted at the app root (NOT under `/api`) so the OIDC callback is `/auth/google/callback`. The `ssoRouter` lives in `routes/sso.ts`; the `sso_tx` cookie path is `/auth/google`.
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/google/login` | — | Starts the OIDC flow: generates PKCE verifier+state, stashes them in a 5-min signed `sso_tx` httpOnly cookie, 302-redirects to `SSO_AUTHORIZE_URL`. Returns 503 if `SSO_ENABLED !== 'true'` or config missing |
| GET | `/auth/google/callback` | — | Verifies `state` cookie, exchanges `code` at `SSO_TOKEN_URL` (HTTP Basic, `code_verifier`), verifies `id_token` (RS256 via JWKS, checks `iss`/`aud`/`exp`), find-or-creates user (`upsertSsoUser`), mints portal JWT, 302 → `${SSO_SUCCESS_REDIRECT}/dashboard#token=<jwt>`. On error → `/employee-login?sso_error=<reason>` |

- `upsertSsoUser` (`routes/sso.ts`): new users → `status='active'`, `company='Sliquid'`, unusable password hash, `sso_sub` set, and a role from **`ssoRoleToTier(claims.role)`** — the IdP's coarse `admin` claim → `tier5`, everything else → `tier1`. Existing users keep their current role (never downgrade), get reactivated + `sso_sub` linked.
- **Which SSO roles become tier5:** the IdP emits only `admin` | `employee` (via `externalRole()`), and `admin` covers the three roles in its `ADMIN_ROLES` set — **`sliquid_super_admin`, `sliquid_owner`, `sliquid_development`**. The other six (`sliquid_employee`, `sliquid_sales`, `sliquid_marketing`, `sliquid_warehouse_manager`, `sliquid_accounting`, `sliquid_unknown`) emit `employee` → tier1. Nine IdP roles total; check `packages/shared/src/roles.ts` in the `sliquid-sso` repo rather than trusting a summary, since that set has grown before.
  ⚠️ `ssoRoleToTier` defaults to **tier1** for an absent or unrecognized claim, on purpose: it runs before any human has reviewed the account, so an unknown role must grant the least access. Do not floor everyone at tier5 for convenience — that was the original behaviour and it silently made every Sliquid employee an admin, which now also means "can publish brand assets to the external ChatGPT agent". Tests cover the fallback.
  ⚠️ Because the existing-user branch never changes a role, accounts provisioned **before** this fix are still tier5. Audit with `SELECT id, email, role FROM users WHERE sso_sub IS NOT NULL AND role = 'tier5'`.
- Client entry point: dedicated `/employee-login` page (`EmployeeLoginPage.tsx`), linked from `LoginPage.tsx` (portal) and the B2B `PartnerLoginPage.tsx` ("Sliquid Employee Sign In" button → `${PORTAL_URL}/employee-login`). The button hits `${VITE_API_URL}/auth/google/login`. The post-login session arrives via the existing `#token=` hash handler in `AuthContext.tsx`.

### Products — `/api/products`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List products (filters: brand, category, search) |
| GET | `/export` | requireAuth | Download all products as CSV (registered before `/:id`) |
| GET | `/:id` | requireAuth | Get single product |
| POST | `/` | tier5/admin only | Create product |
| POST | `/import` | tier5/admin only | Upsert products by SKU from `{ rows }` array; returns `{ inserted, updated, errors }` |

### Assets — `/api/assets`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List assets (filters: brand, type, search) |
| GET | `/:id` | requireAuth | Get single asset |
| POST | `/` | tier5/admin only | Create asset; triggers `notifyUsers('new_asset', ...)` to all non-admin users |
| PUT | `/:id` | tier5/admin only | Update asset fields |
| DELETE | `/:id` | tier5/admin only | Delete asset |

### Distributors — `/api/distributors`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List distributors (filters: state, region, search) |
| GET | `/:id` | requireAuth | Get single distributor |
| POST | `/` | tier5/admin only | Create distributor; required: `name`, `region` |
| PUT | `/:id` | tier5/admin only | Update distributor |
| DELETE | `/:id` | tier5/admin only | Delete distributor |

### Invoices — `/api/invoices`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List invoices |

### Inventory — `/api/inventory`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List inventory (filters: brand, status, search) |
| PUT | `/:id/quantity` | requireAuth | Set absolute quantity; recomputes status; returns updated row |
| POST | `/bulk` | requireAuth | Batch update quantities; body: `{ items: [{id, quantity}], notes?: string }`; SQLite transaction; returns `{ updated, results }` |
| POST | `/restock` | requireAuth | Add N units to an item (N defaults to 50 if not specified) |

### Stats — `/api/stats`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/overview` | requireAuth | Returns totals for dashboard stats cards |

### Creatives — `/api/creatives`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List creatives |
| POST | `/` | tier5/admin only | Create creative; triggers `notifyUsers('new_asset', ...)` |
| PUT | `/:id` | tier5/admin only | Update creative fields |
| DELETE | `/:id` | tier5/admin only | Delete creative |

### Quiz — `/api/quiz`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/complete` | requireAuth | Save quiz result; emails cert if score ≥ 70; auto-issues certificate if all trainings passed |
| GET | `/results` | requireAuth | Get current user's quiz results |

### Certificates — `/api/certificates`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/mine` | requireAuth | Returns `{ firstName, lastName, completionDate, certificateNumber, rewardSubmitted }` for current user; 404 if no cert |
| POST | `/reward` | requireAuth | Save reward claim (product, shirtSize, address1, address2, city, state, zip); 400 if missing fields; 403 if no valid cert; no-op if already submitted |
| GET | `/rewards` | tier5/admin only | All reward claims joined with `users.email` + `certificates.certificate_number` + `avg_score`; unfulfilled first. Backs `MarketingRequestsPage` |
| PUT | `/rewards/:id/fulfilled` | tier5/admin only | `{ fulfilled: boolean }` — sets `fulfilled` + `fulfilled_at` |
| GET | `/reward-options` | requireAuth | `{ products, shirtSizes }` — what the reward form renders. Any tier: it drives the partner picker |
| GET | `/reward-options/all` | tier5/admin only | Full derived catalog + `allowedSkus` (null = no curation saved) + `shirtSizes` + `defaultShirtSizes`. Backs `RewardOptionsModal` |
| PUT | `/reward-options` | tier5/admin only | `{ products?: string[], shirtSizes?: string[] }` — both independently optional so the two editors save separately |
| POST | `/test/ensure` | tier5/admin only | **Self-scoped test harness.** Issues a certificate for the *calling admin* if they have none, so the reward prompt can be exercised without passing all modules. Idempotent — returns `{ certificateNumber, created }`, 201 when newly issued, 200 when reused |
| POST | `/test/reset` | tier5/admin only | **Self-scoped test harness.** Deletes the *calling admin's own* `cert_rewards` row so the prompt reappears; returns `{ ok, deleted }`. Deliberately does NOT touch `certificates` — a genuinely-earned certificate number survives a reset |
| GET | `/verify/:certNumber` | **Public** | Returns `{ valid, fullName, firstName, lastName, completionDate, certificateNumber }`; 404 if not found or revoked |

⚠️ `/rewards` and `/rewards/:id/fulfilled` return shipping PII (name, email, street address). They
were originally guarded by `requireAuth` **only** — any authenticated tier1 employee could read
every certified partner's home address. Both now carry `requireRole('tier5', 'admin')`, locked in
by regression tests. Do not remove those guards.

⚠️ The `/test/*` routes are **self-scoped by design** — they read `req.user!.id` and never accept a
target user id. Do not "improve" them into `/test/reset/:userId`: that would turn an admin
convenience into a way to silently destroy another user's reward claim.

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | tier5/admin only | List all users; includes `last_login`, `status`, and `certificate_number` (null if not certified) via LEFT JOIN |
| PUT | `/users/:id/role` | tier5/admin only | Update a user's role; valid values: tier1–tier5; also sets `status = 'active'` |
| POST | `/users/:id/approve` | tier5/admin only | Approves a pending registration: sets role + `status = 'active'`; adds the user's `company` to the `stores` table (`INSERT OR IGNORE`) so it appears in future registration dropdowns; sends approval email |
| POST | `/users/:id/decline` | tier5/admin only | Sets `status = 'declined'`; declined users are blocked at login (see `routes/auth.ts`) and their company is never added to `stores` |
| DELETE | `/users/:id` | tier5/admin only | Deletes a user; blocked for self and for admin accounts |
| PUT | `/users/:id/company` | tier5/admin only | Update a user's company to a store name from the stores table |

### Notifications — `/api/notifications`
All endpoints require `requireAuth`. Notifications are per-user rows.

| Method | Path | Description |
|---|---|---|
| GET | `/` | Latest 30 notifications for current user, unread first; returns `{ notifications, unreadCount }` |
| PUT | `/read-all` | Mark all as read (registered BEFORE `/:id/read` to avoid Express routing conflict) |
| PUT | `/:id/read` | Mark single notification read (checks `user_id` ownership) |

### Retailer / Physical Marketing Assets — `/api/retailer`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/apply` | requireAuth | Submit marketing asset request; fields: `contact_name`, `business_name`, `address`, `requested_items`, `request_notes?` |
| GET | `/status` | requireAuth | Returns current user's latest request status (includes `requested_items`) |
| GET | `/applications` | tier5/admin only | List all requests |

### Stores — `/api/stores`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | **Public (no auth)** | List all stores ordered by name — used by RegisterPage |
| POST | `/` | tier5/admin only | Create a store `{ name }` |
| DELETE | `/:id` | tier5/admin only | Delete a store |

### Store Members — `/api/store`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/members` | requireAuth | tier2 sees users matching own company; tier5/admin sees all (optional `?company=` filter); includes `quizzes_total` and `quizzes_passed` per user |

### B2B Public Forms — `/api/b2b`
Mounted from `portal/server/src/routes/b2b-forms.ts`. All routes public (no auth) — called directly by the main marketing site. Email-only (EmailJS via `email.ts`); no DB persistence except `hp-apply` (see below).

| Method | Path | Description |
|---|---|---|
| POST | `/contact` | Main site contact form → `sendContactFormEmails()` |
| POST | `/retailer-apply` | "Become a Retailer" form → `sendRetailerApplicationEmails()` |
| POST | `/hp-apply` | Health Practitioner application (`src/pages/HealthPractitionersPage.tsx`) — inserts a row into `hp_applications`, derives a sequential `SHP-XXXX` reference number from the new row's id, then calls `sendHPApplicationEmail()` with `referenceNumber` |
| POST | `/booth-signup` | Hidden Erospain 2026 booth intake → Mailchimp |

**HP application reference numbers:** `hp_applications` table (migration v54) exists solely to back a durable, sequential counter — `SHP-${String(id).padStart(4, '0')}` (e.g. `SHP-0001`, `SHP-0002`), NOT date-based or random like certificate numbers. Displayed in the `b2b_hp_application` admin email template as a badge above the "New HP Application" heading. Do not reuse the certificate-number random-hex pattern here — this is intentionally sequential so admins can tell submission order apart from timestamps.

### WooCommerce — `/api/woo`
All endpoints require `requireAuth + requireRole('tier5', 'admin')`.

| Method | Path | Description |
|---|---|---|
| GET | `/status` | `{ configured, lastPull, lastPush }` from woo_sync_log |
| POST | `/settings` | Save `{ url, consumer_key, consumer_secret }` to woo_settings table |
| POST | `/test` | Test WC connection; returns `{ ok, error? }` |
| POST | `/sync` | Trigger manual full pull via `runWooSync()` |
| POST | `/sync-product` | Body: `{ sku }` — push portal stock for that SKU to WooCommerce |

---

## Training / Quiz Module

- **SCORM packages:** placed at `portal/client/public/training/<quiz-id>/index.html`
- **SCORM shim:** `QuizPage.tsx` installs `window.API` (SCORM 1.2) before the iframe loads; captures `cmi.core.score.raw` on `LMSFinish`
- **Quiz registry:** `portal/client/src/quizzes/index.ts` — add entries here when adding new quizzes
- **Pass threshold:** score ≥ 70 triggers a completion email (if EmailJS configured)
- **Certificate auto-issuance:** after any passing result, server checks if all `trainings` rows have a corresponding passed `quiz_results` row for that user — if so and no cert exists, auto-generates one (see Certification System below)

### Registered Quizzes (in `trainings` DB table)
| Order | ID | Title | Video |
|---|---|---|---|
| 1 | `h2o-vs-sassy` | H2O vs Sassy | YouTube `https://youtu.be/Zqo167w7KXY` |
| 2 | `sea-vs-tsunami` | Sea vs Tsunami | YouTube `https://youtu.be/LQE50bXMq_A` |
| 3 | `satin` | Sliquid Satin | YouTube `https://youtu.be/qfGlB4YRslQ` |
| 4 | `swirl` | Sliquid Swirl | YouTube `https://youtu.be/xEb-3YutbH0` |
| 5 | `silver-vs-silk` | Silver vs Silk | YouTube `https://youtu.be/iaAi0TcqG6U` |
| 6 | `sizzle-vs-sparks` | Sizzle vs Spark | YouTube `https://youtu.be/yt3FzssdPh0` |
| 7 | `splash` | Sliquid Splash | YouTube `https://youtu.be/6SHy8fWy3r8` |
| 8 | `soul` | Sliquid Soul | YouTube `https://youtu.be/PdsWwZDBOmw` |
| 9 | `soak` | Sliquid Soak | YouTube `https://youtu.be/Zwnm6h5YekM` |
| 10 | `soothe` | Sliquid Soothe | YouTube `https://youtu.be/hhfTxbiYsBI` |
| 11 | `ogel` | O Gel | YouTube `https://youtu.be/NlxXiAIs7C0` |

**Notes:**
- `sliquiz` (Customer Service Skills) was replaced by `h2o-vs-sassy` — do not re-add it.
- Quiz order in the `trainings` table (`sort_order`) determines "Go to Next Module" navigation.
- Source files for H2O vs Sassy are at `/Users/dropingtons/Desktop/Sliquid/Sliquiz H2o vs Sassy /` (original export was incomplete — only `assets/js/project.js` was unique; all engine files were copied from sea-vs-tsunami).

### SCORM Package Structure
All quizzes share the same Captivate engine (verified identical MD5s). The only quiz-specific files are:
- `assets/js/project.js` — the compiled quiz content (unique per quiz)
- `dr/` — quiz-specific images/resources
- `pools/` — question pool JS files
- `imsmanifest.xml` — update `<title>` for each new quiz

Shared boilerplate (copy from any existing quiz): `dist/`, `scormdriver.js`, `SCORM_utilities.js`, `Utilities.js`, `browsersniff.js`, `goodbye.html`, `ar/`, `assets/htmlimages/`, all XSD files.

**First-slide removal is NOT feasible** — slides are compiled into `assets/js/project.js`. Would require re-exporting from the original Captivate `.cptx` source file.

### Auto-Start (QuizPage.tsx)
After the video phase, the SCORM iframe auto-starts via a **DOM polling loop** (not a fixed timeout):
- Polls every **300ms** for a clickable element: `button` → `[class*="play"]` → `[class*="start"]` → `#app`
- Fires `pointerdown → pointerup → click` on first match found
- Hard-stops after **15 seconds** as a safety net

### Go to Next Module
On the pass screen, a **"Go to Next Module"** button appears if there is a next quiz in the `QUIZZES` array. Navigates to `/quiz/<next-id>`. "Done" is shown as secondary when a next module exists.

### Adding a New Quiz
1. Drop the SCORM package into `portal/client/public/training/<new-id>/`
   - If the export is incomplete, copy engine files from `sea-vs-tsunami` and replace `assets/js/project.js`
   - Update `imsmanifest.xml` `<title>` to match the new quiz name
2. Add a row to the `trainings` table via the Admin UI (Trainings page → Add Training) or directly in the DB
3. Optionally set `video_path` to a YouTube URL to enable the video-first flow

### Video-First Quiz Flow (`videoPath` field)
When a quiz has `videoPath` set, `QuizPage.tsx` renders a two-phase experience:

**Phase 1 — Video:**
- Full-screen video player (YouTube embed via IFrame API, or native `<video>` for direct file URLs)
- "Skip to Quiz" button in the top bar; "Start Quiz" CTA at the bottom
- Auto-advances to quiz when the video ends (YouTube IFrame API `onStateChange: ENDED`)

**Phase 2 — Quiz:**
- Existing SCORM iframe loads as normal
- **Watch Video** button added to the top bar — opens a modal overlay
- The SCORM iframe stays mounted (state preserved) while the modal is open
- Modal seeks to the last saved playback position on reopen (`videoPositionRef`)
- Closing the modal saves the current position back; Escape key also closes it
- Completion screen has a **Rewatch Video** button

**YouTube IFrame API implementation (`QuizPage.tsx`):**
- `getYouTubeId(url)` — extracts video ID from `youtu.be/` or `youtube.com/watch?v=` URLs
- `loadYouTubeScript(onReady)` — loads `youtube.com/iframe_api` once; safe to call multiple times
- `ytMainRef` / `ytModalRef` — hold `YT.Player` instances for main and modal players
- `modalKey` state increments on each modal open to give YT API a fresh DOM target
- `videoPositionRef` — shared `number` ref tracking playback position across both players

**Video hosting note:** Video files (`.mp4`, etc.) are in `.gitignore` — never commit them (GitHub 100 MB limit, Cloudflare Pages 25 MB limit). Always use a CDN URL or YouTube link for `videoPath` in production.

### Trainings Page — Completion Banner
When all modules are passed (`passedCount === trainings.length`):
- A green banner appears above the progress bar with "You're a Sliquid Certified Expert!"
- "View Certificate" button opens a modal containing `CertificateGenerator`

### Trainings Page — Admin Test Harness
Below the completion banner, `TrainingsPage.tsx` renders an amber **"Admin — test the certificate
flow"** panel gated on `adminMode` (`isAdmin(user.role)`). It exists so admins can verify the
reward prompt and certificate render correctly without grinding through all 11 modules.

- **Test Certificate Flow** → `openCertTest()` → `POST /api/certificates/test/ensure`, then opens
  the normal cert modal. The admin now has a real certificate row, so `GET /certificates/mine`
  returns 200 instead of 404 and the real `CertRewardForm` renders.
- Inside the modal, an amber strip with **Reset** → `resetCertTest()` →
  `POST /api/certificates/test/reset`, which clears the admin's own `cert_rewards` row and
  re-fetches, making the prompt appear again.

⚠️ This is a **live** test path, not a mock: submitting writes a real `cert_rewards` row and sends
the real EmailJS confirmation + admin emails. That is intentional — it is the only way to verify
the email templates actually fire. The Reset button is what makes it repeatable.

⚠️ `openCertModal()` and `openCertTest()` share `loadCertData()`. If you refactor the modal, keep
that split — `openCertModal` must NOT call `/test/ensure`, or a partner tier would hit a 403 on
every legitimate "View Certificate" click.

---

## Announcements / Press Releases

Press releases are authored in **WordPress** at `sliquid.com` under the **Press Releases**
category and pulled into the portal, which then feeds three surfaces:

1. **Public** — `/announcements` + `/announcements/:slug` on the B2B marketing site.
2. **Portal** — `/announcements` + `/announcements/:slug`, visible to all seven tiers.
3. **Admin** — `/admin/announcements` (tier5), full CRUD + visibility + scheduling.

**WordPress is read-only. The portal never writes back to it.** Everything editorial —
visibility, timing, pin order, title/excerpt overrides — is portal-side.

### WordPress source of truth
| Fact | Value |
|---|---|
| REST base | `https://sliquid.com/wp-json/wp/v2` |
| Press Releases category id | **245** (`press-releases`) |
| Auth | none — only `status=publish` posts are synced |
| Incremental sync | `modified_after=<watermark>`, `orderby=modified&order=asc` |
| Pagination | `X-WP-TotalPages` (WP returns 400 past the last page; `per_page` caps at 100) |
| Default cutoff | `2025-01-01` — note **zero posts exist from 2021–2024**, so this yields ~4 items. `2017-01-01` would yield ~30 |

### Two content shapes — this drives the whole renderer
- **`document`** — the author pasted a complete `<!DOCTYPE html>…</html>` document with its own
  `<style>` (using global selectors like `* {}`, `body {}`, `:root { --var }`) into an Elementor
  **HTML widget**. Rendered in a **sandboxed iframe**, because injecting it inline would leak
  that CSS into the host page.
- **`rich`** — plain WordPress content (`<p>/<strong>/<a>/<img>`). Rendered **inline** after
  DOMPurify sanitization, inside a scoped `.announcement-body` class, so it inherits site
  typography and dark mode and stays SEO-indexable.

`content_shape` is decided server-side at sync time and sent as `body_shape`.

### `AnnouncementBody.tsx` — DUPLICATED in both apps
`src/components/AnnouncementBody.tsx` and `portal/client/src/components/AnnouncementBody.tsx`
are byte-identical copies (no npm workspaces; separate lockfiles and toolchains). **Edit both.**
Styling lives in each app's `.announcement-body` block in `index.css`, not in the component.

⛔ **`BODY_SANDBOX` must never gain `allow-scripts`.** It is
`'allow-same-origin allow-popups allow-popups-to-escape-sandbox'`. Without `allow-scripts` the
frame executes no script at all, so `allow-same-origin` — present only so the *parent* can read
`contentDocument` to measure height — grants the content nothing. Adding `allow-scripts`
alongside it removes the sandbox entirely, giving the frame same-origin access to the parent DOM
and `localStorage` (including `portal_token`). A unit test asserts the exact string.

⚠️ **Quirks mode:** Shape A documents arrive nested inside Elementor wrapper divs. Any markup
before `<!DOCTYPE html>` makes the iframe render in quirks mode — wrong box model and
line-height, with no error anywhere. `extractDocument()` slices the real document out; the
server does the same via `stripElementorWrapper()`. Both have regression tests.

### Scheduling — no background job
A scheduled announcement is `status='published'` with a future `publish_at`. There is
deliberately **no `'scheduled'` status**; visibility is a read-time SQL predicate
(`LIVE_SQL` in `announcements.ts`), so it survives restarts and cannot drift. The admin UI gets
a derived `effective_status` (`hidden` / `scheduled` / `live` / `expired` / `archived`)
computed in SQL.

⚠️ **All timestamps MUST be normalized to `'YYYY-MM-DD HH:MM:SS'` UTC** via `normalizeTs()`.
`LIVE_SQL` compares lexicographically against `datetime('now')`, and an ISO string's `'T'`
(0x54) sorts *after* a space (0x20) — so storing `2026-07-31T16:00:00Z` makes an item scheduled
earlier today read as still-in-the-future and it never goes live.

### Column ownership — the anti-clobber contract
In the `announcements` table, **every `wp_*` column (plus `content_shape`, `content_css`,
`last_synced_at`) is sync-owned** and overwritten on every pull. **Every other column is
admin-owned** and must never appear in the sync upsert's `SET` clause, or a routine sync
silently unpublishes announcements and discards overrides, schedules and pin order.
`upsertFromWpPost()` enforces this; `wordpress-sync.test.ts` has a test that asserts all 15
admin columns are byte-identical after a WordPress-side edit.

Portal-authored announcements have `wp_id IS NULL` and `source='portal'`, so the sync (which
only ever matches on `wp_id`) can never touch them. Their content lives in the `*_override`
columns, so `COALESCE(override, wp_*)` reads uniformly for both kinds of row.

### Deleting
`DELETE /api/announcements/:id` **archives** a WordPress-sourced row (`status='archived'`, both
visibility flags off) rather than deleting it — a hard delete would be undone by the next sync,
losing the overrides. Only `source='portal'` rows are hard-deleted.

### Pending users see the PUBLIC subset
A user with `status='pending'` (registration awaiting approval) can reach `/announcements`, but
the server narrows their feed and detail lookups to `show_on_public = 1` via `surfaceFor(req)` —
the same items anyone can read on the marketing site. Partner-only announcements
(`show_in_portal = 1, show_on_public = 0`) stay hidden until the account is approved, and the
notification sweep skips pending users for those so they never get a dead link.

### Notifications
`sweepScheduledAnnouncements()` fires `new_announcement` when an item crosses its publish time,
and stamps `notified_at` so it is idempotent — which lets one code path serve both the 5-minute
sweep and an immediate admin publish. Admins additionally get `announcement_review` when a sync
imports new (hidden) posts.

⚠️ **`routes/notifications.ts` filters non-admins to `USER_VISIBLE_TYPES`.** A new user-facing
notification type MUST be added to that array or it will be inserted for tier1–tier4 and then
silently filtered out of their feed — which looks exactly like "notifications are broken", with
no error anywhere.

### Key files
| Path | Purpose |
|---|---|
| `portal/server/src/wordpress.ts` | Pure content pipeline (Elementor unwrap, document extraction, URL absolutization, slugs, `normalizeTs`) + `WordPressService` + `runAnnouncementSync()` |
| `portal/server/src/announcements.ts` | `LIVE_SQL`, `ORDER_SQL`, `LIST_COLS`/`DETAIL_COLS`/`ADMIN_COLS`, `EDITABLE_FIELDS`, `sweepScheduledAnnouncements()` |
| `portal/server/src/routes/announcements.ts` | 18 endpoints, namespaced `/public/…` and `/admin/…` |
| `portal/client/src/pages/AnnouncementsAdminPage.tsx` | Admin table: two independent visibility switches, pin, schedule picker, Sync now, Delete-vs-Archive |
| `src/pages/AnnouncementsPage.tsx` | Public list (marketing site) |
| `src/utils/date.ts` | `formatDate` / `isoDate` — parse SQLite UTC timestamps correctly |
| `portal/client/src/lib/utils.ts` | adds `formatDateTime`, `timeAgo`, **`timeUntil`**, `toLocalInputValue`, `fromLocalInputValue` |

### API — `/api/announcements`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth (all tiers) | Live + portal-visible list. **No `body_html`.** Pending users get the public subset |
| GET | `/:idOrSlug` | requireAuth | Detail incl. `body_html`; re-applies the visibility predicate, so a hidden/embargoed post 404s even for an admin |
| GET | `/public` | **none** | Live + `show_on_public` list. Must stay in `PUBLIC_PATHS` |
| GET | `/public/:idOrSlug` | **none** | Public detail |
| GET | `/admin` | tier5 | All rows incl. hidden/archived, plus `effective_status`; `?status`, `?source`, `?search` |
| GET | `/admin/:id` | tier5 | Full row incl. raw `wp_title` / `wp_content_html` for original-vs-override display |
| POST | `/` | tier5 | Create a portal-only announcement (`EDITABLE_FIELDS` allowlist) |
| PUT | `/:id` | tier5 | Update overrides; returns the full row |
| DELETE | `/:id` | tier5 | Archive (WordPress) or delete (portal). **Always returns JSON** — `api.delete` parses unconditionally |
| PUT | `/:id/portal-visibility` | tier5 | `{ id, show_in_portal }` — independent of public |
| PUT | `/:id/public-visibility` | tier5 | `{ id, show_on_public }` — independent of portal |
| PUT | `/:id/pinned` | tier5 | `{ id, pinned }` |
| PUT | `/:id/schedule` | tier5 | `{ status?, publish_at?, expires_at? }`, normalized; notifies immediately on publish |
| POST | `/admin/sync` | tier5 | Manual pull; returns the sync result |
| GET | `/admin/sync/status` | tier5 | Config, watermark, last sync, counts |
| PUT | `/admin/settings` | tier5 | Persist `wp_base_url` / `wp_category_id` / `wp_cutoff_date` / enabled |
| POST | `/admin/test` | tier5 | Connection test |
| POST | `/admin/reorder` | tier5 | `{ order: number[] }` → `sort_order` |

⚠️ **`PUBLIC_PATHS` in `app.ts` must contain `'/api/announcements/public'`, not
`'/api/announcements'`.** The matcher is a prefix match, so the broad form makes *every*
announcements route skip `strictCors` and inherit the hardcoded
`Access-Control-Allow-Methods: 'GET, OPTIONS'`, breaking admin writes in the browser — while
every supertest test still passes, because supertest sends no `Origin`. Tested explicitly with
`.set('Origin', …)`.

⚠️ Route order: literals before params, and `GET /:idOrSlug` is registered **last**.
`slugify()` reserves `public` / `admin` / `sync` so no announcement can claim a shadowing slug.

### Background jobs (`index.ts`)
| Interval | Job |
|---|---|
| once, 15s after boot | sweep + `runAnnouncementSync('boot')` |
| every 5 min | `sweepScheduledAnnouncements()` — one indexed SELECT |
| every 30 min | `runAnnouncementSync('schedule')` — gated on `wp.isSyncEnabled()` |

Deliberately **not** piggybacked on the WooCommerce interval, which is gated by
`woo.isConfigured()` — announcements would silently stop if Woo credentials were rotated out.

### Marketing site notes
- `Announcements` is in `NAV_LINKS` (`src/utils/constants.ts`) — one entry feeds the desktop
  nav, mobile drawer **and** footer quick links.
- `API_BASE` is now exported from `constants.ts`. Eight older pages still redeclare their own
  copy, four of them reading the undocumented `VITE_PORTAL_API_URL`. New code should import
  `API_BASE`.
- **CSP** (`index.html`): `connect-src` allowlists only the Railway API host, so the browser
  cannot call WordPress directly — announcements must come through the portal API. `frame-src`
  now includes `'self'` for the srcdoc iframe. `img-src` allows `sliquid.com`, `www.sliquid.com`
  and the S3 bucket — **an image from any other host in a post body is silently blocked on the
  marketing site while working fine in the portal** (the portal has no CSP).
- `InsightsPage` is now WordPress-driven (the hardcoded `FEATURED_NEWS` grid was retired) and
  `/insights/:slug` renders the real detail page, closing six previously-dead links.

---

## Certification System

### Overview
When a user passes their final training module, a certificate is automatically issued and stored in the `certificates` table. Users can download a PDF and anyone can verify a certificate at `/verify`.

### Certificate Number Format
`SLQ-YYYY-XXXXXX` where `YYYY` is the current year and `XXXXXX` is 6 uppercase hex characters generated via `randomBytes(3).toString('hex').toUpperCase()`.

### Auto-Issuance Logic (`routes/quiz.ts`)
On every `POST /api/quiz/complete` where `passed = true`:
1. Fetch all `quiz_id` values from the `trainings` table
2. Fetch all distinct `quiz_id` values from `quiz_results` for this user where `passed = 1`
3. If every training quiz_id is in the user's passed set → check for an existing certificate
4. If no certificate exists → insert a new row into `certificates`
- Does **not** re-issue if a certificate already exists for that user
- Does **not** issue if no trainings are configured (empty trainings table)

### `certificates` Table Schema
```sql
CREATE TABLE certificates (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  certificate_number TEXT UNIQUE NOT NULL,     -- e.g. SLQ-2025-A3F7B2
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issued_to          TEXT NOT NULL,             -- snapshot of user.name at issuance
  completion_date    TEXT NOT NULL DEFAULT (datetime('now')),
  is_valid           INTEGER NOT NULL DEFAULT 1, -- 0 = revoked
  created_at         TEXT DEFAULT (datetime('now'))
);
```

### `cert_rewards` Table Schema (migration v16)
```sql
CREATE TABLE cert_rewards (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,      -- snapshot of user.name at submission
  product      TEXT NOT NULL,      -- free product chosen
  shirt_size   TEXT NOT NULL,      -- XS/S/M/L/XL/2XL/3XL
  address1     TEXT NOT NULL,
  address2     TEXT,               -- optional
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  zip          TEXT NOT NULL,
  submitted_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id)                  -- one submission per user, ever
);
```
- Enforced UNIQUE on `user_id` — second submission is ignored (idempotent, no error)
- `GET /api/certificates/mine` returns `rewardSubmitted: true` once a row exists for that user
- Admins can query this table directly to pull fulfillment data for shipping

### Reward Product Catalog (`portal/server/src/rewardOptions.ts`)

The reward picker shows **one variant per product**: the ~4 oz version where it exists, else the
~8 oz version, else whatever single size the product has. Grouping key is **`(brand, name)`**.

⚠️ **Sizes are matched NUMERICALLY, never by string equality.** The real catalog contains
`'4.2 oz'` (40 rows) and `'8.5 oz'` (35 rows) — **there is no literal `'4 oz'` or `'8 oz'`**, so
`unit_size === '4 oz'` matches zero rows. The same size also appears under two spellings,
`'2 oz'` and `'2.0 oz'`. `parseSize()` regex-parses the leading number; `pickVariant()` selects
the row nearest 4 (within ±1), then nearest 8, then the largest. Against the live 106-product
catalog this yields **67 choices**.

⚠️ **Size lives on `products.unit_size` only.** The `inventory` table has **no size column** — it
is 1:1 with products and borrows `unit_size` via `LEFT JOIN` on `product_id`. Do not treat
inventory as a size source.

⚠️ `unit_size` is nullable free text. WooCommerce auto-import (`runWooSync`) inserts products with
`unit_size = NULL` and `brand = 'Imported'`, so the derivation must tolerate nulls — it does, and
a test covers it.

**Curation** is stored in the shared `woo_settings` key/value table (no migration): key
`reward_allowed_products` holds a JSON SKU array, `reward_shirt_sizes` a JSON string array. An
absent, empty, or malformed value means *no curation saved* and falls back to the **full**
catalog — never an empty picker. Default shirt sizes are `S, M, L, XL, 2XL`.

### Trainings Page — Admin Overflow Menu
The kebab (`MoreVertical`) beside "Add Training" is admin-only and holds three actions:
**Test certificate flow** (`openCertTest`), **Available products**, **Available shirt sizes**
(both open `RewardOptionsModal` with a `mode` prop). It replaced the earlier amber test panel.
This is the **only** kebab menu in the codebase — there was no prior house pattern.

### `Combobox.tsx` (`portal/client/src/components/`)
Generic type-ahead picker: type to filter, or open and scroll. Generalized from the RegisterPage
store picker, adding the two things that pattern lacked — keyboard nav (↑/↓/Enter/Escape) and a
selected-state check. `strict` mode discards typed text that doesn't match an option (used for
the reward product, where a free-text product name would be unfulfillable). Reuse this rather
than hand-rolling another dropdown.

### Cert Reward Form (`portal/client/src/components/CertRewardForm.tsx`)
Gate shown **before** the certificate download, one time only per user. Collects:
- **Name** — pre-filled from cert data, read-only
- **Free product** — `Combobox` (strict mode) fed by `GET /api/certificates/reward-options`; one
  size per product, narrowed to the admin allowlist. Replaced the old `<datalist>` over `/products`
- **T-shirt size** — dropdown fed by the same `reward-options` payload; defaults to
  `S, M, L, XL, 2XL` and is admin-editable. (This doc previously claimed `XS…3XL`, which the code
  never had.)
- **Shipping address** — Street, Apt/suite (optional), City, State (2-char, auto-uppercased), ZIP
- **Privacy notice** — "Your information is used only to ship your rewards and will never be sold, shared, or used for any other purpose."
- On submit → `POST /api/certificates/reward` → calls `onComplete()` which flips `rewardSubmitted: true` in TrainingsPage state → `CertificateGenerator` is rendered
- If `rewardSubmitted` is already `true` when modal opens → reward form is skipped entirely

### CertificateGenerator Component (`portal/client/src/components/CertificateGenerator.tsx`)
- Fetches `GET /api/certificates/mine` (uses auth token — no props needed)
- Displays: Recipient, Completed date, Certificate #, Status
- **Download Certificate PDF** button uses `@react-pdf/renderer` to generate PDF in-browser
- PDF prints `{origin}/verify` as the verification URL so anyone can look it up

**PDF layout (landscape LETTER):**
- **Top bar logo:** Poppins Light 28pt lowercase `sliquid` + Poppins Regular 9pt `an intimate wellness company` (white on blue — no image, no bleed)
- Fonts registered via `Font.register` from `public/fonts/Poppins-Light.ttf` and `public/fonts/Poppins-Regular.ttf`
- **Certificate header:** two lines — `C E R T I F I C A T E` / `O F   C O M P L E T I O N` — Helvetica-Bold 16pt, Sliquid blue
- **Body copy:** `has successfully completed the`
- **Course pill:** `SLIQUID CERTIFIED EXPERT TRAINING COURSE` — Helvetica-Bold 18pt, SLIQUID_LIGHT_BLUE background, paddingHorizontal 32
- Supporting text line removed entirely
- **Gold badge image:** `<Image src="/downloads/badge.png">` 88×110pt, centered below date — place `badge.png` at `public/downloads/badge.png` before generating PDFs
- Gold inner border, corner accents, circular seal, two signature blocks (Erik + cert number box)

### Certificate Verify Page (`portal/client/src/pages/CertificateVerify.tsx`)
- Route: `/verify` — outside `<Shell>`, publicly accessible, no auth required
- User types a certificate number into a search form and clicks **Verify**
- Input is trimmed and uppercased before the API call
- **Verified** (green): shows Issued To, Completed, Certificate #, Program (`Sliquid Certified Expert Course`), Issued By, Status ✓ Valid
- **Not Found** (red): shows the searched number + "not found" message
- "Search another certificate" button resets the form without a page reload
- Uses raw `fetch` (not `api.*`) since no auth token is available

### Sliquid Wellness Logo
Copied to `portal/client/public/images/sliquid-wellness-logo.png` from `~/Downloads/Logo Sliquid Wellness-01.png`.

### Static Font & Badge Assets
| File | Purpose |
|---|---|
| `portal/client/public/fonts/Poppins-Light.ttf` | Poppins weight 300 — used in PDF top bar |
| `portal/client/public/fonts/Poppins-Regular.ttf` | Poppins weight 400 — used in PDF top bar tagline |
| `portal/client/public/downloads/badge.png` | Gold badge rendered in certificate PDF — **must be placed here manually** before PDFs will generate |

`public/downloads/` directory is created. Drop the badge image there when available.

---

## User Management (`/users`)

Admin-only page (`UsersPage.tsx`). All editing now happens inside a **modal** — rows are read-only and fully clickable.

### User Row (table)
- Displays: avatar initial, name, "Certified" badge if applicable, email, company, role badge (solid color), date joined
- Click anywhere on the row → opens `UserDetailModal`

### Role Badge Colors (`roleBadgeClass()` in UsersPage.tsx)
Solid filled with white text for maximum readability:
| Role | Tailwind class |
|---|---|
| tier5 (Admin) | `bg-violet-600 border-violet-600 text-white` |
| tier4 (Prospect) | `bg-orange-500 border-orange-500 text-white` |
| tier3 (Distributor) | `bg-cyan-600 border-cyan-600 text-white` |
| tier2 (Retail Management) | `bg-emerald-600 border-emerald-600 text-white` |
| tier1 (Retail Store Employee) | `bg-slate-500 border-slate-500 text-white` |

### UserDetailModal
Shows full user profile. Contains:
- **Identity:** large avatar initials (up to 2 letters), name, email, role badge
- **Details grid:** Date Joined, Last Login (formatted date + relative time e.g. "3d ago"; "Never" if null)
- **Store / Company:** editable dropdown (stores table); Save button appears on change; syncs back to table and list on save
- **Account Type:** editable role dropdown; Save button appears on change; syncs back on save
- **Certification:**
  - If certified: green panel with `Award` icon, "Sliquid Certified Expert", cert number, **Verify** link opening `/verify` in new tab
  - If not certified: gray panel with `GraduationCap` icon, "Training Not Completed"

### last_login Tracking
- `last_login TEXT` column added to `users` table (migration v14)
- Stamped via `UPDATE users SET last_login = datetime('now') WHERE id = ?` on every successful login in `routes/auth.ts`
- Returned by `GET /api/admin/users` and displayed in the modal

---

## Inventory Stock Edit

### Single-row edit (non-edit-mode)
- Clicking any row opens `StockEditModal` (pre-filled with current quantity).
- On save: calls `PUT /api/inventory/:id/quantity`, updates the row optimistically.
- If WooCommerce is configured, a 20-second `WooSyncToast` (bottom-right) appears per SKU.
  - After 20s: `POST /api/woo/sync-product` pushes the new stock to WooCommerce.
  - Cancel: clears the timer and reverts the quantity.

### Restock modal
- Clicking **Restock** on a row opens `RestockModal` (not a direct API call).
- Shows: Current Qty / Add Qty (editable, default 50) / New Total preview.
- On confirm: calls `POST /api/inventory/restock`, optimistic update, then starts undo timer + WooCommerce sync.

### Bulk Edit Mode
- Header **"Edit Mode"** toggle (pencil icon) switches the entire table to inline edit mode.
- In edit mode: qty cells become `<input type="number">` writing to `pendingEdits: Record<number, number>`.
- Changed rows get a left accent border + subtle highlight.
- **Sticky bottom bar** (`fixed bottom-6 left-1/2 -translate-x-1/2`) shows change count + "Review Changes →" button.
- Clicking **Review Changes** opens `BulkReviewModal`:
  - Editable "New Qty" inputs in the modal — admins can adjust before committing
  - Submit button auto-counts down **5 seconds** on modal open
  - First click during countdown skips to "Submit All Changes"; second click submits
  - Cancel stays in edit mode; no changes sent
- On submit (`POST /api/inventory/bulk`):
  - Snapshot of old quantities stored for undo
  - Optimistic update in table
  - `WooSyncToast` per changed SKU (20s each)
  - **Undo toast** (bottom-center, 10s countdown) — clicking Undo calls `POST /api/inventory/bulk` with original values and cancels all pending WooCommerce sync timers
  - Server fires `notifyAdmins()` for any item whose status transitions to `low_stock` or `out_of_stock`
- `notes` field accepted by server (stored for future warehouse accounts, currently ignored in DB)

---

## Product Library (`/assets`)

`AssetsPage.tsx` is the merged "Product Library" combining `/api/assets` and `/api/creatives` data in one page. `/creatives` route and `CreativesPage.tsx` have been **deleted**.

### UX — File Explorer (current design)
Tab-based grid has been replaced with a brand-grouped file explorer:

```
AssetsPage
  └─ Search bar (header) + Add Item (admin)
  └─ BrandSection per brand (collapsible, sorted: Sliquid → Ride Lube → Ride Rocco → …)
        ├─ "View all [Brand] (N items)" button → FileExplorerModal (all items for brand)
        ├─ Section pills: [Logos (3)] [Social Media (5)] [Documents (2)] …
        ├─ Preview strip: up to 4 clickable thumbnails → FileDetailModal
        └─ "Show all [Section]" button → FileExplorerModal (section items)

FileExplorerModal  (z-50)
  └─ Grid: grid-cols-3→5, each card aspect-square
  └─ Admin hover: edit + delete icons (delete requires confirm)
  └─ Click file → FileDetailModal

FileDetailModal  (z-[60], stacked over explorer)
  └─ Large preview + metadata
  └─ Download button (only download point in the UI)
  └─ Admin: Edit → EditItemModal (z-[70]); Delete (two-click confirm)
  └─ Back arrow → close detail (explorer stays open); X → close both
```

### Section → Type Mapping (`SECTION_MAP`)
| Section label | Asset type(s) | Source |
|---|---|---|
| Logos | Logo | asset |
| Banners | Banner | asset |
| Social Media | Social, Social Media | asset |
| Documents | Document, Print | asset / creative |
| Email Templates | Email | creative |
| Campaign Materials | Multi | creative |
| Videos | Video | creative |

### Brand Display Names
| DB value | Display name |
|---|---|
| `RIDE` | Ride Lube |
| All others | as-is |

Brand sort order: Sliquid → Ride Lube (RIDE) → Ride Rocco → Sliquid Science → alphabetical for unknowns.

### Admin CRUD (tier5/admin only)
- **Add** button → `AddItemModal`: Section dropdown (maps to type + source); Brand dropdown with "Other (type a new brand…)" fallback text input; POSTs to `/api/assets` or `/api/creatives`
- **Edit** → `EditItemModal`: same brand dropdown; `PUT /api/assets/:id` or `PUT /api/creatives/:id`
- **Delete** → two-click confirm inline (in explorer hover icons or FileDetailModal)

### Image Sizes
- **Preview strip / FileExplorerModal cards:** `aspect-square` (square thumbnails)
- **FileDetailModal preview:** `aspect-video` (`object-contain`)
- Images placed at any CDN URL; paste into `thumbnail_url` field when adding/editing items

---

## Physical Marketing Assets (`/retailer`)

`RetailerPage.tsx` — catalog-style page for requesting physical Sliquid marketing materials (for physical retail locations only; accessible to tier4 Prospect + tier5 Admin).

### Catalog Items (from `MARKETING_ITEMS` constant)
| ID | Name | Variants |
|---|---|---|
| `counter-cards` | Counter Cards | Naturals Collection, Organics Collection, Swirl Collection, Ride Lube Collection, Sliquid Naturals Satin, Sliquid Naturals Tsunami, SliqPick Infographic |
| `retractable-banner` | Retractable Banner | _(no variants)_ |
| `neon-sliquid` | Sliquid Neon Sign | _(no variants)_ |
| `neon-ride` | Ride Lube Neon Sign | _(no variants)_ |

### UX Flow
- **ItemCard** per catalog item: `aspect-[16/7]` image area; Select/Selected toggle button; variant checkboxes expand when item is selected
- Counter Cards require at least one variant selected before submit
- Form fields: Full Name, Company/Business Name, Physical Location/Storefront (textarea), Notes (optional)
- `buildRequestedItems()` formats selections as `"Counter Cards (Naturals, Swirl); Retractable Banner"` before POSTing
- Submits to `POST /api/retailer/apply`

### Image Sizes
- **In-store Marketing cards:** 860×376px (16:7 `aspect-[16/7]`)
- `imageUrl` field per item — set to `null` placeholder by default; replace with WordPress/CDN URL when available

---

## Notification System

Notifications are per-user rows in the `notifications` table (migration v9).

### Server Side — `portal/server/src/notifications.ts`
- `notifyAdmins(type, title, message, link?)` — inserts one row per admin (role `tier5` or `admin`)
- `notifyUsers(type, title, message, link?)` — inserts one row per non-admin user
- `notifyEveryone(...)` — every user, all tiers
- `notifyUserIds(ids, ...)` — an explicit audience (e.g. everyone except pending users)
- `notifyUser(userId, ...)` — a single user

⚠️ **`routes/notifications.ts` filters non-admins to the `USER_VISIBLE_TYPES` allowlist.**
A new user-facing type must be added there or it is inserted and then silently filtered out
of every non-admin feed, with no error anywhere.

### When Notifications Are Created
| Trigger | Type | Recipients |
|---|---|---|
| Inventory status transitions to `low_stock` | `low_stock` | Admins only |
| Inventory status transitions to `out_of_stock` | `out_of_stock` | Admins only |
| New asset added (`POST /api/assets`) | `new_asset` | All non-admin users |
| New creative added (`POST /api/creatives`) | `new_asset` | All non-admin users |
| Announcement crosses its publish time | `new_announcement` | Everyone (pending users only if it is also public) |
| Sync imports new hidden press releases | `announcement_review` | Admins only |

**Status-change-only rule:** Inventory notifications fire only when `oldStatus !== newStatus`. Prevents spam when admins repeatedly update already-low items.

**Bulk inventory + notifications:** `notifyAdmins()` calls happen AFTER the SQLite transaction commits (not inside it) to avoid nested DB write conflicts. Alerts are collected in an `alerts[]` array during the transaction loop.

### Client Side — `NotificationContext.tsx`
- `NotificationProvider` wraps the entire `Shell` content (inside `NotificationProvider` in `Shell.tsx`)
- Polls `GET /api/notifications` every **60 seconds**
- `markRead(id)` — optimistic local update + `PUT /api/notifications/:id/read`
- `markAllRead()` — optimistic local update + `PUT /api/notifications/read-all`

### TopBar Bell Dropdown
- Shows red badge with unread count (hidden at 0)
- Dropdown header: "X new" chip + "Mark all read" button
- Scrollable list (max-h-80); empty state with Bell icon
- Each row: colored icon by type (`AlertTriangle` amber / `PackageX` red / `BookOpen` accent), title, message, relative time (`timeAgo()`), blue dot for unread
- Clicking a notification: marks read + navigates to `n.link` if present
- `NOTIF_ICONS` and `NOTIF_COLORS` maps keyed by notification `type`

### Route Ordering Note
`PUT /read-all` is registered BEFORE `PUT /:id/read` in `routes/notifications.ts` — Express would otherwise match `read-all` as the `:id` parameter.

---

## Products Import / Export

- **Export CSV** button (admin only) — uses raw `fetch` (not `api.*`) to get the binary blob, then triggers a browser download. Available to all roles via the endpoint but UI-gated to admins.
- **Import CSV** button (admin only) — triggers a hidden `<input type="file" accept=".csv">`. Client-side CSV parser handles quoted fields. Sends parsed rows to `POST /api/products/import`. Shows a result toast for 5 seconds.
- CSV columns: `name, brand, category, sku, description, price, unit_size, case_pack, case_cost, unit_msrp, vendor_number, upc, case_weight, unit_dimensions, case_dimensions, in_stock`

---

## WooCommerce Integration

### Service (`portal/server/src/woocommerce.ts`)
- `WooCommerceService` — pure `fetch`-based (no extra npm packages). Credential priority: env vars (`WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`) → `woo_settings` DB table.
- `runWooSync()` — pulls all WC products (auto-paginates 100/page), matches by SKU:
  - SKU exists in portal inventory → updates `quantity` + `status`
  - SKU not in portal at all → auto-imports as new product + inventory row (brand: `Imported`, category: `Uncategorized`)
  - Writes result to `woo_sync_log`
- Server polls `runWooSync()` every 10 minutes after `app.listen` (only if configured).

### WooCommerce Settings Panel (UsersPage)
- Section below the users table in `/users` (admin only).
- Shows connection status, last pull timestamp, Test Connection and Sync Now buttons.
- Credential form (URL, Consumer Key, Consumer Secret) — saves to `woo_settings` table via `POST /api/woo/settings`.

### Credential Storage
Credentials can be set two ways (env takes precedence):
1. **Env vars** on Railway: `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`
2. **Admin UI** at `/users` → WooCommerce panel → Save Credentials (stored in `woo_settings` table)

---

## Testing

Server uses **Vitest + supertest** with an in-memory SQLite database.

### Running Tests
```bash
cd portal/server
npm test            # run all tests once
npm run test:watch  # watch mode
```

### Test Structure
```
portal/server/src/__tests__/
  setup.ts                        # sets DB_PATH=:memory:, JWT_SECRET, silences console.log
  helpers/
    auth.ts                       # makeToken(), makeExpiredToken(), bearerToken()
    db.ts                         # resetDb(), seedTestUsers(), seedInventoryItem(),
                                  # seedTraining(), seedQuizResult(), seedCertificate(),
                                  # seedCertReward()
  middleware/
    auth.test.ts
  routes/
    auth.test.ts
    products.test.ts
    assets.test.ts
    inventory.test.ts
    notifications.test.ts
    retailer.test.ts
    marketing-items.test.ts
    trainings.test.ts
    quiz.test.ts                  # quiz completion + certificate auto-issuance
    certificates.test.ts          # GET /mine (rewardSubmitted field), POST /reward, GET /verify/:certNumber
    announcements.test.ts         # 61 tests: feeds, detail leak test, CORS, admin CRUD,
                                  # visibility independence, scheduling, pending-user subset
  wordpress.test.ts               # 44 tests: pure content pipeline, no mocks
  wordpress-sync.test.ts          # 28 tests: fetch mocking + THE ANTI-CLOBBER TEST
  announcements-notify.test.ts    # 14 tests: publish sweep, idempotency, pending audience
```

Marketing site (`npm test` at the repo root, vitest + jsdom):
```
src/__tests__/announcementBody.test.tsx   # 25 tests: shape classification, quirks-mode
                                          # regression, sanitization, sandbox invariant
src/__tests__/fixtures/announcement-shape-a.html  # the REAL body of WP post 126182
```

### Test Helper Functions (`helpers/db.ts`)
| Function | Description |
|---|---|
| `resetDb()` | Deletes all rows from all tables including `cert_rewards` and `certificates`; resets autoincrement sequences |
| `seedTestUsers()` | Inserts admin (tier5), tier1, tier2, tier4 users; returns their IDs |
| `seedInventoryItem(overrides?)` | Inserts a test inventory row; returns its ID |
| `seedTraining(quizId, overrides?)` | Inserts a training row; returns its ID |
| `seedQuizResult(userId, quizId, passed, score?)` | Inserts a quiz_results row; returns its ID |
| `seedCertificate(userId, userName, certNumber?)` | Inserts a certificates row; returns `{ id, certNumber }` |
| `seedCertReward(userId, overrides?)` | Inserts a cert_rewards row using that user's name; returns the row ID |
| `seedAnnouncement(overrides?)` | Inserts an announcement, defaulting to the state a fresh sync leaves it in (hidden, both flags off). Pass `publish_at` as a literal e.g. `'2020-01-01 00:00:00'` |
| `seedPendingUser(overrides?)` | A `status='pending'` user. Deliberately NOT in `seedTestUsers()` — several tests assert exact active/pending counts |

### Key Test Coverage — Certification
- `quiz.test.ts` (18 tests): no cert when no trainings; no cert on partial pass; no cert on failed quiz; cert issued when all passed; cert number format `SLQ-\d{4}-[A-F0-9]{6}`; no duplicate cert on retake; per-user isolation
- `certificates.test.ts` (25 tests):
  - `GET /mine`: 401 no auth; 404 no cert; correct data shape; `rewardSubmitted: false` before reward; `rewardSubmitted: true` after reward; user isolation; revoked cert 404
  - `POST /reward`: 401 no auth; 403 no cert; 400 for each missing required field (product, shirtSize, address1, city, state, zip); 201 + DB row verified; address2 optional; idempotent (second call returns 200, no duplicate); per-user isolation; round-trip confirms `rewardSubmitted` flips to `true`
  - `GET /verify/:certNumber`: unknown 404; revoked 404; valid 200 + full shape; public (no auth); case-sensitive lookup

**Total: 511 tests passing across 22 test files** (1 known pre-existing failure in
`admin.test.ts` — it asserts tier3 is rejected on approve, which is no longer true).

`certificates.test.ts` is now 42 tests — it additionally locks in the admin-only guards on
`/rewards` + `/rewards/:id/fulfilled` (403 for tier1, and the DB row is asserted unchanged so the
guard can't be bypassed silently) and covers the `/test/ensure` + `/test/reset` harness, including
that reset leaves the `certificates` row intact and never touches another user's reward row.

---

## Deployment

### Cloudflare Pages (portal client)
- Root directory: `portal/client`
- Build command: `npm install && npm run build`
- Build output: `dist`
- Config: `portal/client/wrangler.toml`
- Env var: `VITE_API_URL=https://sliquid-b2b-production.up.railway.app`

### Railway (portal server)
- Builder: Dockerfile (`portal/server/Dockerfile`) — node:22-slim with python3/make/g++ for `better-sqlite3`
- Config: `portal/server/railway.toml` — `builder = "dockerfile"` only (no healthcheckPath)
- Volume: mount at `/data`, set `DB_PATH=/data/portal.db`
- Required env vars: `JWT_SECRET`, `ALLOWED_ORIGINS` (comma-separated Cloudflare URLs)
- Optional env vars: `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `EMAILJS_SERVICE_ID`, `PORTAL_URL`, `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `WP_BASE_URL`, `WP_ANNOUNCEMENTS_CATEGORY_ID`, `WP_ANNOUNCEMENTS_CUTOFF`
- Employee SSO env vars (all required to enable the `/api/auth/sso` flow):
  - `SSO_ENABLED=true`, `SSO_ISSUER`, `SSO_AUTHORIZE_URL`, `SSO_TOKEN_URL`, `SSO_JWKS_URL` (all `https://sso-api.sliquid.com/...`)
  - `SSO_CLIENT_ID`, `SSO_CLIENT_SECRET` (from registering the app at `https://sso.sliquid.com` → Admin → Apps)
  - `SSO_REDIRECT_URI` — **must byte-match** the registered URI, e.g. `https://<server-domain>/auth/google/callback`
  - `SSO_SCOPE=openid profile email`, `SSO_SUCCESS_REDIRECT=<portal client origin>` (for the `#token=` handoff)

---

## Asset MCP Server — ChatGPT Brand Agent

An MCP server mounted at **`/mcp`** inside the portal server lets the Sliquid Brand Agent (a
ChatGPT workspace agent) retrieve approved product packshots. Full runbook in
`docs/brand-agent/DEPLOYMENT.md`; the agent's instruction block is in
`docs/brand-agent/AGENT-INSTRUCTIONS.md`.

### Two OpenAI platform limits that shaped the design

⛔ **ChatGPT MCP connectors cannot present an API key or a custom header.** Only *No Auth*,
*OAuth 2.1*, or *Mixed* are supported — no client-credentials or service-account grants either.
Anyone proposing an `x-api-key` for this is reading the GPT **Actions** docs, which are a
different product surface. Do not "simplify" the OAuth layer into a shared secret; it will not work.

⛔ **An MCP `{ type: "image" }` result renders as empty `{}` in ChatGPT** and never becomes
model-visible. OpenAI confirmed this in Apr 2026 with no fix committed. Every tool result must
therefore be fully understandable from `structuredContent` + text alone — the image block is a
bonus for MCP Inspector and other clients. `create_product_composition` is the primary path for
anything visual, not a fallback.

### Security model
The MCP router shares a process with `users.password_hash` and `cert_rewards` shipping addresses,
so isolation is enforced in code:

⚠️ **Audience binding is load-bearing.** The portal's employee SSO and this endpoint both trust
the same issuer, so without an `aud` check a portal session token would be a valid MCP
token. `requireMcpScope` verifies `aud` contains `MCP_RESOURCE_URI`. A mutation test proves the
assertion isn't vacuous. **Never merge `requireMcpAuth` into `requireAuth`, never relax the
audience check, and keep `MCP_SCOPES_SUPPORTED` in step with the scope the router enforces.**

### The IdP side lives in a different repo
`~/Desktop/sliquid-sso` (`Christ-SDT/Sliquid-SSO-Portal`) is the OIDC provider that both employee
login and `/mcp` trust. MCP auth changes routinely need edits in **both** repos — this one alone is
never the whole picture. Facts that the portal side depends on:

| | |
|---|---|
| Issuer (`SSO_ISSUER`) | `https://sso-api.sliquid.com` — the API origin. **Not** `sso.sliquid.com`, which is the admin SPA. |
| JWKS | `https://sso-api.sliquid.com/oauth2/jwks`; publishes rotated keys too, so verify by `kid` |
| Access-token claims | **exactly** `iss, sub, aud, scope, iat, exp` — no `email`, no `client_id`, no `role` |
| `aud` | a single **string**, pinned per client from `oauth_clients.audience`; falls back to the **client id** when blank |
| `scope` | space-delimited **string** (not an `scp` array) |
| TTL | 10 min, and access tokens are **not revocable** — only refresh tokens are |
| Discovery | `/.well-known/openid-configuration` only; **no** `oauth-authorization-server`, no DCR, no CIMD, no introspection, no `client_credentials` |

⚠️ **The IdP silently drops scopes it does not recognise, or that the client row was not granted.**
No error, no log, no `invalid_scope` — authorize succeeds and the token is minted without the scope.
`assets:read` missing from the ChatGPT client therefore 403s every MCP call with nothing logged
anywhere. Inspect the token response's `scope` before debugging the resource server.

⚠️ **`MCP_SCOPES_SUPPORTED` must include `openid`, not just `assets:read`.** The IdP rejects any
authorize request whose effective scope set lacks `openid`, so a client that trusted our RFC 9728
metadata and requested only `assets:read` could never complete the flow.

⚠️ Audience is pinned **per client**, not requested via RFC 8707 `resource` — deliberate, because
ChatGPT's connector may not send it. Do not add `resource` plumbing expecting it to matter.

⚠️ Audit lines identify the caller by `sub` (the IdP's user UUID), because the access token carries
no email. Resolve via `users.sso_sub` or `/oauth2/userinfo` when a name is needed. The empty
`email`/`clientId` fields on `McpPrincipal` are expected here, not a bug.

⚠️ `src/packshots.ts` gates every query on a parameterless private constant
`HARD_FILTER = "m.type = 'packshot' AND m.approved = 1"`, so no argument can widen it, and it
selects `file_url` / `users` / `cert_rewards` nowhere. Byte retrieval lives separately in
`src/mcp/bytes.ts` and **fails closed** — a checksum mismatch or a null `sha256` returns no bytes.

⚠️ Do not route the MCP principal anywhere near `GET /api/media/proxy-download` — it fetches an
arbitrary caller-supplied URL server-side (an SSRF sink). It is behind `requireAuth`, so the MCP
principal cannot reach it today. Keep it that way.

⚠️ `/mcp` and `/.well-known` are deliberately **not** in `PUBLIC_PATHS` — that prefix matcher
would clamp Allow-Methods to `GET, OPTIONS` and break the POST the protocol runs on. ChatGPT is
server-to-server and sends no `Origin`, so it passes CORS already.

### Tools (all `readOnlyHint: true`, `openWorldHint: false`)
| Tool | Purpose |
|---|---|
| `search_packshots` | Resolve words to candidates. **Never auto-picks** — returns every matching size so the agent must ask. Reports discontinued status rather than "not found". |
| `get_packshot` | Retrieve one asset by `asset_id`. Rejects anything not `active`. Verifies SHA-256 before returning bytes. |
| `create_product_composition` | Composites the untouched packshot over a generated background via **sharp**. Product layer gets uniform scale + translation only — never recolor, warp, retouch, or redraw. Falls back to a solid/gradient background when `GEMINI_API_KEY` is unset. |

⚠️ `compose.ts` alpha-trims the packshot before measuring (`threshold: 0`, which can only remove
fully transparent pixels). Without it, the 1200×1200 transparent padding is measured as the
product: `scale` sizes the canvas instead of the bottle and the reflection floats below the true
bottom edge. Green tests did not catch this — a rendered visual check did.

### Key files
| Path | Purpose |
|---|---|
| `portal/server/src/mcp/server.ts` | `createMcpRouter()` — stateless Streamable HTTP, fresh `McpServer` + transport per POST (a shared instance collides request ids), 405 on GET/DELETE |
| `portal/server/src/mcp/bytes.ts` | S3 fetch + SHA-256 verification, 20-entry LRU keyed on `s3_key + sha256` |
| `portal/server/src/mcp/compose.ts` | sharp compositing; shadow/reflection drawn behind the product layer |
| `portal/server/src/packshots.ts` | Read layer; `HARD_FILTER` approval gate; numeric size matching via `parseSize` |
| `portal/server/src/middleware/mcpAuth.ts` | OAuth 2.1 resource server; audience binding; fails closed on misconfig (503) |
| `portal/server/src/routes/wellKnown.ts` | RFC 9728 `/.well-known/oauth-protected-resource` |
| `portal/server/src/mcpAudit.ts` | Structured audit lines; scrubs tokens/emails, never logs bytes |
| `portal/server/scripts/import-packshots.ts` | Loads the reviewed catalog into `media`; always `approved = 0`; resets approval when `sha256` drifts |
| `portal/server/scripts/packshot-data/` | Catalog generators + reviewed `served-catalog.json`. Images dir is gitignored |
| `portal/client/src/components/PackshotApprovalPanel.tsx` | Admin publish gate, wired as a Media page tab |

### Catalog
70 served (64 active, 6 discontinued) of 75 collected 2025 packshots. **5 are withheld** pending
brand-team identity calls — four Swirl 2 oz flavors have no SKU (the `products` table carries
Swirl in 4.2 oz only) and `Spark Studio` matches no product row. A packshot served under a guessed
identity is worse than a missing one.

⚠️ The catalog builder distinguishes a **cosmetic** filename problem (double/trailing space —
identity still certain) from an **identity** problem (no size, no match). Only the latter may
withhold an asset. Conflating them silently withheld six live Organics SKUs.

⚠️ Filename sizes are shorthand: `4z` → **4.2 oz**, `8z` → **8.5 oz**. There is no literal
"4 oz" or "8 oz" SKU — same trap documented in `rewardOptions.ts`.

## Conventions

- **Styling:** Tailwind only. Use the custom tokens (`bg-surface`, `bg-portal-bg`, `bg-surface-elevated`, `border-portal-border`, `text-portal-accent`) — do not use raw colors for structural elements.
- **Icons:** `lucide-react` exclusively.
- **API calls:** Always use `api.get/post/put/delete` from `@/api/client` — never raw `fetch`. Exception: binary downloads (CSV export), public pre-auth calls (e.g., `/api/stores` from RegisterPage), and the public certificate verify page use raw `fetch`.
- **Auth guard:** `requireAuth` for any authenticated endpoint; `requireRole('tier5', 'admin')` for admin-only write endpoints (includes legacy `admin` role for backward compat). **Never use `'tier4'` alone for admin checks** — that is now the Prospect role.
- **Migrations:** Additive only. Never drop/rename columns. Always increment version number. Next version: **58**.
- **Types:** Keep shared types in `portal/client/src/types/index.ts`. Server types are inlined where needed.
- **No auto-commit:** Never commit unless explicitly asked.
- **`AnnouncementBody.tsx` is duplicated** in `src/components/` and `portal/client/src/components/`.
  The copies are byte-identical — edit both. Never add `allow-scripts` to `BODY_SANDBOX`.
- **Timestamps written to SQLite** must go through `normalizeTs()` → `'YYYY-MM-DD HH:MM:SS'` UTC.
  An ISO string breaks `<= datetime('now')` comparisons silently (see Announcements).
- **New public API paths** must be added to `PUBLIC_PATHS` in `app.ts`, scoped as narrowly as
  possible — it is a prefix match and over-broad entries disable CORS for admin writes.
- **Video files:** `.mp4`, `.mov`, `.webm`, `.avi`, `.m4v` are in `.gitignore` — never commit large video files. Use YouTube or a CDN URL instead.
- **Stores dropdown:** Registration and admin company-edit use the `stores` table. To add/edit stores, use the admin API or the DB directly. Do not hardcode store names in client code.
- **Certificate verification URL:** Always `/verify` (no cert number in the path) — users type the cert number into the search form on that page.
- **Role badge colors:** Always solid filled (`bg-{color}-{shade} text-white`). Do not revert to transparent/muted variants — they were hard to read.
