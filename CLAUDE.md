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
| `portal/client/src/types/index.ts` | Shared TS types, `TIER_LABEL`, `isLimitedTier()` |
| `portal/client/src/components/layout/Shell.tsx` | Auth guard + route restriction enforcement |
| `portal/client/src/components/layout/Sidebar.tsx` | Navigation with role-based filtering |
| `portal/client/src/quizzes/index.ts` | Quiz registry |
| `portal/client/public/training/<id>/index.html` | SCORM packages |
| `portal/server/src/index.ts` | Express app + route mounting + WC polling interval |
| `portal/server/src/database.ts` | DB init, migrations, seed |
| `portal/server/src/middleware/auth.ts` | `requireAuth` + `requireRole(...roles)` |
| `portal/server/src/email.ts` | nodemailer email sender |
| `portal/server/src/woocommerce.ts` | WooCommerceService class + `runWooSync()` |
| `portal/server/src/routes/woo.ts` | WooCommerce API routes |

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
| `tier1` | Tier 1 (Retail Store Employee) | Restricted access |
| `tier2` | Tier 2 (Ecommerce) | Restricted access |
| `tier3` | Tier 3 (Distributor) | Restricted access |
| `tier4` | Admin | Full access |

`isLimitedTier(role)` in `types/index.ts` returns `true` for tier1/2/3.

**Backward-compat note:** `Sidebar.tsx` checks `role === 'tier4' || role === 'admin'` (via a `string` cast) so admins whose DB row hasn't been migrated yet by v4 still see the Users nav item.

### Access Matrix
| Route | tier1 | tier2 | tier3 | tier4 |
|---|---|---|---|---|
| `/dashboard` | ✓ (mini widgets) | ✓ (mini widgets) | ✓ (mini widgets) | ✓ (full stats) |
| `/assets` | ✓ | ✓ | ✓ | ✓ |
| `/distributors` | ✓ | ✓ | ✓ | ✓ |
| `/trainings` | ✓ | ✓ | ✓ | ✓ |
| `/quiz/:id` | ✓ | ✓ | ✓ | ✓ |
| `/products` | ✗ | ✗ | ✗ | ✓ |
| `/inventory` | ✗ | ✗ | ✗ | ✓ |
| `/invoices` | ✗ | ✗ | ✗ | ✓ |
| `/stats` | ✗ | ✗ | ✗ | ✓ |
| `/creatives` | ✗ | ✗ | ✗ | ✓ |
| `/retailer` | ✗ | ✗ | ✗ | ✓ |
| `/users` | ✗ | ✗ | ✗ | ✓ |

Restricted tiers redirected to `/dashboard` for any disallowed route (enforced in `Shell.tsx`).

### Self-Registration
`POST /api/auth/register` accepts an optional `role` field. Valid values: `tier1`, `tier2`, `tier3`. Defaults to `tier1`. `tier4` cannot be self-registered.

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

### Seed Users (new DB only)
| Email | Password | Role |
|---|---|---|
| admin@sliquid.com | admin123 | tier4 |
| partner@demo.com | partner123 | tier2 |
| distributor@demo.com | dist123 | tier3 |

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
| POST | `/` | tier4 only | Create product |
| POST | `/import` | tier4/admin | Upsert products by SKU from `{ rows }` array; returns `{ inserted, updated, errors }` |

### Assets — `/api/assets`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List assets (filters: brand, type, search) |
| GET | `/:id` | requireAuth | Get single asset |
| POST | `/` | tier4 only | Create asset |

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
| POST | `/restock` | requireAuth | Add 50 units to an item (legacy) |

### Stats — `/api/stats`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/overview` | requireAuth | Returns totals for dashboard stats cards |

### Creatives — `/api/creatives`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | requireAuth | List creatives |
| POST | `/` | tier4 only | Create creative |

### Quiz — `/api/quiz`
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/complete` | requireAuth | Save quiz result; emails cert if score ≥ 70 |
| GET | `/results` | requireAuth | Get current user's quiz results |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | tier4 only | List all users (id, name, email, company, role, created_at) |
| PUT | `/users/:id/role` | tier4 only | Update a user's role |

### WooCommerce — `/api/woo`
All endpoints require `requireAuth + requireRole('tier4', 'admin')`.

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
| ID | Title | Video |
|---|---|---|
| `sliquiz` | Customer Service Skills | — |
| `sea-vs-tsunami` | Sea vs Tsunami | YouTube `https://youtu.be/lFVvtQfOb8Y` |

### Adding a New Quiz
1. Drop the SCORM package into `portal/client/public/training/<new-id>/`
2. Add an entry to `portal/client/src/quizzes/index.ts`
3. Optionally set `videoPath` to a YouTube URL or CDN URL to enable the video-first flow (see below)

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

- Clicking any row in `/inventory` opens `StockEditModal` (pre-filled with current quantity).
- On save: calls `PUT /api/inventory/:id/quantity`, updates the row optimistically.
- If WooCommerce is configured, a 20-second toast appears (`WooSyncToast`).
  - After 20s: `POST /api/woo/sync-product` pushes the new stock to WooCommerce.
  - Cancel: clears the timer and reverts the quantity via another `PUT /api/inventory/:id/quantity`.

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
- Section below the users table in `/users`.
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
- **API calls:** Always use `api.get/post/put/delete` from `@/api/client` — never raw `fetch`. Exception: binary downloads (CSV export) must use raw `fetch` to get a `Blob`.
- **Auth guard:** `requireAuth` for any authenticated endpoint; `requireRole('tier4', 'admin')` for admin-only write endpoints (includes legacy `admin` role for backward compat).
- **Migrations:** Additive only. Never drop/rename columns. Always increment version number. Next version: **6**.
- **Types:** Keep shared types in `portal/client/src/types/index.ts`. Server types are inlined where needed.
- **No auto-commit:** Never commit unless explicitly asked.
- **Video files:** `.mp4`, `.mov`, `.webm`, `.avi`, `.m4v` are in `.gitignore` — never commit large video files. Use YouTube or a CDN URL instead.
