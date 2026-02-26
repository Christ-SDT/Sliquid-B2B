# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Canonical location:** `portal/client/public/training/sliquiz/` inside the Sliquid-B2B portal project. Served as a static asset at `/training/sliquiz/index.html`.

## What This Is

This is a **SCORM 1.2 e-learning package** exported from **Adobe Captivate 13.0.0**. The course is titled "Customer Service Skills" (10 slides, 1366×768, responsive). It is a deployment artifact — there is no build system, package manager, or source project here. The files are the final output ready to be uploaded to an LMS.

To author or modify course content, the original Captivate source file (`.cptx`) is required and must be re-exported.

## Entry Point & Script Loading

`index.html` is the SCORM SCO entry point (referenced in `imsmanifest.xml`). On body load, it calls `Start()` (from `scormdriver.js`) and then dynamically appends four scripts in order:

1. `assets/js/project.js` — Captivate project data and app logic (~1.8 MB)
2. `dist/main.chunk.js` — Main application chunk (~2.1 MB, brotli: `.br`)
3. `dist/runtime-main.bundle.js` — Webpack runtime
4. `dist/vendors-main.chunk.js` — Third-party libraries (~5.2 MB, brotli: `.br`)

The React app mounts into `<div id="app">`.

## Key Files

| File | Purpose |
|---|---|
| `imsmanifest.xml` | SCORM package manifest; lists all resources |
| `scormdriver.js` | SCORM runtime driver — handles LMS communication (791 KB) |
| `SCORM_utilities.js` | SCORM API wrapper; sets `CONFIG` (course title, dimensions) and functions like `DoFinish()`, `Unload()` |
| `Utilities.js` | Debug helpers: `CheckForDebugCommand` (press `?` three times to open debug window), `DoCPExit`, `trace` |
| `browsersniff.js` | Browser/OS detection |
| `project.txt` | JSON project metadata from Captivate (slide structure, object instances, roles) |
| `pools/247/247.js` | Question pool initialization (currently empty pool `247`) |
| `goodbye.html` | Shown after the learner exits the course |

## Directory Layout

- `ar/` — Audio resources (`KeyClick.mp3`)
- `assets/htmlimages/` — UI images for quiz feedback (checkbox/radio correct/incorrect states, certificate download icon)
- `assets/js/` — Generated project JS
- `dist/` — Webpack-built JS chunks
- `dr/` — Course media (slide images and loading gif)
- `pools/247/` — Question pool data; subdirs `ar/`, `callees/`, `dr/`, `vr/` mirror the root structure for pool-specific assets
- `vr/`, `callees/` — Reserved directories for VR and callee assets (empty)

## SCORM Communication Flow

`SCORM_utilities.js` → `scormdriver.js` → LMS. The global `USE_LEGACY_IDENTIFIERS_FOR_2004 = true` flag is set in `index.html`, and `REVIEW_MODE_IS_READ_ONLY = false`. `window.onbeforeunload` calls `window.Unload()` to commit data before the window closes.

## Running Locally

SCORM packages must be served over HTTP (not `file://`) due to browser security restrictions. Use any static file server:

```sh
npx serve .
# or
python3 -m http.server 8080
```

A proper SCORM runtime/LMS (e.g., SCORM Cloud, Rustici Engine, or a local wrapper like `scorm-again` test harness) is needed to exercise LMS communication. Without an LMS, the course will still render but SCORM data will not be tracked.
