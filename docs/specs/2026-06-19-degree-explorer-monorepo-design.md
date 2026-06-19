# Degree Explorer Kiosk Monorepo — Design

**Date:** 2026-06-19
**Repo to create:** `centralpiedmont/degree-explorer` (public)
**Status:** Approved design, ready for implementation plan

## Problem

The Central Piedmont Degree Explorer kiosk has been forked three times — Tech/IT,
Business & Accounting, and Health Sciences — and each fork lives in its own place:

- Three separate published repos under the org: `centralpiedmont/advising-kiosk-tech`,
  `…-business`, `…-health`.
- All three are *also* nested inside the `frazier-at-cpcc/cpcc-degree-explorer-kiosk`
  (`degree-sheets/`) working repo, co-mingled with the print degree sheets, recruiting
  cards, an iOS RoadShow app, and — one level up — the door/table signs.

The three kiosks are **one engine forked three times.** Measured divergence:

- `server.js` — byte-identical across all three.
- `index.html` — identical. `state.js`, `styles.css` — differ by < 10 lines.
- `app.js` — differs 32 lines (tech↔business), 112 lines (tech↔health; health adds
  admissions / "how to get in" screens and specialization chips).
- The real differences are **data** (`world-map.js` taxonomy, `careers.json`,
  `quiz.json`, `ce.json`, `course-descriptions.json`, `admissions.json`) plus a few
  additive, data-gated screens.

Two structural problems make this hard to maintain:

1. A fix to the shared engine must be applied three times by hand.
2. The standalone repos **cannot rebuild themselves** — each `generate.js` reads program
   data from `../build/sheets*.json` *up in the degree-sheets repo*, which the standalone
   repos do not contain. They only work because the built `kiosk-data.json` is committed.

## Goal

One organized monorepo, `centralpiedmont/degree-explorer`, that:

1. Holds a **single shared engine** with `tech` / `business` / `health` as **tracks**
   (per-track config + data), so the engine is written and fixed once.
2. Is **self-contained and CI-buildable** (vendors the program data it needs).
3. **Publishes the kiosks for web consumption** via one GitHub Pages site with a launcher
   landing page plus `/tech/`, `/business/`, `/health/`.
4. **Hosts every track's QR degree-sheet PDFs itself** under `/<track>/sheets/`, so the
   kiosk QR codes resolve inside the monorepo and depend on no external repo.
5. Still deploys to the existing Raspberry Pi balena fleets, unchanged in behavior.
6. Becomes the canonical home for all future kiosk development.

**In scope:** the three Degree Explorer kiosks, *and* hosting the built degree-sheet PDFs
that their QR codes point to (all three tracks, including Tech and Business — previously
served from the external `frazier-at-cpcc/cpcc-it-degree-sheets` repo).
**Out of scope:** door/table signs, the degree-sheet/card *generation* pipeline (the
PDFs are vendored in as built artifacts, not regenerated here), the iOS RoadShow app, and
the separate `advising-career-day-checkin` kiosk. These stay where they are.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Monorepo scope | Kiosks only (tech + business + health) |
| Code organization | Unify into one engine + per-track config |
| Existing three repos | Archive (read-only) + README banner pointing to the monorepo |
| Repo name | `centralpiedmont/degree-explorer` |
| Git history | Fresh repo, one clean initial commit (history preserved in the archived repos) |
| QR degree-sheet PDF hosting | **All three tracks** served from the monorepo Pages at `/<track>/sheets/`; PDFs vendored into the repo. No track points at an external repo. |

## Architecture

### Repository layout

```
degree-explorer/
├── README.md                     # what this is; build / run / deploy / publish
├── package.json                  # npm workspaces root; shared deps (qrcode, nodemailer)
├── .github/workflows/pages.yml   # ONE workflow → builds all tracks → unified Pages site
├── engine/                       # the single shared codebase
│   ├── server.js                 # static server + POST /email + SMTP drain loop
│   ├── outbox.js  mailer.js      # lead-capture queue + SMTP rendering/drain
│   ├── derive.js                 # field helpers (salary range, color family, …)
│   ├── world-map.js              # helpers only: worldForProgram(), validateWorldMap()
│   ├── build/
│   │   ├── generate.js           # parameterized: load track → emit kiosk-data.json + assets
│   │   └── gen-qr.js             # parameterized QR PNG generation
│   ├── public/                   # shared front-end
│   │   ├── index.html  app.js  state.js  keyboard.js  quiz-score.js  styles.css
│   └── test/                     # node:test engine suites
├── tracks/
│   ├── tech/
│   │   ├── track.config.js       # id, title, fleet, theme, features, pagesBase, worlds[]
│   │   ├── sheets.json           # program data (vendored from degree-sheets build/)
│   │   ├── careers.json  quiz.json  ce.json  course-descriptions.json
│   │   ├── sheets/               # the QR-target degree-sheet PDFs (one per program)
│   │   └── assets/               # hero photos, mascots, QR source assets
│   ├── business/                 # same shape (sheets-business.json → sheets.json)
│   └── health/                   # same shape + admissions.json; features.admissions = true
├── deploy/
│   ├── Dockerfile                # one image, track selected at runtime
│   └── docker-compose.yml        # track-parameterized; Node server + balenalabs/browser
├── dist/                         # build output (gitignored)
│   ├── index.html                # launcher landing page → the three kiosks
│   ├── tech/  business/  health/ # each = front-end + track data + assets + sheets/*.pdf
└── docs/
    └── specs/  plans/            # this spec + the carried-over kiosk design specs
```

### Engine ⇄ config boundary

**Shared engine (written once):** `server.js`, `outbox.js`, `mailer.js`, `derive.js`,
the `world-map.js` *helper functions*, the parameterized `build/generate.js` +
`build/gen-qr.js`, and the **entire front-end** (`app.js`, `state.js`, `keyboard.js`,
`quiz-score.js`, `index.html`, `styles.css`).

The front-end already renders from a single built `kiosk-data.json`. Health's extra
screens (admissions strip, "How to get in", specialization chips) become **config-gated
render branches** in the shared `app.js` — they run only when the track's data includes
the relevant objects. This is purely additive, so folding tech/business into the same
front-end is low-risk. `styles.css` carries all track styles; unused selectors are inert.

**Per-track `track.config.js` (the only thing that changes between kiosks):**

| Field | Purpose |
|---|---|
| `id`, `title` | track id (`tech`/`business`/`health`) + page `<title>` |
| `fleet` | balena fleet name (`cpcc-degree-kiosk`, `cpcc-business-kiosk`, `cpcc-health-kiosk`) |
| `theme` | brand color mapping exposed as CSS custom properties |
| `worlds` | the `WORLDS[]` taxonomy array (today's `world-map.js` data) |
| `features` | toggles: `{ admissions, specializations, ce }` |
| `pagesBase` | URL where this track's degree-sheet PDFs are served. Uniform across tracks: `https://centralpiedmont.github.io/degree-explorer/<id>/sheets` |

**Per-track data files:** `sheets.json`, `careers.json`, `quiz.json`, `ce.json`,
`course-descriptions.json`, and (health only) `admissions.json`, plus `assets/`.

### Build & run

npm workspaces. Root scripts:

- `npm run build` — build all three tracks into `dist/` (+ the launcher `dist/index.html`).
- `npm run build:tech|business|health` — build one track.
- `npm run dev:health` — build health then start the server pointed at it.
- `npm start` — `KIOSK_TRACK=<track> node engine/server.js` (serves a built track on the Pi).
- `npm test` — engine `node:test` suites + per-track validation (`validateWorldMap`,
  data-integrity checks) for all three tracks.

`engine/build/generate.js` is the single build script; it takes `--track=<id>`, loads
`tracks/<id>/track.config.js` + that track's JSON, validates, and writes a complete static
site to `dist/<id>/` (shared front-end + `kiosk-data.json` + copied assets + QR PNGs +
the track's `sheets/*.pdf` degree sheets).

### Web publishing (the core requirement)

One GitHub Pages site for the repo:

- `.github/workflows/pages.yml`: on push to `main`, `npm ci && npm run build`, then upload
  `dist/` as the Pages artifact and deploy.
- `dist/index.html` is a branded **launcher** ("Central Piedmont Degree Explorer Kiosks")
  with three cards linking to `/tech/`, `/business/`, `/health/`.
- Live URLs: `https://centralpiedmont.github.io/degree-explorer/` (launcher),
  `…/tech/`, `…/business/`, `…/health/`.
- The **"Email this"** lead capture POSTs to `server.js /email`, which Pages does not run —
  it works only on the Pi deployment. Documented, identical to today.

### balena deploy

One `Dockerfile` + a track-parameterized `docker-compose.yml` (selects `KIOSK_TRACK`).
The three existing fleets all deploy from this one repo
(`balena push <fleet>` with `KIOSK_TRACK` set). This replaces three near-identical Docker
setups with one. The `balenalabs/browser` block points at the Node server, which serves
the built track. Pi behavior (offline-first, outbox lead capture, OTA updates) is unchanged.

### Data coupling, resolved

- **Vendor** the three program datasets as `tracks/<track>/sheets.json` so the repo builds
  with no external path. The `degree-sheets` repo remains the print/authoring source of
  truth; a documented `npm run sync-data` (or manual copy) refreshes a track's `sheets.json`
  when program data changes.
- **Vendor the QR-target degree-sheet PDFs** into `tracks/<track>/sheets/` and serve them
  from the monorepo. Sources today:
  - `tech` (14 PDFs) ← `cpcc-it-degree-sheets/sheets/`
  - `business` (6 PDFs) ← `cpcc-it-degree-sheets/business/`
  - `health` (16 PDFs) ← `kiosk-health/public/sheets/`
  All three now serve from `https://centralpiedmont.github.io/degree-explorer/<track>/sheets/`,
  so no track depends on the external `cpcc-it-degree-sheets` repo. The build copies each
  track's `sheets/*.pdf` into `dist/<track>/sheets/`. The same `sync-data` step refreshes a
  track's PDFs when new ones are generated in the authoring repo.

### Code changes required to host the PDFs in the monorepo

1. **Remove the hardcoded `PAGES_BASE` constant** from `generate.js` and `gen-qr.js`
   (currently three different hardcoded URLs across the forks). The unified engine reads
   `pagesBase` from `track.config.js` instead.
2. **Set `pagesBase` uniformly** to `https://centralpiedmont.github.io/degree-explorer/<id>/sheets`
   for all three tracks.
3. **`gen-qr.js`** encodes `${track.pagesBase}/${id}.pdf` per program (was the hardcoded
   constant); `generate.js` writes the same `sheetUrl` into `kiosk-data.json`.
4. **The build copies** `tracks/<id>/sheets/*.pdf` → `dist/<id>/sheets/` so Pages serves them.
5. **Vendor the PDFs** from the three sources above into `tracks/<id>/sheets/`.

Because the kiosk renders its QR codes at build time from `pagesBase`, the on-screen QR
codes update automatically; nothing external breaks. The external `cpcc-it-degree-sheets`
repo can stay published as-is (out of scope) so any previously printed/linked QR codes keep
resolving — the kiosks simply stop depending on it.

## Migration plan

1. Scaffold `degree-explorer/` locally: extract the engine, create the three track configs
   + vendored data + vendored degree-sheet PDFs (`tracks/<id>/sheets/`), write the launcher,
   workflow, Docker, README, and carry over the specs.
2. Build all three tracks; run the test suite.
3. **Verify parity** (see below) before anything is published or archived.
4. Create `centralpiedmont/degree-explorer`, push the single initial commit, enable Pages.
5. Confirm the live Pages site (launcher + three kiosks) renders.
6. Archive `advising-kiosk-tech` / `-business` / `-health` (read-only) and add a README
   banner on each linking to `centralpiedmont/degree-explorer`.
7. Leave the originals in the `degree-sheets` working folder untouched until the monorepo
   is verified. As a follow-up, drop the nested `kiosk*/` dirs from `degree-sheets` and
   document the "develop in the monorepo" workflow.

## Verification

Definition of done — none of the archive steps happen until these pass:

- `npm run build` produces `dist/{tech,business,health}/` + `dist/index.html` with no errors.
- `npm test` passes (engine suites + all three tracks' data validation).
- Headless-Chrome render of the launcher and each track's attract / funnel / detail
  screens, screenshotted and visually compared against the current live builds and the
  existing QA screenshots in the working folder.
- Health track still shows admissions / "How to get in" / specialization screens;
  tech/business render unchanged from today.
- Every track's QR codes encode `…/degree-explorer/<track>/sheets/<id>.pdf`, and each of
  those PDFs is present in `dist/<track>/sheets/` and resolves on the live Pages site
  (all 14 tech + 6 business + 16 health).

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Engine merge introduces a regression in a working kiosk | Verify against current live builds + QA screenshots before archiving; tracks are config-only, front-end changes are additive/data-gated |
| Vendored `sheets.json` / PDFs drift from the print authoring source | Documented `sync-data` step; `degree-sheets` + `cpcc-it-degree-sheets` remain the authoring sources |
| Moving Tech/Business QR targets off `cpcc-it-degree-sheets` | Kiosks regenerate QR from `pagesBase` at build; the external repo stays published so any previously printed QR codes keep resolving |
| Existing Pages preview links change | Old kiosk repos archived with README banners pointing to the new URLs |

## Out of scope (explicit)

- Door/table signs, recruiting cards, iOS RoadShow app, and the
  `advising-career-day-checkin` kiosk — all stay where they are.
- The degree-sheet/card **generation** pipeline (`degree-sheets` build scripts,
  `cpcc-it-degree-sheets`). The monorepo hosts the **built** degree-sheet PDFs as vendored
  artifacts but does not regenerate them; re-authoring program content stays in the
  authoring repos.
