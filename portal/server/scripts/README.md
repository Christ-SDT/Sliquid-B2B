# Ops scripts

## `importPackshots` — `src/scripts/importPackshots.ts`

Loads the reviewed 2025 product packshots into the portal's `media` table so the
MCP product-image tools (`src/packshots.ts`) can serve them.

It uploads each PNG to S3 and upserts one `media` row per packshot. **Every row is
written unapproved.** Approval is a human action taken in the portal Media page —
this script never approves anything.

> The implementation lives under **`src/`**, not in this directory. See
> [Why it lives under `src/`](#why-it-lives-under-src). This directory keeps the
> catalog-authoring workspace (`packshot-data/`) and this README.

---

### The three-way problem, and the two-phase answer

The import needs three things that never coexist in one place:

| Needs | Only exists |
|---|---|
| the 75 PNG masters | **locally** — `scripts/packshot-data/images/`, 52 MB, gitignored |
| S3 credentials | **Railway env** (injectable locally with `railway run`) |
| the SQLite database | **Railway volume only** — `DB_PATH=/data/portal.db`, no network access |

So the run is split. Phase 1 runs on a workstation, which has the bytes. Phase 2
runs *inside the container*, which is the only place the database is reachable.

```bash
cd portal/server

# phase 1 — locally, S3 creds injected from Railway, no DB touched
railway run npx tsx src/scripts/importPackshots.ts --upload-only --dry-run
railway run npx tsx src/scripts/importPackshots.ts --upload-only --yes

# phase 2 — inside the container, where the volume DB lives
railway ssh node dist/scripts/importPackshots.js --db-only --verify-objects --yes
```

`--verify-objects` is what makes the split safe: the two phases run from
different machines, so the DB phase cannot otherwise know that phase 1 landed. It
`HeadObject`s every key first and aborts — writing nothing — if any is absent, so
a `media` row can never point at a missing object.

For a **local end-to-end** run (images *and* a local DB both present), pass
neither flag and both phases run back to back:

```bash
npx tsx src/scripts/importPackshots.ts --dry-run
npx tsx src/scripts/importPackshots.ts --yes
```

#### Why it lives under `src/`

Phase 2 has to execute inside the container, and the container cannot run
anything in `scripts/`: the `Dockerfile` copies only `src`, and
`npm prune --omit=dev` strips `tsx`. Under `src/` the script is compiled by `tsc`
into `dist/scripts/importPackshots.js` and runs on plain `node` — **zero
Dockerfile changes**, because:

- `tsconfig.json` has `rootDir: src` / `outDir: dist`, so `src/scripts/*.ts` →
  `dist/scripts/*.js` automatically;
- the Dockerfile already ends its build step with `cp -r src/assets dist/`, so
  the catalog placed at **`src/assets/packshot-catalog.json`** lands at
  `dist/assets/packshot-catalog.json`.

The relative path from the script to the catalog is
`../assets/packshot-catalog.json` in **both** layouts (`src/scripts` → `src/assets`,
`dist/scripts` → `dist/assets`), so one expression serves local `tsx` and
containerised `node` alike.

#### The DB import is lazy, and must stay that way

`src/database.ts` opens the database **and runs migrations at import time**.
`railway run` injects `DB_PATH=/data/portal.db`, which does not exist on a laptop.
A top-level `import … from '../database.js'` would therefore make `--upload-only`
crash under exactly the command it exists to serve.

The script reaches it only through `await import('../database.js')` inside the DB
phase. If you refactor, keep it that way; the regression is:

```bash
DB_PATH=/data/portal.db npx tsx src/scripts/importPackshots.ts --upload-only --dry-run
# must succeed, exit 0
```

Symmetrically, `--db-only` never stats or reads the images directory — it does
not exist in the container.

---

### Prerequisites

| Requirement | Phase | Notes |
|---|---|---|
| Node + deps installed | 1 | `cd portal/server && npm install` |
| Migrations **v56 + v57** applied | 2 | v56 adds `sku`, `unit_size`, `package_version`, `packshot_status`, `approved`, `sha256`, `asset_key`; v57 adds `approved_by`, `approved_at`. The server applies them on boot, so a deployed container is already migrated. The script refuses a live DB phase if any are absent. |
| The 75 PNGs staged on disk | 1 | See [Where the images live](#where-the-images-live). |
| S3 credentials | 1, and 2 with `--verify-objects` | See below. |

### Environment variables

Read from `portal/server/.env` (via `dotenv`) or the shell. Real environment
variables win over `.env`, which is what makes `railway run` work.

| Variable | Required | Notes |
|---|---|---|
| `S3_BUCKET` | **both phases** | Phase 1 PUTs into it; phase 2 bakes it into the `file_url` on every row. |
| `AWS_ACCESS_KEY_ID` | phase 1; phase 2 only with `--verify-objects` | |
| `AWS_SECRET_ACCESS_KEY` | phase 1; phase 2 only with `--verify-objects` | |
| `AWS_REGION` | no | Defaults to `us-east-1`. Also part of `file_url`. |
| `DB_PATH` | phase 2 | Defaults to `./data/portal.db`. In the container it is `/data/portal.db`. Ignored entirely by `--upload-only`. |
| `PACKSHOT_IMAGES_DIR` | no | Overrides where the PNG masters are read from. Defaults to `portal/server/scripts/packshot-data/images`. Phase 1 only. |

A live run **aborts** if the S3 variables it needs are missing. A dry run
continues and tells you it would have been refused, so the plan is still
reviewable on a machine with no credentials.

---

### Dry run first — always

Every mode supports `--dry-run`, and it is also the default whenever `--yes` is
absent. `--yes` is the only thing that permits a write.

A dry run touches nothing: no S3 PUT, no database write (it opens the DB
**read-only**, purely to confirm the packshot columns exist — and only in a DB
phase). It prints:

- the SHA-256 verification result for all 70 served files (phase 1),
- the full planned action list — display name, SKU, status, and target S3 key,
- with `--verify-objects`, the presence check against the bucket (a read, so it
  runs in a dry run too — the cheapest way to confirm phase 1 landed),
- a status breakdown table,
- the withheld items and why they are blocked.

Read the plan. Confirm the S3 keys and the row count look right.

### What a live run does

1. **Phase 1** re-verifies **every** file's SHA-256 against the catalog. Any
   mismatch aborts the entire run, naming the file — nothing is uploaded. Then it
   uploads all 70 PNGs to `packshots/2025/<slug>.png`, 5 at a time. If any upload
   fails it aborts before the DB phase.
2. **Phase 2** optionally `HeadObject`s all 70 keys (`--verify-objects`), then
   upserts the `media` rows in one transaction, keyed on `asset_key`.

It is **idempotent**. Re-running updates in place and never duplicates.

### After the run — approve them

Imported rows are invisible to the MCP tools until approved. `src/packshots.ts`
filters on `type='packshot' AND approved=1` in every query, including exact
`asset_id` lookups, so an unapproved packshot is not merely unlisted — it cannot
be reached at all.

**Sign in to the portal as an admin (tier5) and go to Media Library (`/media`)
to approve them.**

---

### Flags

| Flag | Effect |
|---|---|
| `--upload-only` | Verify checksums and PUT to S3. **Never opens the database** — not even read-only. |
| `--db-only` | Upsert `media` rows from the catalog. **Never reads the images directory.** Still needs `S3_BUCKET` for `file_url`. |
| `--verify-objects` | DB phase only: `HeadObject` every S3 key before writing its row; abort, writing nothing, if any is missing. Rejected with `--upload-only`. |
| _(neither phase flag)_ | Both phases, back to back. For local end-to-end runs. |
| `--dry-run` | Preview only. Also the default when `--yes` is absent. |
| `--yes` | Required to actually upload or write. |
| `--reset-approvals` | Force `approved = 0` on every row, discarding existing human approvals. |
| `--skip-upload` | Deprecated alias for `--db-only`. |
| `--help`, `-h` | Usage. |

`--upload-only` and `--db-only` are mutually exclusive.

### How `approved` behaves on a re-run

The script never writes `approved = 1`. On re-import of a row that already exists:

- stored `sha256` **matches** the catalog → an existing human approval is
  **preserved** (the bytes a human approved are still the bytes there);
- stored `sha256` **differs** → approval is **reset to 0**, because the human
  approved different bytes and the new ones need a fresh look;
- `--reset-approvals` → always reset to 0.

---

### Where the images live

```
scripts/packshot-data/images/     # 75 PNGs, ~52 MB — NOT in version control
```

This directory is **gitignored** (root `.gitignore`, rule
`portal/server/scripts/packshot-data/images/`). The repo's `.git` is already
large; 52 MB of binaries that are also in S3 do not belong in it. The JSON
catalog and the generator scripts beside it *are* tracked — that is the reviewed
metadata and it must stay in version control.

If the directory is absent, phase 1 aborts with a pointer here. Restore it by
placing the 75 PNGs — named exactly as the catalog's `filename` fields — into
`portal/server/scripts/packshot-data/images/`, from either the original 2025
collection exports or the `packshots/2025/` prefix of the S3 bucket. Or point
`PACKSHOT_IMAGES_DIR` at wherever they already are. The SHA-256 gate will tell
you immediately if any file is wrong.

---

### Regenerating the catalog

Only needed when new packshots arrive or a withheld item gets a decision. This
directory is the **catalog-authoring workspace**; the three generators run in
order, and each one only proposes — a human decides.

```bash
cd portal/server/scripts/packshot-data

# 1. Parse filenames into a draft catalog. Conservative: anything ambiguous is
#    marked needs_review / pending_approval rather than guessed.
node build-catalog.mjs ./images ./catalog.json

# 2. Propose filename → SKU matches against the products table. Scored; anything
#    below the confidence bar is emitted for review, never auto-accepted.
node map-skus.mjs ./catalog.json ../../data/portal.db ./sku-map.json

# 3. Review the output of step 2, then record every decision in overrides.json
#    (see its `resolved` and `unresolved` sections).

# 4. Merge into the served catalog. Human overrides beat the matcher; anything
#    still listed as unresolved is withheld rather than served with a guess.
node merge-catalog.mjs ./catalog.json ./sku-map.json ./overrides.json \
     ../../data/portal.db ./served-catalog.json

# 5. Publish it to where the script and the container read it from.
cp ./served-catalog.json ../../src/assets/packshot-catalog.json
```

**Step 5 is not optional.** `served-catalog.json` here is the authoring output;
`src/assets/packshot-catalog.json` is the *published* copy the importer reads and
the Dockerfile ships. Skip it and the import silently uses the previous catalog.

Then dry-run the importer again and diff the plan before running with `--yes`.

`catalog.json` and `sku-map.json` are intermediates. `served-catalog.json`,
`overrides.json` and `src/assets/packshot-catalog.json` are the artifacts that
matter and are version-controlled.

> A packshot with no confirmed identity is worse than a missing one — the point
> of the whole pipeline is that the agent cannot show the wrong bottle. Never
> resolve an entry by guessing to make the count go up.

---

### The 5 withheld items

These are **intentionally not imported**. They have no confirmed identity, so
serving them risks showing the wrong product. They need a brand-team decision
recorded in `overrides.json` before they can be included.

| File | Blocked on | Question |
|---|---|---|
| `Spark Studio 2025.png` | product identity and size | No "Spark Studio" row exists. Candidates: Studio Collection – Silver (SKU 084, 3.4 oz), or a Studio-size Naturals Spark. |
| `Swirl Blue Rasberry 2z 2025.png` | SKU existence | Products table has Swirl flavors in 4.2 oz only. Is there a 2 oz Swirl SKU missing from the catalog, or was this size never released? |
| `Swirl Green Apple 2z 2025.png` | SKU existence | Same question. |
| `Swirl Tangerine peach 2z 2025.png` | SKU existence | Same question. |
| `Swirl Trawberry Pomegranate 2z 2025.png` | SKU existence | Same question. Filename also misspells "Strawberry". |

The importer reprints this list at the end of every run — dry or live, either
phase — so it cannot be quietly forgotten.

---

### Typechecking

The script is inside `src`, so the root project covers it. There is no longer a
separate `scripts/tsconfig.json`:

```bash
cd portal/server
npx tsc --noEmit
```

`src/scripts/**` is excluded from coverage in `vitest.config.ts`, for the same
reason `src/index.ts` is: it calls `main()` at import time. **No logic that needs
a test belongs in it.**

---

### Catalog shape

`src/assets/packshot-catalog.json` (published from
`scripts/packshot-data/served-catalog.json`):

```jsonc
{
  "version": 1,
  "generated_at": "2026-08-13T22:12:01.484Z",
  "counts":   { "served": 70, "active": 64, "discontinued": 6, "withheld": 5 },
  "assets":   [ /* 70 served packshots */ ],
  "withheld": [ /* 5 blocked items with reasons */ ]
}
```

Each asset carries `asset_id, sku, product, display_name, size, collection,
category, brand, upc, package_version, status, filename, mime_type, bytes,
sha256, provenance`. The script validates this with zod and additionally rejects
duplicate `asset_id`s, duplicate filenames, and slug collisions (two filenames
that would map to the same S3 key).

`counts` is informational only — the script tallies statuses from `assets`
itself, so a stale `counts` block cannot misreport a run.

### Column mapping

| `media` column | Source |
|---|---|
| `filename` | `filename` |
| `label` | `display_name` |
| `brand` | `brand` |
| `s3_key` | `packshots/2025/<slugified filename>.png` |
| `file_url` | `https://<bucket>.s3.<region>.amazonaws.com/<s3_key>` |
| `file_size` | `bytes`, formatted `"NNN KB"` (matches `routes/media.ts`) |
| `mime_type` | `mime_type` |
| `dimensions` | constant `1200x1200` |
| `uploaded_by` | constant `packshot-import` |
| `type` | constant `packshot` |
| `sku` | `sku` (nullable — discontinued items have no products row) |
| `unit_size` | `size` |
| `package_version` | `package_version` |
| `packshot_status` | `status` |
| `sha256` | `sha256` |
| `asset_key` | `asset_id` — the idempotency key |
| `approved` | always `0` on insert; see the re-run rules above |
