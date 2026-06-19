# Central Piedmont Degree Explorer

Touchscreen kiosks for exploring Central Piedmont's academic programs — one shared engine, four independently deployable tracks.

| Track | Programs | Colors |
|---|---|---|
| `tech` | 14 IT / Technology programs | CPCC Blue |
| `business` | 6 Business & Accounting programs | CPCC Gold |
| `health` | 16 Health Sciences programs | CPCC Gray |
| `hospitality` | 5 Hospitality & Public Services programs | CPCC Red |

Students walk a guided "Find Your Path" funnel: **interest world → specialization → program match** → detail card with three convert actions: degree-sheet QR, info-session QR, and "Email this".

---

## Repo layout

```
degree-explorer/
├── engine/                   # Shared build + runtime
│   ├── server.js             # Node HTTP server (static + POST /email)
│   ├── build/                # Build scripts
│   │   ├── generate.js       # sheets.json → dist/<track>/ (per-track)
│   │   ├── gen-qr.js         # QR PNG generation
│   │   ├── build-all.js      # Run all three tracks in sequence
│   │   ├── launcher.js       # dist/index.html track-switcher for Pages
│   │   └── sync-data.js      # Refresh vendored data from authoring repos
│   ├── derive.js             # Display-field derivation helpers
│   ├── mailer.js             # SMTP drain (lead-capture emails)
│   ├── outbox.js             # Lead-capture queue (outbox.jsonl)
│   ├── world-map.js          # 5-world interest taxonomy
│   ├── track.js              # Track config loader
│   └── public/               # Shared front-end source (app.js, state.js, etc.)
├── tracks/                   # Per-track vendored data
│   ├── tech/                 # sheets.json + sheets/ PDFs + track.config.js + …
│   ├── business/
│   └── health/
├── dist/                     # Built output (committed; served by Pages)
│   ├── index.html            # Launcher (links to /tech/, /business/, /health/)
│   ├── tech/
│   ├── business/
│   └── health/
├── deploy/                   # balena fleet config
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── README.md             # Full balena deploy instructions
├── docs/
│   ├── specs/
│   └── plans/
├── .github/workflows/        # GitHub Pages CI
└── package.json
```

---

## Build commands

```bash
# Build all three tracks (generates dist/)
npm run build

# Build a single track
npm run build:tech
npm run build:business
npm run build:health
npm run build:hospitality

# Build + run local dev server on that track
npm run dev:tech
npm run dev:business
npm run dev:health
npm run dev:hospitality

# Run the server without rebuilding (set KIOSK_TRACK to pick the active track)
KIOSK_TRACK=tech node engine/server.js

# Run all tests (59 assertions)
npm test

# Refresh vendored track data from the authoring repos (see Data section below)
npm run sync-data -- --track=tech
npm run sync-data -- --track=business
npm run sync-data -- --track=health
```

The server listens on `PORT` (default 8080) and serves `dist/<KIOSK_TRACK>/`. If `KIOSK_TRACK` is unset it falls back to `tech`.

---

## GitHub Pages (preview / demo)

The full build output in `dist/` is published automatically on every push to `main` by `.github/workflows/pages.yml`.

| URL | Content |
|---|---|
| `https://centralpiedmont.github.io/degree-explorer/` | Launcher — links to each track |
| `https://centralpiedmont.github.io/degree-explorer/tech/` | Technology track |
| `https://centralpiedmont.github.io/degree-explorer/business/` | Business & Accounting track |
| `https://centralpiedmont.github.io/degree-explorer/health/` | Health Sciences track |
| `https://centralpiedmont.github.io/degree-explorer/hospitality/` | Hospitality & Public Services track |

**"Email this" caveat:** the email capture feature POSTs to `POST /email` on the Node server. GitHub Pages serves static files only — it does not run `server.js`. The email feature works only on the Raspberry Pi (balena) deployment. On Pages the button is still visible but the POST will fail gracefully; leads are not captured.

---

## balena / Raspberry Pi deploy

See **[deploy/README.md](deploy/README.md)** for full instructions: creating fleets, setting `KIOSK_TRACK` per fleet, pushing the image, and provisioning devices.

Summary:
- One `Dockerfile` builds all three tracks into the image.
- `KIOSK_TRACK` selects which track the server serves at runtime.
- Three separate balena fleets (`cpcc-degree-kiosk`, `cpcc-business-kiosk`, `cpcc-health-kiosk`) each run the same image with a different `KIOSK_TRACK`.

---

## Environment variables

Set in the balena fleet dashboard (or a local `.env` / shell export for dev). The server reads them at startup.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8080` | HTTP port the server listens on |
| `KIOSK_TRACK` | `tech` | Which track to serve (`tech`, `business`, `health`, `hospitality`) |
| `KIOSK_DATA_DIR` | `./data` (`/data` in container) | Directory for `outbox.jsonl` lead captures |
| `SMTP_HOST` | _(unset)_ | SMTP server hostname; **when unset, email drain is disabled** — leads queue safely |
| `SMTP_PORT` | `587` | SMTP port (STARTTLS) |
| `SMTP_USER` | _(unset)_ | SMTP auth username |
| `SMTP_PASS` | _(unset)_ | SMTP auth password |
| `MAIL_FROM` | `no-reply@cpcc.edu` | From address on outbound lead-capture emails |

**Offline-safe by design:** when `SMTP_HOST` is unset, the SMTP drain loop does not run. Leads accumulate in `data/outbox.jsonl` and are sent in batch once the device reconnects and `SMTP_HOST` is set. Pull balena OTA updates on campus before each event so the Pi has the latest data and code.

---

## Offline behavior

The app runs entirely offline at events. The Pi does not require venue Wi-Fi to function:

- All program data, images, and front-end assets are bundled on-device.
- Degree-sheet QR codes encode GitHub Pages PDF URLs — students scan with their own phones on cellular.
- Info-session QR codes work the same way.
- Email captures queue to `data/outbox.jsonl` and drain the next time the device is online (e.g., back on campus with `SMTP_HOST` configured).

The only things that require internet: balena OTA updates and outbound SMTP for lead-capture email delivery.

---

## Data and PDF authoring sources

Track data is **vendored** into `tracks/<id>/` so every track is self-contained and no external path resolution is needed at build or runtime.

| Track | `sheets.json` source | Degree-sheet PDFs source |
|---|---|---|
| `tech` | `../AdvisingAndCareerDay/degree-sheets/build/sheets.json` | `../AdvisingAndCareerDay/cpcc-it-degree-sheets/sheets/` |
| `business` | `../AdvisingAndCareerDay/degree-sheets/build/sheets-business.json` | `../AdvisingAndCareerDay/cpcc-it-degree-sheets/business/` |
| `health` | `../AdvisingAndCareerDay/degree-sheets/build/sheets-health.json` | `../AdvisingAndCareerDay/degree-sheets/kiosk-health/public/sheets/` |
| `hospitality` | CPCC catalog (`catalog.cpcc.edu`) — see note below | generated locally (`gen-sheet-pdf.js`) |

These paths assume the monorepo sits next to the `AdvisingAndCareerDay` working directory. Override with the `DE_SOURCE_ROOT` environment variable if your layout differs.

**`hospitality` is sourced differently.** It has no authoring-repo source yet — its `sheets.json` and course descriptions were transcribed from the CPCC public catalog, and its degree-sheet PDFs are generated from that data by an opt-in tool rather than vendored from a print pipeline:

```bash
# Regenerate the hospitality degree-sheet PDFs after editing tracks/hospitality/sheets.json
# (requires Google Chrome; override the binary with CHROME_BIN)
node engine/build/gen-sheet-pdf.js --track=hospitality
```

A `sync-data` mapping is wired for `hospitality` (expecting `sheets-hospitality.json` + `kiosk-hospitality/public/sheets/`) for when authored sources exist; until then, edit `tracks/hospitality/` directly and regenerate PDFs with the command above. **Placeholders to replace before a live event:** AI-generated hero photos in `tracks/hospitality/assets/heroes/`, and the `infoSessionUrl` in `tracks/hospitality/track.config.js`.

### Refreshing a track

1. Edit program data in the authoring repo (`degree-sheets/build/`).
2. Run the authoring repo's own build step to regenerate `sheets.json`.
3. From this repo root, pull the new data into the vendored copy:

   ```bash
   npm run sync-data -- --track=tech
   # or --track=business / --track=health / --track=hospitality
   ```

4. Rebuild the affected track and verify:

   ```bash
   npm run build:tech
   npm test
   ```

5. Commit `tracks/tech/sheets.json` (and any changed PDFs) and push — Pages and the balena image will update automatically on the next deploy.

`npm run sync-data` copies `sheets.json` and all `*.pdf` files from the authoring source into `tracks/<id>/`. It never deletes files, only adds or overwrites. The environment variable `DE_SOURCE_ROOT` overrides the default parent-directory search path.

---

## Android signage app

The `android/` module packages each track as a locked-down Android **WebView kiosk APK**
for a generic Android HDMI signage stick driving a touchscreen — same content as the web
kiosk, fully offline, QR-only. One APK per track via Gradle product flavors
(`degree-explorer-tech.apk` / `-business.apk` / `-health.apk` / `-hospitality.apk`), each
bundling its track's built `dist/<track>/`. The app runs full-screen with kiosk hardening
(device-owner lock-task, boot auto-start, keep-screen-on, immersive). The web app hides
"Email this" when loaded with `?signage=1` (which the WebView always passes). See
`android/README.md` for build, signing, device-owner provisioning, and install.

## Design documents

- `docs/specs/2026-06-19-degree-explorer-monorepo-design.md` — full system design
- `docs/plans/2026-06-19-degree-explorer-monorepo.md` — implementation plan (Tasks 0–13)
- `docs/specs/2026-06-19-android-signage-app-design.md` — Android signage app design
- `docs/plans/2026-06-19-android-signage-app.md` — Android signage app implementation plan
