# Ops scripts

## `import-packshots.ts`

Loads the reviewed 2025 product packshots into the portal's `media` table so the
MCP product-image tools (`src/packshots.ts`) can serve them.

It uploads each PNG to S3 and upserts one `media` row per packshot. **Every row is
written unapproved.** Approval is a human action taken in the portal Media page —
this script never approves anything.

---

### Prerequisites

| Requirement | Notes |
|---|---|
| Node + deps installed | `cd portal/server && npm install` |
| Migration **v56** applied | Adds `sku`, `unit_size`, `package_version`, `packshot_status`, `approved`, `sha256`, `asset_key` to `media`. Start the server once against the target DB to apply pending migrations. The script refuses a live run if these columns are absent. |
| The 75 PNGs staged on disk | See [Where the images live](#where-the-images-live). |
| S3 credentials | See below. |

### Environment variables

Read from `portal/server/.env` (via `dotenv`) or the shell.

| Variable | Required | Notes |
|---|---|---|
| `S3_BUCKET` | **yes** | Also required with `--skip-upload` — it is baked into the `file_url` on every row. |
| `AWS_ACCESS_KEY_ID` | yes | Not needed with `--skip-upload`. |
| `AWS_SECRET_ACCESS_KEY` | yes | Not needed with `--skip-upload`. |
| `AWS_REGION` | no | Defaults to `us-east-1`. |
| `DB_PATH` | no | Defaults to `./data/portal.db`. Point this at the production volume path when running against prod. |

A live run **aborts** if the S3 variables are missing. A dry run continues and
tells you it would have been refused, so the plan is still reviewable on a
machine with no credentials.

---

### 1. Dry run first — always

```bash
cd portal/server
npx tsx scripts/import-packshots.ts --dry-run
```

Touches nothing: no S3 calls, no database writes (it opens the DB **read-only**
purely to confirm the v56 columns exist). It prints:

- the SHA-256 verification result for all 70 served files,
- the full planned action list — display name, SKU, status, and target S3 key,
- a status breakdown table,
- the withheld items and why they are blocked.

Read the plan. Confirm the S3 keys and the row count look right.

### 2. Run it for real

```bash
npx tsx scripts/import-packshots.ts --yes
```

`--yes` is the only thing that permits writes. Without it, the run is a dry run
regardless of whether you passed `--dry-run`.

The script:

1. Re-verifies **every** file's SHA-256 against the catalog. Any mismatch aborts
   the entire run, naming the file — nothing is uploaded.
2. Uploads all 70 PNGs to `packshots/2025/<slug>.png` (5 at a time). If any
   upload fails, it aborts *before* writing a single database row.
3. Upserts the `media` rows in one transaction, keyed on `asset_key`.

It is **idempotent**. Re-running updates in place and never duplicates.

### 3. After the run — approve them

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
| `--dry-run` | Preview only. Also the default when `--yes` is absent. |
| `--yes` | Required to actually upload and write. |
| `--skip-upload` | Skip the S3 upload and only re-sync `media` metadata. Use when the objects are already in the bucket and you have re-generated the catalog. Still needs `S3_BUCKET`. |
| `--reset-approvals` | Force `approved = 0` on every row, discarding existing human approvals. |
| `--help` | Usage. |

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

If the directory is absent, the script aborts with a pointer here. Restore it by
placing the 75 PNGs — named exactly as the catalog's `filename` fields — into
`portal/server/scripts/packshot-data/images/`, from either the original 2025
collection exports or the `packshots/2025/` prefix of the S3 bucket. The SHA-256
gate will tell you immediately if any file is wrong.

---

### Regenerating the catalog

Only needed when new packshots arrive or a withheld item gets a decision. The
three generators in `packshot-data/` run in order; each one only proposes, and a
human decides.

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
```

Then dry-run the importer again and diff the plan before running with `--yes`.

`catalog.json` and `sku-map.json` are intermediates. `served-catalog.json` and
`overrides.json` are the artifacts that matter and are version-controlled.

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

The importer reprints this list at the end of every run, dry or live, so it
cannot be quietly forgotten.

---

### Typechecking

The root `tsconfig.json` only includes `src`, so scripts need their own project:

```bash
cd portal/server
npx tsc --noEmit -p scripts/tsconfig.json
```

---

### Catalog shape

`served-catalog.json`:

```jsonc
{
  "version": 1,
  "generated_at": "2026-08-13T21:49:49.105Z",
  "counts":   { "served": 70, "active": 58, "discontinued": 6, "withheld": 5 },
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
