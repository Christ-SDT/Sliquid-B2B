# Sliquid B2B

## Project Overview
B2B partner portal for Sliquid. Repository: https://github.com/Christ-SDT/Sliquid-B2B.git

The project has two top-level parts:
- **Main marketing site** — React/Vite/TypeScript at the repo root (Cloudflare Pages)
- **Partner portal** — full-stack app inside `portal/` (client + server)

### Main Site — Key Assets
- **Hero/header image:** `public/images/b2b-header-banner.png` — custom B2B Portal banner ("SLIQUID.com | B2B Portal"). Referenced via `IMG_HERO` in `src/utils/constants.ts`. Used as the full-width background in `HeroSection.tsx`.
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
- **Email:** `nodemailer` via `portal/server/src/email.ts`; gracefully skips if `SMTP_HOST` not set
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
| `portal/client/src/quizzes/index.ts` | Quiz registry |
| `portal/client/public/training/<id>/index.html` | SCORM packages |
| `portal/client/src/pages/AssetsPage.tsx` | Merged "Product Library" (Info Sheets, Digital Assets, Campaign Materials, Video tabs) |
| `portal/client/src/pages/StoreUsersPage.tsx` | "My Store" page for tier2 — read-only member list with quiz stats |
| `portal/server/src/index.ts` | Express app + route mounting + WC polling interval |
| `portal/server/src/database.ts` | DB init, migrations, seed |
| `portal/server/src/middleware/auth.ts` | `requireAuth` + `requireRole(...roles)` |
| `portal/server/src/email.ts` | nodemailer email sender |
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
# Optional — skip for no email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=you@example.com
SMTP_PASS=yourpassword
SMTP_FROM=noreply@sliquid.com
# Optional — override WooCommerce credentials (env takes precedence over DB settings)
WC_URL=https://your-store.com
WC_CONSUMER_KEY=ck_xxx
WC_CONSUMER_SECRET=cs_xxx
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

---

## Role / Tier System

### Roles
| Role | Label | Description |
|---|---|---|
| `tier1` | Retail Store Employee | Restricted access (product library, distributors, trainings) |
| `tier2` | Retail Management | Restricted access + can view their store's users (`/store-users`) |
| `tier3` | Distributor | Restricted access (product library, distributors, trainings) |
| `tier4` | Prospect | Prospect access (distributors, trainings, become a retailer only) |
| `tier5` | Admin | Full unrestricted access |

`isLimitedTier(role)` in `types/index.ts` returns `true` for tier1/2/3.
`isProspect(role)` returns `true` for tier4. `isAdmin(role)` returns `true` for tier5 or 'admin'.

**Backward-compat note:** `Sidebar.tsx` checks `role === 'tier5' || role === 'admin'` so legacy `admin` DB rows still get full admin access without migration.

**Server backward-compat:** `requireRole('tier5', 'admin')` is used for all admin-only endpoints. Never remove `'admin'` from these calls.

### Shell.tsx Access Control Lists
```ts
const RESTRICTED_ALLOWED = ['/dashboard', '/assets', '/distributors', '/trainings', '/quiz', '/store-users']
const PROSPECT_ALLOWED   = ['/dashboard', '/distributors', '/trainings', '/quiz', '/retailer']
```
Tier1/2/3 use `RESTRICTED_ALLOWED`; tier4 uses `PROSPECT_ALLOWED`; tier5/admin has unrestricted access.

### Sidebar NAV Flags
Each NAV entry has: `restricted`, `prospectVisible`, `managerOnly`, `adminOnly`.
- `adminOnly: true` → only tier5/admin sees it
- `managerOnly: true` → only tier2 or admin sees it
- `prospectVisible: true` → tier4 sees it
- `restricted: true` → tier1/2/3 see it

### Access Matrix
| Route | tier1 | tier2 | tier3 | tier4 (Prospect) | tier5 (Admin) |
|---|---|---|---|---|---|
| `/dashboard` | ✓ (mini) | ✓ (mini) | ✓ (mini) | ✓ (mini) | ✓ (full stats) |
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

Restricted tiers redirected to `/dashboard` for any disallowed route (enforced in `Shell.tsx`).

### Self-Registration
`POST /api/auth/register` accepts an optional `role` field. Valid values: `tier1`, `tier2`, `tier3`, `tier4` (Prospect). Defaults to `tier1`. `tier5` cannot be self-registered.

The `company` field on registration is populated via a **dropdown** from `GET /api/stores` (public endpoint, no auth required). If no stores exist, falls back to a free-text input.

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

**Next migration version: 8**

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
| POST | `/login` | — | Returns `{ token, user }` |
| POST | `/register` | — | Accepts `name, email, company, password, role` |
| GET | `/me` | requireAuth | Returns current user |

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
| POST | `/` | tier5/admin only | Create asset |

### Distributors — `/api/distributors`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List distributors |

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
| POST | `/` | tier5/admin only | Create creative |

### Quiz — `/api/quiz`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/complete` | requireAuth | Save quiz result; emails cert if score ≥ 70 |
| GET | `/results` | requireAuth | Get current user's quiz results |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | tier5/admin only | List all users (id, name, email, company, role, created_at) |
| PUT | `/users/:id/role` | tier5/admin only | Update a user's role; valid values: tier1–tier5 |
| PUT | `/users/:id/company` | tier5/admin only | Update a user's company to a store name from the stores table |

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
- **Pass threshold:** score ≥ 70 triggers a completion email (if SMTP configured)

### Registered Quizzes
| Order | ID | Title | Video |
|---|---|---|---|
| 1 | `h2o-vs-sassy` | H2O vs Sassy | YouTube `https://youtu.be/r9ttBy_WlfA` |
| 2 | `sea-vs-tsunami` | Sea vs Tsunami | YouTube `https://youtu.be/lFVvtQfOb8Y` |

**Notes:**
- `sliquiz` (Customer Service Skills) was replaced by `h2o-vs-sassy` — do not re-add it.
- Quiz order in `QUIZZES` array determines "Go to Next Module" navigation on the pass screen.
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
2. Add an entry to `portal/client/src/quizzes/index.ts` (position in array = module order)
3. Optionally set `videoPath` to a YouTube URL to enable the video-first flow (see below)

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
- `notes` field accepted by server (stored for future warehouse accounts, currently ignored in DB)

---

## Product Library (`/assets`)

`AssetsPage.tsx` is the merged "Product Library" combining `/api/assets` and `/api/creatives` data in one page. `/creatives` route and `CreativesPage.tsx` have been **deleted**.

### Tabs
| Tab key | Label | Data source | Asset types included |
|---|---|---|---|
| `sheets` | Info Sheets | assets (Document) + creatives (Print) | — |
| `assets` | Digital Assets | assets only | Logo, Banner, Social |
| `campaign` | Campaign Materials | creatives only | Banner, Social Media, Email, Multi |
| `video` | Video Assets | creatives only | Video |

Both APIs fetched in parallel via `Promise.all` on mount. Results merged client-side with a `_source: 'asset' | 'creative'` discriminant and unified `displayName` field (assets use `name`, creatives use `title`).

### LibraryCard Component
- Handles both asset and creative data shapes
- Download button works for both sources
- Copy-URL button shown only for assets (has `file_url` field)
- Brand filter and search work across all tabs

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
- Optional env vars: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`

---

## Conventions

- **Styling:** Tailwind only. Use the custom tokens (`bg-surface`, `bg-portal-bg`, `bg-surface-elevated`, `border-portal-border`, `text-portal-accent`) — do not use raw colors for structural elements.
- **Icons:** `lucide-react` exclusively.
- **API calls:** Always use `api.get/post/put/delete` from `@/api/client` — never raw `fetch`. Exception: binary downloads (CSV export) and public pre-auth calls (e.g., `/api/stores` from RegisterPage) use raw `fetch`.
- **Auth guard:** `requireAuth` for any authenticated endpoint; `requireRole('tier5', 'admin')` for admin-only write endpoints (includes legacy `admin` role for backward compat). **Never use `'tier4'` alone for admin checks** — that is now the Prospect role.
- **Migrations:** Additive only. Never drop/rename columns. Always increment version number. Next version: **8**.
- **Types:** Keep shared types in `portal/client/src/types/index.ts`. Server types are inlined where needed.
- **No auto-commit:** Never commit unless explicitly asked.
- **Video files:** `.mp4`, `.mov`, `.webm`, `.avi`, `.m4v` are in `.gitignore` — never commit large video files. Use YouTube or a CDN URL instead.
- **Stores dropdown:** Registration and admin company-edit use the `stores` table. To add/edit stores, use the admin API or the DB directly. Do not hardcode store names in client code.
