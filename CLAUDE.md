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
| `portal/server/src/notifications.ts` | `notifyAdmins(type, title, message, link?)` + `notifyUsers(...)` helpers |
| `portal/server/src/routes/notifications.ts` | GET `/`, PUT `/read-all`, PUT `/:id/read` |
| `portal/server/src/routes/certificates.ts` | GET `/mine` (auth) + GET `/verify/:certNumber` (public) |
| `portal/server/src/index.ts` | Express app + route mounting + WC polling interval |
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

`isLimitedTier(role)` in `types/index.ts` returns `true` for tier1/2/3.
`isProspect(role)` returns `true` for tier4. `isAdmin(role)` returns `true` for tier5 or 'admin'.

**Role badge colors** — defined in `roleBadgeClass()` in `UsersPage.tsx`. Uses solid filled Tailwind classes (e.g. `bg-violet-600 text-white`) for strong readability. Do not revert to transparent/muted variants.

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
| `/verify` | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) | ✓ (public) |

`/verify` is outside `<Shell>` — no auth required, accessible to anyone.

Restricted tiers redirected to `/dashboard` for any disallowed route (enforced in `Shell.tsx`).

### Self-Registration
`POST /api/auth/register` accepts an optional `role` field. Valid values: `tier1`, `tier2`, `tier3`, `tier4` (Prospect). Defaults to `tier1`. `tier5` cannot be self-registered.

The `company` field on registration is populated via an **incremental search combobox** backed by `GET /api/stores` (public endpoint, no auth required). Typing filters the list in real-time; selecting commits the value to a hidden input for form validation. If no stores exist, falls back to a free-text input.

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

**Next migration version: 34**

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
| GET | `/verify/:certNumber` | **Public** | Returns `{ valid, fullName, firstName, lastName, completionDate, certificateNumber }`; 404 if not found or revoked |

### Admin — `/api/admin`
| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/users` | tier5/admin only | List all users; includes `last_login` and `certificate_number` (null if not certified) via LEFT JOIN |
| PUT | `/users/:id/role` | tier5/admin only | Update a user's role; valid values: tier1–tier5 |
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

### Cert Reward Form (`portal/client/src/components/CertRewardForm.tsx`)
Gate shown **before** the certificate download, one time only per user. Collects:
- **Name** — pre-filled from cert data, read-only
- **Free product** — text input with `<datalist>` autocomplete populated from `GET /api/products`
- **T-shirt size** — dropdown (XS, S, M, L, XL, 2XL, 3XL)
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

### When Notifications Are Created
| Trigger | Type | Recipients |
|---|---|---|
| Inventory status transitions to `low_stock` | `low_stock` | Admins only |
| Inventory status transitions to `out_of_stock` | `out_of_stock` | Admins only |
| New asset added (`POST /api/assets`) | `new_asset` | All non-admin users |
| New creative added (`POST /api/creatives`) | `new_asset` | All non-admin users |

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

### Key Test Coverage — Certification
- `quiz.test.ts` (18 tests): no cert when no trainings; no cert on partial pass; no cert on failed quiz; cert issued when all passed; cert number format `SLQ-\d{4}-[A-F0-9]{6}`; no duplicate cert on retake; per-user isolation
- `certificates.test.ts` (25 tests):
  - `GET /mine`: 401 no auth; 404 no cert; correct data shape; `rewardSubmitted: false` before reward; `rewardSubmitted: true` after reward; user isolation; revoked cert 404
  - `POST /reward`: 401 no auth; 403 no cert; 400 for each missing required field (product, shirtSize, address1, city, state, zip); 201 + DB row verified; address2 optional; idempotent (second call returns 200, no duplicate); per-user isolation; round-trip confirms `rewardSubmitted` flips to `true`
  - `GET /verify/:certNumber`: unknown 404; revoked 404; valid 200 + full shape; public (no auth); case-sensitive lookup

**Total: 123 tests passing across 11 test files**

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
- Optional env vars: `EMAILJS_PUBLIC_KEY`, `EMAILJS_PRIVATE_KEY`, `EMAILJS_SERVICE_ID`, `PORTAL_URL`, `WC_URL`, `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`

---

## Conventions

- **Styling:** Tailwind only. Use the custom tokens (`bg-surface`, `bg-portal-bg`, `bg-surface-elevated`, `border-portal-border`, `text-portal-accent`) — do not use raw colors for structural elements.
- **Icons:** `lucide-react` exclusively.
- **API calls:** Always use `api.get/post/put/delete` from `@/api/client` — never raw `fetch`. Exception: binary downloads (CSV export), public pre-auth calls (e.g., `/api/stores` from RegisterPage), and the public certificate verify page use raw `fetch`.
- **Auth guard:** `requireAuth` for any authenticated endpoint; `requireRole('tier5', 'admin')` for admin-only write endpoints (includes legacy `admin` role for backward compat). **Never use `'tier4'` alone for admin checks** — that is now the Prospect role.
- **Migrations:** Additive only. Never drop/rename columns. Always increment version number. Next version: **15**.
- **Types:** Keep shared types in `portal/client/src/types/index.ts`. Server types are inlined where needed.
- **No auto-commit:** Never commit unless explicitly asked.
- **Video files:** `.mp4`, `.mov`, `.webm`, `.avi`, `.m4v` are in `.gitignore` — never commit large video files. Use YouTube or a CDN URL instead.
- **Stores dropdown:** Registration and admin company-edit use the `stores` table. To add/edit stores, use the admin API or the DB directly. Do not hardcode store names in client code.
- **Certificate verification URL:** Always `/verify` (no cert number in the path) — users type the cert number into the search form on that page.
- **Role badge colors:** Always solid filled (`bg-{color}-{shade} text-white`). Do not revert to transparent/muted variants — they were hard to read.
