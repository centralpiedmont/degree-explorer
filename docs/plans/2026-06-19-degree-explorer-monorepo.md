# Degree Explorer Kiosk Monorepo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the three forked Degree Explorer kiosks (Tech, Business, Health) into one `centralpiedmont/degree-explorer` monorepo — a single shared engine driven by per-track config + data — that hosts every track's QR degree-sheet PDFs and publishes all three kiosks to one GitHub Pages site, while still deploying to the existing Raspberry Pi balena fleets.

**Architecture:** One `engine/` codebase (server, lead-capture, build scripts, front-end). Each kiosk is a `tracks/<id>/` folder holding a `track.config.js` (taxonomy, theme, copy, feature flags, URLs) plus vendored data JSON, assets, and degree-sheet PDFs. The build script reads a track and emits a complete static site to `dist/<id>/`; the front-end renders entirely from a built `kiosk-data.json` with health-only screens self-hiding when their data is absent. A launcher page links the three. GitHub Pages serves `dist/`; balena serves `dist/<track>` via the Node server.

**Tech Stack:** Node 20 (ESM, `node:test`, no framework), `qrcode`, `nodemailer`, headless Google Chrome (build/QA), poppler (`pdftoppm`) + ImageMagick (QA contact sheets), GitHub Actions Pages, balenaCloud + `balenalabs/browser`.

## Paths & conventions

- `$SRC` = `/Users/frazier/Documents/Administrative/AdvisingAndCareerDay` (existing source working folder; the three forks live in `$SRC/degree-sheets/kiosk`, `kiosk-business`, `kiosk-health`; degree-sheet PDFs in `$SRC/cpcc-it-degree-sheets/{sheets,business}` and `$SRC/degree-sheets/kiosk-health/public/sheets`; shared print data in `$SRC/degree-sheets/build/{sheets.json,sheets-business.json,sheets-health.json,assets/heroes}`).
- `$REPO` = `/Users/frazier/Documents/Administrative/degree-explorer` (the NEW monorepo, created clean — a sibling of `AdvisingAndCareerDay`, deliberately *outside* the co-mingled folder).
- Track ids: `tech`, `business`, `health`. Source fork → track mapping: `kiosk` → `tech`, `kiosk-business` → `business`, `kiosk-health` → `health`.
- Run all commands from `$REPO` unless stated. Set `export SRC=… REPO=…` once at the start of each session.

## Global Constraints

- **Node 20+, ESM only** (`"type": "module"`); no build framework, plain `node:*` + `qrcode` + `nodemailer`. Match existing fork style.
- **No new runtime dependencies** beyond `qrcode` and `nodemailer` (the forks' only deps).
- **Parity is the bar:** every track must render identically to its current live build. The health-only screens (admissions, "How to get in", specialization chips, world-tile photo backgrounds) are gated by data/feature flags so Tech and Business are unchanged.
- **Uniform QR base:** every track's `pagesBase` = `https://centralpiedmont.github.io/degree-explorer/<id>/sheets`. No hardcoded `PAGES_BASE` constants anywhere.
- **PDF counts (must match program counts):** tech 14, business 6, health 16.
- **`dist/` is gitignored**, rebuilt in CI. **`tracks/*/sheets/*.pdf` and `tracks/*/assets/**` ARE committed** (vendored source artifacts).
- **Single root `package.json`** (no npm workspaces — tracks carry no dependencies; this is a deliberate YAGNI simplification of the spec's "workspaces" wording).
- **Commit after every task.** Conventional-commit messages. Do NOT create the GitHub repo, push, or archive anything until Task 15, and only with explicit user go-ahead (outward-facing actions).

---

### Task 0: Repo skeleton, tooling, and a green test runner

**Files:**
- Create: `$REPO/package.json`, `$REPO/.gitignore`, `$REPO/.nvmrc`, `$REPO/engine/.gitkeep`, `$REPO/tracks/.gitkeep`, `$REPO/deploy/.gitkeep`, `$REPO/docs/.gitkeep`
- Create: `$REPO/engine/test/smoke.test.js`

**Interfaces:**
- Produces: an installable repo where `npm test` runs `node --test engine/test`.

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p "$REPO"/{engine/{build,public,test},tracks,deploy,docs/{specs,plans}}
cd "$REPO"
```

- [ ] **Step 2: Write `package.json`**

```json
{
  "name": "degree-explorer",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "description": "Central Piedmont Degree Explorer touchscreen kiosks (tech / business / health) — one engine, three tracks.",
  "scripts": {
    "build": "node engine/build/build-all.js",
    "build:tech": "node engine/build/generate.js --track=tech && node engine/build/gen-qr.js --track=tech && node engine/build/generate.js --track=tech",
    "build:business": "node engine/build/generate.js --track=business && node engine/build/gen-qr.js --track=business && node engine/build/generate.js --track=business",
    "build:health": "node engine/build/generate.js --track=health && node engine/build/gen-qr.js --track=health && node engine/build/generate.js --track=health",
    "dev:tech": "npm run build:tech && KIOSK_TRACK=tech node engine/server.js",
    "dev:business": "npm run build:business && KIOSK_TRACK=business node engine/server.js",
    "dev:health": "npm run build:health && KIOSK_TRACK=health node engine/server.js",
    "start": "node engine/server.js",
    "test": "node --test engine/test"
  },
  "dependencies": {
    "qrcode": "^1.5.4",
    "nodemailer": "^6.9.0"
  }
}
```

> Note: the per-track build runs `generate → gen-qr → generate` (gen-qr writes QR PNGs that the second generate copies into `dist/`). Task 10 replaces these inline chains with a single `build-track.js` if cleaner; keep as-is until then. `build` is wired in Task 10 (`build-all.js`); a placeholder is added in Step 5 so the script exists.

- [ ] **Step 3: Write `.gitignore`**

```gitignore
node_modules/
dist/
data/
.DS_Store
*.log
```

- [ ] **Step 4: Write `.nvmrc`**

```
20
```

- [ ] **Step 5: Add keep-files and a build-all placeholder so scripts resolve**

```bash
touch engine/.gitkeep tracks/.gitkeep deploy/.gitkeep docs/.gitkeep
printf '// Replaced in Task 10.\nconsole.log("build-all not implemented yet");\n' > engine/build/build-all.js
```

- [ ] **Step 6: Write a smoke test**

```javascript
// engine/test/smoke.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 7: Install and run tests**

Run: `cd "$REPO" && npm install && npm test`
Expected: install succeeds; `node --test` reports `pass 1`, `fail 0`.

- [ ] **Step 8: Commit**

```bash
cd "$REPO" && git init -b main && git add -A && git commit -m "chore: scaffold degree-explorer monorepo skeleton"
```

---

### Task 1: Shared engine libraries (copy identical modules) + tests

The lead-capture and front-end-lib modules are byte-identical across the three forks (verified). `derive.js` and `state.js` have a newer superset version shared by business+health — use those. Copy them verbatim, then bring their existing test suites over as the regression net.

**Files:**
- Create (copy): `engine/outbox.js`, `engine/mailer.js` ← `$SRC/degree-sheets/kiosk/`
- Create (copy): `engine/derive.js` ← `$SRC/degree-sheets/kiosk-health/derive.js` (newer)
- Create (copy): `engine/public/keyboard.js`, `engine/public/quiz-score.js` ← `$SRC/degree-sheets/kiosk/public/`
- Create (copy): `engine/public/state.js` ← `$SRC/degree-sheets/kiosk-health/public/state.js` (has `showAdmissions()`)
- Create (copy + adapt): `engine/test/{derive,outbox,mailer,quiz-score,state}.test.js`

**Interfaces:**
- Produces: `Outbox` (from `outbox.js`), `drainOutbox` (from `mailer.js`), `degreeLabel/shortLead/formatSalary/skillChips/learnNarrative/stripHtml` (from `derive.js`). These signatures are unchanged from the forks; later tasks import them as-is.

- [ ] **Step 1: Copy the identical/superset modules**

```bash
cd "$REPO"
cp "$SRC/degree-sheets/kiosk/outbox.js"            engine/outbox.js
cp "$SRC/degree-sheets/kiosk/mailer.js"            engine/mailer.js
cp "$SRC/degree-sheets/kiosk-health/derive.js"     engine/derive.js
cp "$SRC/degree-sheets/kiosk/public/keyboard.js"   engine/public/keyboard.js
cp "$SRC/degree-sheets/kiosk/public/quiz-score.js" engine/public/quiz-score.js
cp "$SRC/degree-sheets/kiosk-health/public/state.js" engine/public/state.js
```

- [ ] **Step 2: Copy their test suites**

```bash
cd "$REPO"
for t in derive outbox mailer quiz-score state; do
  cp "$SRC/degree-sheets/kiosk-health/test/$t.test.js" "engine/test/$t.test.js"
done
```

- [ ] **Step 3: Fix import paths in the copied tests**

The forks' tests import from `../<module>.js` or `../public/<module>.js` (test dir was a sibling of the modules). In `$REPO`, tests live in `engine/test/` and modules in `engine/` and `engine/public/`. Open each copied test and confirm imports resolve (e.g. `../derive.js`, `../public/state.js`). Adjust any that don't.

Run: `cd "$REPO" && grep -RnE "from '\.\./" engine/test`
Expected: every path resolves to an existing file under `engine/`.

- [ ] **Step 4: Run tests, fix until green**

Run: `cd "$REPO" && npm test`
Expected: all copied suites pass (derive, outbox, mailer, quiz-score, state) plus the smoke test. If `derive.test.js` (health version) references fields the tech derive lacked, that's expected — we kept the health/newer derive on purpose.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): shared lead-capture + front-end lib modules with tests"
```

---

### Task 2: world-map helpers (config-driven) + test

Today `world-map.js` exports a module-level `WORLDS` array *and* helper functions. In the monorepo the `WORLDS` data moves into each `track.config.js`; the helpers stay in the engine but must accept the worlds array as a parameter.

**Files:**
- Create: `engine/world-map.js`
- Create (adapt): `engine/test/world-map.test.js`

**Interfaces:**
- Produces:
  - `worldForProgram(worlds, id)` → the world object whose `programIds` includes `id`, else `undefined`.
  - `validateWorldMap(worlds, allIds)` → throws `Error` if any id in `allIds` is unmapped or any mapped id is missing from `allIds`; returns nothing on success.

- [ ] **Step 1: Write the failing test**

```javascript
// engine/test/world-map.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { worldForProgram, validateWorldMap } from '../world-map.js';

const worlds = [
  { id: 'a', name: 'A', desc: '', color: '#000', text: '#fff', programIds: ['p1', 'p2'] },
  { id: 'b', name: 'B', desc: '', color: '#111', text: '#fff', programIds: ['p3'] },
];

test('worldForProgram finds the owning world', () => {
  assert.equal(worldForProgram(worlds, 'p3').id, 'b');
  assert.equal(worldForProgram(worlds, 'nope'), undefined);
});

test('validateWorldMap passes when sets match', () => {
  assert.doesNotThrow(() => validateWorldMap(worlds, ['p1', 'p2', 'p3']));
});

test('validateWorldMap throws on missing or extra', () => {
  assert.throws(() => validateWorldMap(worlds, ['p1', 'p2']), /extra: \[p3\]/);
  assert.throws(() => validateWorldMap(worlds, ['p1', 'p2', 'p3', 'p9']), /missing: \[p9\]/);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd "$REPO" && node --test engine/test/world-map.test.js`
Expected: FAIL — `Cannot find module '../world-map.js'`.

- [ ] **Step 3: Implement `engine/world-map.js`**

```javascript
// Kiosk "worlds" helpers. The WORLDS data itself lives in each tracks/<id>/track.config.js
// (it is presentation taxonomy, decoupled from the print `family` field in sheets.json).
export function worldForProgram(worlds, id) {
  return worlds.find((w) => w.programIds.includes(id));
}

// Throws if the program list and the world map disagree (extra or missing ids).
export function validateWorldMap(worlds, allIds) {
  const mapped = new Set(worlds.flatMap((w) => w.programIds));
  const missing = allIds.filter((id) => !mapped.has(id));
  const extra = [...mapped].filter((id) => !allIds.includes(id));
  if (missing.length || extra.length) {
    throw new Error(`world-map mismatch — missing: [${missing}] extra: [${extra}]`);
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `cd "$REPO" && node --test engine/test/world-map.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): config-driven world-map helpers"
```

---

### Task 3: Track config schema + the three `track.config.js`

Each track's config is the single place its differences live. Extract the values from the existing forks: `WORLDS` (from each fork's `world-map.js`), `TILE_TINT`/`TILE_DESC`/`INFO_SESSION_URL` (from each fork's `generate.js`), the copy strings (from each fork's `public/app.js`), and the fleet names (from the READMEs). Set `pagesBase` to the uniform monorepo URL.

**Files:**
- Create: `tracks/tech/track.config.js`, `tracks/business/track.config.js`, `tracks/health/track.config.js`
- Create: `engine/track.js` (loader + validator)
- Create: `engine/test/track-config.test.js`

**Interfaces:**
- Produces: `loadTrack(id)` (from `engine/track.js`) → the validated config object with at least:
  `{ id, title, fleet, pagesBase, infoSessionUrl, theme, features:{worldTilePhotos:boolean, admissions:boolean, specializations:boolean}, copy:{topbarLabel, attractSub, infoButton, ceHeading, resultEyebrow}, tileTint:{}, tileDesc:{}, worlds:[...] }`.
- Consumes: `validateWorldMap` (Task 2) is NOT called here (no sheet ids yet) — only structural validation.

- [ ] **Step 1: Write the failing test**

```javascript
// engine/test/track-config.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadTrack, TRACK_IDS } from '../track.js';

test('all three tracks load and have required fields', async () => {
  assert.deepEqual(TRACK_IDS, ['tech', 'business', 'health']);
  for (const id of TRACK_IDS) {
    const t = await loadTrack(id);
    assert.equal(t.id, id);
    assert.match(t.pagesBase, new RegExp(`degree-explorer/${id}/sheets$`));
    for (const k of ['title', 'fleet', 'infoSessionUrl']) assert.ok(t[k], `${id} missing ${k}`);
    for (const k of ['worldTilePhotos', 'admissions', 'specializations']) {
      assert.equal(typeof t.features[k], 'boolean', `${id} features.${k}`);
    }
    for (const k of ['topbarLabel', 'attractSub', 'infoButton', 'ceHeading', 'resultEyebrow']) {
      assert.ok(t.copy[k], `${id} copy.${k}`);
    }
    assert.ok(Array.isArray(t.worlds) && t.worlds.length, `${id} worlds`);
    for (const w of t.worlds) {
      for (const k of ['id', 'name', 'desc', 'color', 'text', 'programIds']) assert.ok(k in w);
    }
  }
});

test('health enables admissions + specializations; tech/business do not', async () => {
  assert.equal((await loadTrack('health')).features.admissions, true);
  assert.equal((await loadTrack('tech')).features.admissions, false);
  assert.equal((await loadTrack('business')).features.admissions, false);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd "$REPO" && node --test engine/test/track-config.test.js`
Expected: FAIL — `Cannot find module '../track.js'`.

- [ ] **Step 3: Implement `engine/track.js`**

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const TRACK_IDS = ['tech', 'business', 'health'];
export const tracksDir = path.join(__dirname, '..', 'tracks');

const REQUIRED = ['id', 'title', 'fleet', 'pagesBase', 'infoSessionUrl', 'theme', 'features', 'copy', 'worlds'];

export async function loadTrack(id) {
  if (!TRACK_IDS.includes(id)) throw new Error(`unknown track: ${id}`);
  const mod = await import(path.join(tracksDir, id, 'track.config.js'));
  const cfg = mod.default;
  for (const k of REQUIRED) if (cfg[k] === undefined) throw new Error(`track ${id} missing ${k}`);
  if (cfg.id !== id) throw new Error(`track ${id} config.id mismatch: ${cfg.id}`);
  cfg.tileTint ||= {};
  cfg.tileDesc ||= {};
  return cfg;
}
```

- [ ] **Step 4: Write `tracks/tech/track.config.js`**

Copy the `WORLDS` array verbatim from `$SRC/degree-sheets/kiosk/world-map.js` into `worlds`; copy `TILE_TINT`/`TILE_DESC` verbatim from `$SRC/degree-sheets/kiosk/generate.js`; copy strings pulled from `$SRC/degree-sheets/kiosk/public/app.js`.

```javascript
// tracks/tech/track.config.js
export default {
  id: 'tech',
  title: 'Central Piedmont — Explore IT Degrees',
  fleet: 'cpcc-degree-kiosk',
  pagesBase: 'https://centralpiedmont.github.io/degree-explorer/tech/sheets',
  infoSessionUrl: 'https://forms.office.com/pages/responsepage.aspx?id=kftMRq3oAUCotWOPZymUNXQqV-xPK0xLl_usffYhEe1UNkNEWERTT1ZTOVlHVlJDUkg2REdaR1UyTC4u&route=shorturl',
  theme: { /* track colors are supplied by world entries + styles.css vars; reserved for future overrides */ },
  features: { worldTilePhotos: false, admissions: false, specializations: false },
  copy: {
    topbarLabel: 'Information Technology',
    attractSub: 'Explore 14 IT degrees and find yours in three taps.',
    infoButton: 'Sign up for an information session',
    ceHeading: 'IT Certifications &amp; Short Courses',
    resultEyebrow: 'YOUR IT HERO',
  },
  tileTint: {
    'cybersecurity-blueteam': { color: '#005D83', text: '#FFFFFF' },
    'cybersecurity-redteam': { color: '#A4262C', text: '#FFFFFF' },
  },
  tileDesc: {
    'softwareeng-app-dev': 'Build desktop and mobile applications',
    'softwareeng-full-stack': 'Build web apps, front end to back end',
    'artificial-intelligence': 'Train machine-learning models and AI',
    'dataanalysis-analysis': 'Find insights in data with stats and tools',
    'dataanalysis-visualization': 'Turn data into clear charts and dashboards',
    'dataanalysis-google': 'Manage IT projects and analyze data',
    'cybersecurity-blueteam': 'Defend networks and respond to attacks',
    'cybersecurity-redteam': 'Ethical hacking and penetration testing',
    'cybersecurity-forensics': 'Investigate breaches and recover evidence',
    'cloud-networking': 'Build and secure networks and the cloud',
    'it-technical-support': 'Set up, troubleshoot, and support tech',
    'sgd-programming': 'Code the engines and logic behind games',
    'sgd-design': 'Design game worlds, levels, and play',
    'sgd-3d-modeling': 'Model and animate 3D characters and scenes',
  },
  worlds: [
    /* paste the WORLDS array body from kiosk/world-map.js verbatim */
  ],
};
```

- [ ] **Step 5: Write `tracks/business/track.config.js`**

Same shape. `worlds` ← `kiosk-business/world-map.js`. `tileTint`/`tileDesc` ← `kiosk-business/generate.js`. Copy strings ← `kiosk-business/public/app.js` (e.g. topbar "Business & Accounting", attractSub mentioning the 6 programs, CE heading, result eyebrow "YOUR ... MATCH"). `infoSessionUrl` ← `kiosk-business/generate.js`. `fleet: 'cpcc-business-kiosk'`. `features` all `false`. `pagesBase: '…/degree-explorer/business/sheets'`. Pull the exact strings from the source files — do not invent copy.

- [ ] **Step 6: Write `tracks/health/track.config.js`**

Same shape. `worlds` ← `kiosk-health/world-map.js`. `tileTint` (empty) / `tileDesc` ← `kiosk-health/generate.js`. Copy strings ← `kiosk-health/public/app.js` (topbar "Health Sciences", attractSub "Explore 16 Health Sciences programs…", infoButton "Find a Health Sciences info session", ceHeading "Certifications &amp; Short Courses", resultEyebrow "YOUR HEALTH SCIENCES MATCH"). `infoSessionUrl` ← `kiosk-health/generate.js`. `fleet: 'cpcc-health-kiosk'`. `features: { worldTilePhotos: true, admissions: true, specializations: true }`. `pagesBase: '…/degree-explorer/health/sheets'`.

- [ ] **Step 7: Run tests, verify pass**

Run: `cd "$REPO" && node --test engine/test/track-config.test.js`
Expected: PASS (2 tests).

- [ ] **Step 8: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(tracks): per-track config (taxonomy, copy, features, URLs) + loader"
```

---

### Task 4: Vendor program data + validate against world maps

**Files:**
- Create: `tracks/tech/{sheets.json,careers.json,quiz.json,ce.json,course-descriptions.json}`
- Create: `tracks/business/{sheets.json,careers.json,quiz.json,ce.json,course-descriptions.json}`
- Create: `tracks/health/{sheets.json,careers.json,quiz.json,ce.json,course-descriptions.json,admissions.json}`
- Create: `engine/test/track-data.test.js`

**Interfaces:**
- Consumes: `loadTrack` (Task 3), `validateWorldMap` (Task 2).
- Produces: each track has a self-contained data set; `sheets.json` has shape `{ sheets: [ { id, programName, title, code, totalHours, planOfStudy:[...], overview, ... } ] }`.

- [ ] **Step 1: Copy the data files (note the sheets rename)**

```bash
cd "$REPO"
# tech
cp "$SRC/degree-sheets/build/sheets.json"             tracks/tech/sheets.json
cp "$SRC/degree-sheets/kiosk/careers.json"            tracks/tech/careers.json
cp "$SRC/degree-sheets/kiosk/quiz.json"               tracks/tech/quiz.json
cp "$SRC/degree-sheets/kiosk/ce.json"                 tracks/tech/ce.json
cp "$SRC/degree-sheets/kiosk/course-descriptions.json" tracks/tech/course-descriptions.json
# business
cp "$SRC/degree-sheets/build/sheets-business.json"    tracks/business/sheets.json
cp "$SRC/degree-sheets/kiosk-business/careers.json"   tracks/business/careers.json
cp "$SRC/degree-sheets/kiosk-business/quiz.json"      tracks/business/quiz.json
cp "$SRC/degree-sheets/kiosk-business/ce.json"        tracks/business/ce.json
cp "$SRC/degree-sheets/kiosk-business/course-descriptions.json" tracks/business/course-descriptions.json
# health
cp "$SRC/degree-sheets/build/sheets-health.json"      tracks/health/sheets.json
cp "$SRC/degree-sheets/kiosk-health/careers.json"     tracks/health/careers.json
cp "$SRC/degree-sheets/kiosk-health/quiz.json"        tracks/health/quiz.json
cp "$SRC/degree-sheets/kiosk-health/ce.json"          tracks/health/ce.json
cp "$SRC/degree-sheets/kiosk-health/course-descriptions.json" tracks/health/course-descriptions.json
cp "$SRC/degree-sheets/kiosk-health/admissions.json"  tracks/health/admissions.json
```

- [ ] **Step 2: Write the validation test**

```javascript
// engine/test/track-data.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadTrack, TRACK_IDS, tracksDir } from '../track.js';
import { validateWorldMap } from '../world-map.js';

const readJson = (id, f) => JSON.parse(fs.readFileSync(path.join(tracksDir, id, f), 'utf8'));
const EXPECT = { tech: 14, business: 6, health: 16 };

for (const id of TRACK_IDS) {
  test(`${id}: sheets.json parses, has ${EXPECT[id]} programs, and matches the world map`, async () => {
    const t = await loadTrack(id);
    const sheets = readJson(id, 'sheets.json');
    assert.ok(Array.isArray(sheets.sheets));
    assert.equal(sheets.sheets.length, EXPECT[id]);
    assert.doesNotThrow(() => validateWorldMap(t.worlds, sheets.sheets.map((s) => s.id)));
  });

  test(`${id}: careers/quiz/ce/course-descriptions parse`, () => {
    for (const f of ['careers.json', 'quiz.json', 'ce.json', 'course-descriptions.json']) {
      assert.doesNotThrow(() => readJson(id, f), `${id}/${f}`);
    }
  });
}

test('health: admissions.json parses', () => {
  assert.doesNotThrow(() => readJson('health', 'admissions.json'));
});
```

- [ ] **Step 3: Run it, fix data mismatches**

Run: `cd "$REPO" && node --test engine/test/track-data.test.js`
Expected: PASS. If `validateWorldMap` throws, the vendored `sheets.json` and the `worlds` in `track.config.js` disagree — reconcile the program ids (the config worlds were copied from the same fork as the sheets, so this should pass; a failure means a copy error).

- [ ] **Step 4: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(tracks): vendor program data (sheets, careers, quiz, ce, descriptions, admissions)"
```

---

### Task 5: Vendor assets + degree-sheet PDFs

**Files:**
- Create: `tracks/<id>/assets/{fontawesome,fonts,photos,qr}/…`, `tracks/<id>/assets/logo-white.png`, `tracks/<id>/assets/heroes/*.jpg`
- Create: `tracks/<id>/sheets/*.pdf`
- Create: `engine/test/track-pdfs.test.js`

**Interfaces:**
- Produces: each track's `assets/` (brand fonts, FontAwesome, photos, logo, hero photos) and `sheets/` (one PDF per program id).

- [ ] **Step 1: Copy each fork's `assets/` wholesale**

```bash
cd "$REPO"
cp -R "$SRC/degree-sheets/kiosk/assets/."          tracks/tech/assets/
cp -R "$SRC/degree-sheets/kiosk-business/assets/." tracks/business/assets/
cp -R "$SRC/degree-sheets/kiosk-health/assets/."   tracks/health/assets/
```

- [ ] **Step 2: Vendor each track's referenced hero photos**

Heroes currently live centrally in `$SRC/degree-sheets/build/assets/heroes`. Copy only the ones each track references (`s.hero || s.id + '.jpg'`):

```bash
cd "$REPO"
node -e '
const fs=require("fs"),path=require("path");
const SRC=process.env.SRC, REPO=process.env.REPO;
const heroSrc=path.join(SRC,"degree-sheets","build","assets","heroes");
for(const id of ["tech","business","health"]){
  const sheets=JSON.parse(fs.readFileSync(path.join(REPO,"tracks",id,"sheets.json"),"utf8"));
  const dst=path.join(REPO,"tracks",id,"assets","heroes"); fs.mkdirSync(dst,{recursive:true});
  for(const s of sheets.sheets){
    const f=s.hero||s.id+".jpg"; const from=path.join(heroSrc,f);
    if(fs.existsSync(from)) fs.copyFileSync(from,path.join(dst,f));
    else console.warn("MISSING hero",id,f);
  }
}
console.log("heroes vendored");
'
```

Expected: prints `heroes vendored` with no `MISSING hero` lines. If any are missing, locate the source (some forks keep heroes under their own `assets/heroes`; check `$SRC/degree-sheets/kiosk*/assets/heroes` and copy from there).

- [ ] **Step 3: Vendor the degree-sheet PDFs**

```bash
cd "$REPO"
mkdir -p tracks/tech/sheets tracks/business/sheets tracks/health/sheets
cp "$SRC/cpcc-it-degree-sheets/sheets/."*.pdf            tracks/tech/sheets/    2>/dev/null || cp "$SRC/cpcc-it-degree-sheets/sheets/"*.pdf tracks/tech/sheets/
cp "$SRC/cpcc-it-degree-sheets/business/"*.pdf           tracks/business/sheets/
cp "$SRC/degree-sheets/kiosk-health/public/sheets/"*.pdf tracks/health/sheets/
```

- [ ] **Step 4: Write the PDF parity test**

```javascript
// engine/test/track-pdfs.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { TRACK_IDS, tracksDir } from '../track.js';

const EXPECT = { tech: 14, business: 6, health: 16 };

for (const id of TRACK_IDS) {
  test(`${id}: one degree-sheet PDF per program`, () => {
    const sheets = JSON.parse(fs.readFileSync(path.join(tracksDir, id, 'sheets.json'), 'utf8'));
    const dir = path.join(tracksDir, id, 'sheets');
    const pdfs = fs.readdirSync(dir).filter((f) => f.endsWith('.pdf'));
    assert.equal(pdfs.length, EXPECT[id], `${id} pdf count`);
    for (const s of sheets.sheets) {
      assert.ok(fs.existsSync(path.join(dir, `${s.id}.pdf`)), `${id} missing ${s.id}.pdf`);
    }
  });
}
```

- [ ] **Step 5: Run it, reconcile any naming gaps**

Run: `cd "$REPO" && node --test engine/test/track-pdfs.test.js`
Expected: PASS. A failure means a PDF filename ≠ a program id — rename the vendored PDF to `<program-id>.pdf` (the QR code is built from the program id, so the filename must match).

- [ ] **Step 6: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(tracks): vendor brand assets, hero photos, and degree-sheet PDFs"
```

---

### Task 6: Unified build script `engine/build/generate.js`

Parameterized build: reads a track's config + data from `tracks/<id>/`, writes `dist/<id>/kiosk-data.json`, and copies the shared front-end + track assets + degree-sheet PDFs into `dist/<id>/`. Based on the health `generate.js` (superset: includes `specializations`, `admissions`, `applyQrFile`) with all hardcoded constants replaced by track config, and `copy`/`features` injected into the output for the front-end.

**Files:**
- Create: `engine/build/generate.js`
- Create: `engine/test/generate.test.js`

**Interfaces:**
- Consumes: `loadTrack` (Task 3), `worldForProgram`/`validateWorldMap` (Task 2), derive helpers (Task 1).
- Produces:
  - `buildKioskData(track, { sheets, careers, ce, quiz, admissions, courseDescs })` → the kiosk-data object: `{ meta, copy, features, worlds, programs, infoSession, ce, quiz }`. Each program includes `sheetUrl = \`${track.pagesBase}/${id}.pdf\``, plus `specializations`, `admissions`, `applyQrFile`.
  - CLI: `node engine/build/generate.js --track=<id>` → writes `dist/<id>/kiosk-data.json` + copies front-end/assets/PDFs into `dist/<id>/`.

- [ ] **Step 1: Write the failing test**

```javascript
// engine/test/generate.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadTrack, tracksDir } from '../track.js';
import { buildKioskData } from '../build/generate.js';

async function dataFor(id) {
  const t = await loadTrack(id);
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(tracksDir, id, f), 'utf8'));
  const admPath = path.join(tracksDir, id, 'admissions.json');
  return buildKioskData(t, {
    sheets: rd('sheets.json'), careers: rd('careers.json'), ce: rd('ce.json'),
    quiz: rd('quiz.json'), courseDescs: rd('course-descriptions.json'),
    admissions: fs.existsSync(admPath) ? rd('admissions.json') : null,
  });
}

test('tech build: 14 programs, monorepo sheetUrl, copy+features present', async () => {
  const d = await dataFor('tech');
  assert.equal(d.meta.programCount, 14);
  const p = Object.values(d.programs)[0];
  assert.match(p.sheetUrl, /degree-explorer\/tech\/sheets\/.*\.pdf$/);
  assert.equal(d.copy.topbarLabel, 'Information Technology');
  assert.equal(d.features.admissions, false);
});

test('health build: admissions present on programs that have it', async () => {
  const d = await dataFor('health');
  assert.equal(d.meta.programCount, 16);
  assert.equal(d.features.admissions, true);
  const withАdm = Object.values(d.programs).filter((p) => p.admissions);
  assert.ok(withАdm.length > 0, 'expected some programs to carry admissions');
});

test('business build: 6 programs, monorepo sheetUrl', async () => {
  const d = await dataFor('business');
  assert.equal(d.meta.programCount, 6);
  assert.match(Object.values(d.programs)[0].sheetUrl, /degree-explorer\/business\/sheets\//);
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd "$REPO" && node --test engine/test/generate.test.js`
Expected: FAIL — `Cannot find module '../build/generate.js'`.

- [ ] **Step 3: Implement `engine/build/generate.js`**

Start from `$SRC/degree-sheets/kiosk-health/generate.js` and apply these changes: (a) drop the module-level `WORLDS`, `TILE_TINT`, `TILE_DESC`, `PAGES_BASE`, `INFO_SESSION_URL`, `COURSE_DESCS` constants; (b) make `buildKioskData(track, data)` take the track + a data bag; (c) read worlds/tints/descs/urls from `track`; (d) inject `copy` and `features`; (e) `copyAssets` copies from `tracks/<id>/assets` and the track's `sheets/*.pdf` into `dist/<id>/`.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { worldForProgram, validateWorldMap } from '../world-map.js';
import { degreeLabel, shortLead, formatSalary, skillChips, learnNarrative, stripHtml } from '../derive.js';
import { loadTrack, tracksDir } from '../track.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const normCode = (c) => String(c || '').replace(/-/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();

function buildCE(ce) {
  if (!ce || !(ce.categories && ce.categories.length)) return null; // self-hide on empty
  return {
    label: stripHtml(ce.label), short: stripHtml(ce.short), tagline: stripHtml(ce.tagline),
    tileDesc: 'Short courses and industry certifications',
    color: ce.color, text: ce.text, registerUrl: ce.registerUrl,
    photo: 'assets/photos/ce.jpg', qrFile: 'assets/qr/ce-register.png',
    categories: ce.categories.map((c) => ({
      name: stripHtml(c.name),
      courses: c.courses.map((x) => ({
        code: x.code, name: stripHtml(x.name), price: x.price || null, hours: x.hours || null,
        desc: x.desc ? stripHtml(x.desc) : '',
        qrFile: (x.courseId || x.url) ? `assets/qr/ce-${x.code}.png` : null,
      })),
    })),
  };
}

function buildQuiz(quiz, worldIds) {
  if (!quiz) return null;
  for (const q of quiz.questions) for (const a of q.answers) {
    if (!worldIds.has(a.world)) throw new Error(`quiz answer world not a real world: ${a.world}`);
    if (!quiz.archetypes[a.world]) throw new Error(`quiz answer world has no archetype: ${a.world}`);
  }
  return quiz;
}

export function buildKioskData(track, { sheets, careers, ce, quiz, admissions, courseDescs }) {
  const worlds = track.worlds;
  const descs = courseDescs || {};
  validateWorldMap(worlds, sheets.sheets.map((s) => s.id));
  const programs = {};
  for (const s of sheets.sheets) {
    const world = worldForProgram(worlds, s.id);
    const careerRows = (careers.programs[s.id] || []).map((c) => ({
      title: c.title, salaryText: formatSalary(c.medianUSD), soc: c.soc,
    }));
    const tint = track.tileTint[s.id] || { color: world.color, text: world.text };
    programs[s.id] = {
      id: s.id, world: world.id, tileColor: tint.color, tileText: tint.text,
      tileDesc: track.tileDesc[s.id] || '',
      name: stripHtml(s.programName),
      track: s.concentration ? stripHtml(s.concentration).replace(/ ?(Career Track|Concentration).*$/i, '') : '',
      degree: degreeLabel(s.title), code: s.code,
      totalHours: Number.isFinite(Number(s.totalHours)) ? Number(s.totalHours) : String(s.totalHours),
      semesters: s.planOfStudy.length,
      lead: shortLead(s.overview), learn: learnNarrative(s.overview), skills: skillChips(s.planOfStudy),
      specializations: (s.specializations || []).map((x) => ({ name: stripHtml(x.name), code: x.code })),
      careers: careerRows,
      planOfStudy: s.planOfStudy.map((t) => ({
        term: t.term, termCredits: t.termCredits, note: t.note ? stripHtml(t.note) : '',
        rows: t.rows.map((r) => {
          const info = descs[normCode(r.code)];
          return { code: r.code, name: stripHtml(r.name), credits: r.credits, desc: info ? info.desc : '' };
        }),
      })),
      heroFile: `assets/heroes/${s.hero || s.id + '.jpg'}`,
      qrFile: `assets/qr/${s.id}.png`,
      sheetUrl: `${track.pagesBase}/${s.id}.pdf`,
      admissions: (admissions && admissions[s.id]) || null,
      applyQrFile: (admissions && admissions[s.id] && admissions[s.id].applyUrl) ? `assets/qr/apply-${s.id}.png` : null,
    };
  }
  return {
    meta: { track: track.id, programCount: Object.keys(programs).length },
    copy: track.copy,
    features: track.features,
    worlds: worlds.map((w) => ({ id: w.id, name: w.name, desc: w.desc, color: w.color, text: w.text, programIds: w.programIds })),
    programs,
    infoSession: { url: track.infoSessionUrl, qrFile: 'assets/qr/info-session.png' },
    ce: buildCE(ce),
    quiz: buildQuiz(quiz, new Set(sheets.sheets.map((s) => worldForProgram(worlds, s.id).id))),
  };
}

function copyDir(from, to, exts) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const f of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, f.name), dst = path.join(to, f.name);
    if (f.isDirectory()) copyDir(src, dst, exts);
    else if (!exts || exts.test(f.name)) fs.copyFileSync(src, dst);
  }
}

function copyAssets(trackDir, outDir) {
  copyDir(path.join(trackDir, 'assets'), path.join(outDir, 'assets'), null); // heroes, qr, photos, fonts, fontawesome, logo
  // degree-sheet PDFs → dist/<id>/sheets/
  copyDir(path.join(trackDir, 'sheets'), path.join(outDir, 'sheets'), /\.pdf$/i);
  // shared front-end
  copyDir(path.join(__dirname, '..', 'public'), outDir, /\.(html|js|css)$/i);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];
  const track = await loadTrack(id);
  const trackDir = path.join(tracksDir, id);
  const rd = (f) => JSON.parse(fs.readFileSync(path.join(trackDir, f), 'utf8'));
  const admPath = path.join(trackDir, 'admissions.json');
  const data = buildKioskData(track, {
    sheets: rd('sheets.json'), careers: rd('careers.json'), ce: rd('ce.json'),
    quiz: rd('quiz.json'), courseDescs: rd('course-descriptions.json'),
    admissions: fs.existsSync(admPath) ? rd('admissions.json') : null,
  });
  const outDir = path.join(repoRoot, 'dist', id);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'kiosk-data.json'), JSON.stringify(data, null, 2));
  copyAssets(trackDir, outDir);
  // per-track <title> in index.html
  const idx = path.join(outDir, 'index.html');
  if (fs.existsSync(idx)) {
    fs.writeFileSync(idx, fs.readFileSync(idx, 'utf8').replace(/<title>.*<\/title>/, `<title>${track.title}</title>`));
  }
  console.log(`Built dist/${id} (${data.meta.programCount} programs).`);
}
```

> Note: `index.html` is copied from `engine/public/` (created in Task 8) and its `<title>` is patched per track here. The first `generate` run in the build chain copies it; QR PNGs are produced by `gen-qr` (Task 7) into `tracks/<id>/assets/qr/`, then the second `generate` run copies them into `dist/`.

- [ ] **Step 4: Run the unit test (data only — front-end not built yet)**

Run: `cd "$REPO" && node --test engine/test/generate.test.js`
Expected: PASS (3 tests). The `buildKioskData` function is exercised directly, independent of front-end files.

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): parameterized generate.js (track config-driven, monorepo sheetUrl)"
```

---

### Task 7: Unified QR generator `engine/build/gen-qr.js`

Parameterized QR generation using `track.pagesBase`, `track.infoSessionUrl`, the track's `ce.json`, and (health) admissions `applyUrl`. Writes PNGs into `tracks/<id>/assets/qr/` so `generate.js` copies them into `dist/`.

**Files:**
- Create: `engine/build/gen-qr.js`
- Create: `engine/test/gen-qr.test.js`

**Interfaces:**
- Consumes: `loadTrack` (Task 3), `qrcode`.
- Produces: CLI `node engine/build/gen-qr.js --track=<id>` → writes `tracks/<id>/assets/qr/<program>.png` (+ `info-session.png`, `ce-register.png`, `ce-<code>.png`, `apply-<program>.png`) and a `qr-manifest.json` whose degree-sheet entries use `track.pagesBase`.

- [ ] **Step 1: Write the failing test**

```javascript
// engine/test/gen-qr.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { tracksDir } from '../track.js';
import { execFileSync } from 'node:child_process';

test('gen-qr tech: degree-sheet QR URLs use the monorepo pagesBase', () => {
  execFileSync('node', ['engine/build/gen-qr.js', '--track=tech'], { cwd: path.join(tracksDir, '..') });
  const manifest = JSON.parse(fs.readFileSync(path.join(tracksDir, 'tech', 'assets', 'qr', 'qr-manifest.json'), 'utf8'));
  const sheetEntries = manifest.filter((m) => m.type === 'degree-sheet');
  assert.equal(sheetEntries.length, 14);
  for (const e of sheetEntries) assert.match(e.url, /degree-explorer\/tech\/sheets\/.*\.pdf$/);
  assert.ok(fs.existsSync(path.join(tracksDir, 'tech', 'assets', 'qr', 'info-session.png')));
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `cd "$REPO" && node --test engine/test/gen-qr.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `engine/build/gen-qr.js`**

Start from `$SRC/degree-sheets/kiosk-health/gen-qr.js` (the variant that also emits `apply-<id>.png`), and replace the hardcoded `PAGES_BASE`/`INFO_SESSION_URL` with `track.pagesBase`/`track.infoSessionUrl`; read `sheets.json`, `ce.json`, `admissions.json` from `tracks/<id>/`; write into `tracks/<id>/assets/qr/`.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import QRCode from 'qrcode';
import { loadTrack, tracksDir } from '../track.js';

const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];
const track = await loadTrack(id);
const trackDir = path.join(tracksDir, id);
const rd = (f) => JSON.parse(fs.readFileSync(path.join(trackDir, f), 'utf8'));

const sheets = rd('sheets.json');
const outDir = path.join(trackDir, 'assets', 'qr');
fs.mkdirSync(outDir, { recursive: true });
const opts = { errorCorrectionLevel: 'M', margin: 3, width: 600, color: { dark: '#000000', light: '#FFFFFF' } };

const manifest = [];
for (const s of sheets.sheets) {
  const url = `${track.pagesBase}/${s.id}.pdf`;
  await QRCode.toFile(path.join(outDir, `${s.id}.png`), url, opts);
  manifest.push({ id: s.id, type: 'degree-sheet', url });
}
await QRCode.toFile(path.join(outDir, 'info-session.png'), track.infoSessionUrl, opts);
manifest.push({ id: 'info-session', type: 'info-session', url: track.infoSessionUrl });

// admissions apply QRs (health)
const admPath = path.join(trackDir, 'admissions.json');
if (fs.existsSync(admPath)) {
  const adm = rd('admissions.json');
  for (const [pid, a] of Object.entries(adm)) {
    if (a && a.applyUrl) {
      await QRCode.toFile(path.join(outDir, `apply-${pid}.png`), a.applyUrl, opts);
      manifest.push({ id: `apply-${pid}`, type: 'apply', url: a.applyUrl });
    }
  }
}

// Continuing Education QRs (tech/business have catalogs; health is empty → skipped)
const ce = rd('ce.json');
if (ce && ce.registerUrl) {
  await QRCode.toFile(path.join(outDir, 'ce-register.png'), ce.registerUrl, opts);
  manifest.push({ id: 'ce-register', type: 'ce-register', url: ce.registerUrl });
}
const COURSE_BASE = 'https://continuinged.cpcc.edu/search/publicCourseSearchDetails.do?method=load&courseId=';
for (const cat of (ce.categories || [])) for (const c of cat.courses) {
  const url = c.url || (c.courseId ? COURSE_BASE + c.courseId : null);
  if (!url) continue;
  await QRCode.toFile(path.join(outDir, `ce-${c.code}.png`), url, opts);
  manifest.push({ id: `ce-${c.code}`, type: 'ce-course', url });
}

fs.writeFileSync(path.join(outDir, 'qr-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Generated ${manifest.length} QR codes for ${id}.`);
```

> Verify against the source `gen-qr.js` files: tech uses `courseId`-based CE URLs; if business's `ce.json` uses a different field (`url`), the `c.url || courseId` fallback above covers both. Confirm by reading `$SRC/degree-sheets/kiosk-business/gen-qr.js` and matching its CE URL logic.

- [ ] **Step 4: Run it, verify it passes**

Run: `cd "$REPO" && node --test engine/test/gen-qr.test.js`
Expected: PASS. Then spot-check business + health:
`node engine/build/gen-qr.js --track=business && node engine/build/gen-qr.js --track=health`
Expected: both print a QR count with no error (health emits `apply-*` PNGs; no CE PNGs).

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): parameterized gen-qr.js using track pagesBase"
```

---

### Task 8: Unified front-end (`engine/public/app.js`, `styles.css`, `index.html`)

The careful merge. Base = health `app.js` (proven superset: defines every function tech/business use, plus the data-gated admissions/specs branches and the union icon map). Apply four parameterizations so every track renders as it does today.

**Files:**
- Create: `engine/public/app.js` ← based on `$SRC/degree-sheets/kiosk-health/public/app.js`
- Create: `engine/public/styles.css` ← `$SRC/degree-sheets/kiosk-health/public/styles.css` (superset: admissions, spec chips, B&A vertical-bar menu)
- Create: `engine/public/index.html` ← `$SRC/degree-sheets/kiosk/public/index.html`

**Interfaces:**
- Consumes: `kiosk-data.json` produced by Task 6 (now carries `copy` and `features`).
- Produces: a front-end that reads `data.copy.*` for track strings and `data.features.*` for behavior toggles.

- [ ] **Step 1: Copy the base files**

```bash
cd "$REPO"
cp "$SRC/degree-sheets/kiosk-health/public/app.js"    engine/public/app.js
cp "$SRC/degree-sheets/kiosk-health/public/styles.css" engine/public/styles.css
cp "$SRC/degree-sheets/kiosk/public/index.html"        engine/public/index.html
```

- [ ] **Step 2: Replace track copy strings with `data.copy.*`**

In `engine/public/app.js`, wherever the health base hardcodes a track string, read it from the loaded data instead. Make these exact replacements (the health base currently has the Health text; swap to dynamic):

- Topbar label: `<div class="it">Health Sciences</div>` → `<div class="it">${esc(data.copy.topbarLabel)}</div>`
- Attract subtitle: `Explore 16 Health Sciences programs and find yours in three taps.` → `${esc(data.copy.attractSub)}`
- Info button(s) (two occurrences — convert band + quiz result band): `Find a Health Sciences info session` → `${esc(data.copy.infoButton)}`
- CE heading: `Certifications &amp; Short Courses` (in the CE list header) → `${data.copy.ceHeading}`
- Quiz result eyebrow: `YOUR HEALTH SCIENCES MATCH` → `${esc(data.copy.resultEyebrow)}`

Confirm `data` (the loaded `kiosk-data.json`) is in scope at each site; the health base already binds it at module top. Use `esc()` for plain text and raw interpolation for `ceHeading` (it contains an intentional `&amp;`).

- [ ] **Step 3: Gate the world-tile photo backgrounds behind `data.features.worldTilePhotos`**

The health base renders world tiles with hero-photo backgrounds; tech/business use solid gradients. Wrap the health behavior so it only applies when the flag is on. Replace the world-tile construction block (the lines computing `wHero`/`wBg` and the `el(...)` with the photo style) with:

```javascript
let t;
if (data.features.worldTilePhotos) {
  const wHero = (data.programs[w.programIds[0]] || {}).heroFile;
  const wBg = wHero ? tileBg(w.color, wHero) : `background:linear-gradient(${w.color},${darken(w.color, .8)})`;
  t = el(`<button class="tile tile-${w.id}" style="${wBg};color:${w.text};text-shadow:${w.text === '#FFFFFF' ? '0 2px 10px rgba(0,0,0,.45)' : 'none'}"><span class="tile-name">${esc(w.name)}</span><span class="tile-desc">${esc(w.desc)}</span></button>`);
} else {
  t = el(`<button class="tile tile-${w.id}" style="color:${w.text}"><span class="tile-name">${esc(w.name)}</span><span class="tile-desc">${esc(w.desc)}</span></button>`);
}
```

(The `else` branch is the exact tech markup from `$SRC/degree-sheets/kiosk/public/app.js`.)

- [ ] **Step 4: Restore the tech/business CE detail rendering**

Only tech and business ship CE catalogs; the health base modified the CE detail view (non-credit handling, dropped course code) but never exercises it. Replace the health CE-detail rendering with the tech/business version so tech/business CE screens are unchanged. Diff the CE functions between `$SRC/degree-sheets/kiosk/public/app.js` and the health base, and for the CE *list* row, CE *heading*, and CE *detail* (`renderCECourse`/`ceFooter` text), use the tech/business markup:

- CE list row: keep the tech markup that shows `<div class="code">` and "Dates coming soon".
- CE detail stat grid: keep the tech 3-cell grid (`Course fee` / `Contact hours` / `Course code`).
- CE detail crumbs: keep tech `${esc(ce.short)} · ${esc(c.code)}`.
- ceFooter text: keep tech `Scan to register for this course`.

(These are the exact `<` lines from the Task-analysis diff; copy them verbatim from the tech `app.js`.)

- [ ] **Step 5: Build all three tracks**

Run:
```bash
cd "$REPO" && rm -rf dist && npm run build:tech && npm run build:business && npm run build:health
```
Expected: three `Built dist/<id>` lines, no errors. `dist/<id>/` contains `index.html`, `app.js`, `styles.css`, `kiosk-data.json`, `assets/`, `sheets/*.pdf`.

- [ ] **Step 6: Commit (verification happens in Task 9)**

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): unified front-end (config copy, feature-gated world tiles, CE parity)"
```

---

### Task 9: Per-track parity verification (screenshot diff vs current builds)

Prove each track renders identically to its current live build before anything is published. Uses headless Chrome to screenshot each screen, against the existing fork `public/` builds and the QA screenshots already in `$SRC`.

**Files:**
- Create: `engine/test/server.test.js` (copy from a fork; serves `dist/<track>`)
- Create: `docs/qa/` (screenshots, gitignored or kept for record)

**Interfaces:**
- Consumes: a built `dist/`, `engine/server.js` (Task 10 makes it track-aware; for this task serve a static dir directly).

- [ ] **Step 1: Serve and screenshot each track**

For each track, serve `dist/<id>` and capture the key screens. Use a simple static serve (`python3 -m http.server` from the dist dir, or `KIOSK_TRACK=<id> node engine/server.js` after Task 10). Capture attract, world menu, a program detail, the CE list (tech/business), and the quiz result:

```bash
cd "$REPO/dist/tech" && python3 -m http.server 8099 &
SERVER=$!
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --screenshot=../../docs/qa/tech-attract.png --window-size=1280,800 "http://localhost:8099/"
kill $SERVER
```

(Repeat per track and per screen. For interactive screens, the kiosk supports deep-linking via state; otherwise capture by driving the page with a short Chrome DevTools-protocol script or the playwright MCP. Reuse the existing QA screenshots in `$SRC` — `qa-attract.png`, `nursing-adn-detail.png`, etc. — as the reference set.)

- [ ] **Step 2: Visually compare each screen to the current fork build**

For each track, open `$SRC/degree-sheets/kiosk*/public/` in the same way and screenshot the same screens, OR compare against the committed QA PNGs in `$SRC`. Read both PNGs and confirm: layout, colors, copy, and the convert band match. Tech/business must show NO admissions/specs UI and NO world-tile photos; health must show admissions, "How to get in", spec chips, and photo tiles.

- [ ] **Step 3: Fix any divergence in `engine/public/*` and rebuild**

If a track differs from its reference, the cause is almost always a missed copy string (→ add to `track.config.js` `copy` and read it in `app.js`) or a behavior not gated (→ add a `features` flag). Fix, `npm run build:<id>`, re-screenshot. Iterate until all three match.

- [ ] **Step 4: Run the full suite**

Run: `cd "$REPO" && npm test`
Expected: all suites pass (libs, world-map, track-config, track-data, track-pdfs, generate, gen-qr, server, derive, state, …).

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "test: per-track parity verification + server test"
```

---

### Task 10: Track-aware server + root build orchestration (`build-all.js`, launcher)

**Files:**
- Create: `engine/server.js` ← `$SRC/degree-sheets/kiosk/server.js`, with a track-aware `publicDir`
- Create: `engine/build/build-all.js` (replaces the Task-0 placeholder)
- Create: `engine/build/launcher.js` + `engine/public/launcher.html` (the landing page template)

**Interfaces:**
- Consumes: `loadTrack`, `TRACK_IDS`, `generate.js`, `gen-qr.js`.
- Produces: `npm run build` → builds all tracks + writes `dist/index.html`. `KIOSK_TRACK=<id> node engine/server.js` serves `dist/<id>`.

- [ ] **Step 1: Copy and make the server track-aware**

```bash
cd "$REPO" && cp "$SRC/degree-sheets/kiosk/server.js" engine/server.js
```

In the `if (import.meta.url === …)` block of `engine/server.js`, change the public dir resolution from the fork's `path.join(__dirname, 'public')` to the built track dir:

```javascript
const track = process.env.KIOSK_TRACK || 'tech';
const publicDir = path.join(__dirname, '..', 'dist', track);
```

Leave `createApp({ publicDir, outbox })` and everything else unchanged (the existing `server.test.js` exercises `createApp` directly, so it still passes).

- [ ] **Step 2: Write the launcher template `engine/public/launcher.html`**

A branded landing page with three cards. Use Central Piedmont brand (gray/gold dominant, blue accent; per the `cpcc-branding` skill). Cards link to `tech/`, `business/`, `health/`. Keep it self-contained (inline CSS, no external fonts required for the launcher, or reuse a track's bundled font path).

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Central Piedmont — Degree Explorer Kiosks</title>
  <style>
    :root{--blue:#005D83;--gold:#B4A269;--gray:#54565A;}
    *{box-sizing:border-box;margin:0;}
    body{font-family:system-ui,Segoe UI,Arial,sans-serif;color:#1a1a1a;background:#f4f4f2;}
    header{background:var(--gray);color:#fff;padding:40px 24px;text-align:center;}
    header h1{font-size:32px;font-weight:800;}
    header p{opacity:.85;margin-top:8px;}
    main{max-width:1000px;margin:40px auto;padding:0 24px;display:grid;grid-template-columns:repeat(3,1fr);gap:24px;}
    a.card{display:block;border-radius:16px;padding:36px 24px;color:#fff;text-decoration:none;border-top:4px solid var(--gold);transition:transform .12s;}
    a.card:hover{transform:translateY(-4px);}
    a.tech{background:var(--blue);} a.business{background:var(--gold);color:#1a1a1a;} a.health{background:var(--gray);}
    a.card h2{font-size:24px;font-weight:800;} a.card p{margin-top:8px;opacity:.9;font-size:15px;}
    footer{text-align:center;color:var(--gray);font-size:13px;padding:24px;}
    @media(max-width:760px){main{grid-template-columns:1fr;}}
  </style>
</head>
<body>
  <header><h1>Central Piedmont Degree Explorer</h1><p>Touchscreen program finders for the Advising &amp; Career Day</p></header>
  <main>
    <a class="card tech" href="tech/"><h2>Information Technology</h2><p>14 IT degrees — apps, data &amp; AI, cyber, games.</p></a>
    <a class="card business" href="business/"><h2>Business &amp; Accounting</h2><p>6 programs — management, accounting, supply chain, legal.</p></a>
    <a class="card health" href="health/"><h2>Health Sciences</h2><p>16 programs — nursing, therapy, surgery, labs &amp; more.</p></a>
  </main>
  <footer>Central Piedmont Community College</footer>
</body>
</html>
```

- [ ] **Step 3: Write `engine/build/launcher.js`**

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const distDir = path.join(repoRoot, 'dist');
fs.mkdirSync(distDir, { recursive: true });
fs.copyFileSync(path.join(__dirname, '..', 'public', 'launcher.html'), path.join(distDir, 'index.html'));
console.log('Wrote dist/index.html (launcher).');
```

- [ ] **Step 4: Write `engine/build/build-all.js`**

```javascript
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TRACK_IDS } from '../track.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const run = (args) => execFileSync('node', args, { cwd: path.join(__dirname, '..', '..'), stdio: 'inherit' });

for (const id of TRACK_IDS) {
  run(['engine/build/generate.js', `--track=${id}`]); // copies front-end + assets + pdfs
  run(['engine/build/gen-qr.js', `--track=${id}`]);    // writes QR pngs into tracks/<id>/assets/qr
  run(['engine/build/generate.js', `--track=${id}`]); // re-copy so QR pngs land in dist
}
run(['engine/build/launcher.js']);
console.log('Built all tracks + launcher into dist/.');
```

- [ ] **Step 5: Build everything and verify dist shape**

Run:
```bash
cd "$REPO" && rm -rf dist && npm run build && \
  ls dist && ls dist/tech/sheets | wc -l && ls dist/business/sheets | wc -l && ls dist/health/sheets | wc -l && \
  test -f dist/index.html && echo OK
```
Expected: `dist/` contains `index.html`, `tech/`, `business/`, `health/`; PDF counts 14 / 6 / 16; prints `OK`.

- [ ] **Step 6: Smoke-test the server**

Run: `cd "$REPO" && KIOSK_TRACK=health node engine/server.js &` then `curl -s localhost:8080/kiosk-data.json | head -c 60` then kill it.
Expected: returns JSON beginning `{ "meta": { "track": "health"`.

- [ ] **Step 7: Run full test suite + commit**

Run: `cd "$REPO" && npm test`
Expected: all pass.

```bash
cd "$REPO" && git add -A && git commit -m "feat(engine): track-aware server, build-all orchestration, Pages launcher"
```

---

### Task 11: balena deploy (one Dockerfile + compose for three fleets)

**Files:**
- Create: `deploy/Dockerfile`, `deploy/docker-compose.yml`, `deploy/.dockerignore`, `deploy/README.md`

**Interfaces:**
- Produces: a balena-pushable compose where `KIOSK_TRACK` (fleet env var) selects which built track the server serves.

- [ ] **Step 1: Write `deploy/Dockerfile`**

Builds all tracks in the image (self-contained — data is vendored), then serves the one named by `KIOSK_TRACK`.

```dockerfile
FROM node:20-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
ENV PORT=8080
EXPOSE 8080
CMD ["node", "engine/server.js"]
```

- [ ] **Step 2: Write `deploy/docker-compose.yml`**

```yaml
# balena: set KIOSK_TRACK (tech|business|health) per fleet in the dashboard.
# Fleets: cpcc-degree-kiosk (tech), cpcc-business-kiosk (business), cpcc-health-kiosk (health).
version: "2"
services:
  kiosk:
    build:
      context: .
      dockerfile: deploy/Dockerfile
    restart: always
    environment:
      PORT: "8080"
      KIOSK_DATA_DIR: "/data"
      KIOSK_TRACK: "tech"   # overridden per fleet via balena env var
      # SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / MAIL_FROM set as fleet vars
    volumes:
      - leads:/data
    expose:
      - "8080"
  browser:
    image: bh.cr/balenalabs/browser-aarch64
    privileged: true
    restart: always
    environment:
      LAUNCH_URL: "http://kiosk:8080"
      KIOSK: "1"
      PERSISTENT: "1"
      ENABLE_GPU: "1"
    ports:
      - "5011"
volumes:
  leads: {}
```

- [ ] **Step 3: Write `deploy/.dockerignore`**

```
node_modules
dist
data
docs
**/*.md
.git
```

- [ ] **Step 4: Write `deploy/README.md`**

Document per-fleet deploy: `balena push <fleet>` from `$REPO`, with `balena env add KIOSK_TRACK <track> --fleet <fleet>` and the SMTP vars. Carry over the provisioning + display-rotation notes from `$SRC/degree-sheets/kiosk/README.md` (balenaOS flash, 27" touchscreen, `BALENA_HOST_CONFIG_display_rotate`).

- [ ] **Step 5: Validate the compose (if Docker is available)**

Run: `cd "$REPO" && docker compose -f deploy/docker-compose.yml config >/dev/null && echo OK`
Expected: `OK`. If Docker isn't installed, verify YAML parses: `node -e "require('node:fs').readFileSync('deploy/docker-compose.yml','utf8')" && echo readable`.

- [ ] **Step 6: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "feat(deploy): single parameterized balena Dockerfile + compose for three fleets"
```

---

### Task 12: GitHub Pages workflow

**Files:**
- Create: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: on push to `main`, builds all tracks and deploys `dist/` to Pages.

- [ ] **Step 1: Write `.github/workflows/pages.yml`**

```yaml
name: Deploy kiosks to GitHub Pages

# Builds all three tracks + the launcher and serves dist/ via GitHub Pages.
# The guided funnel, QR degree sheets, and info-session links work as static
# content. The "Email this" capture POSTs to server.js, which Pages does not
# run — that feature works only on the Raspberry Pi (balena) deployment.

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Validate the workflow YAML**

Run: `cd "$REPO" && node -e "const f=require('node:fs').readFileSync('.github/workflows/pages.yml','utf8'); if(!f.includes('upload-pages-artifact')) throw new Error('bad'); console.log('OK')"`
Expected: `OK`.

- [ ] **Step 3: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "ci: build all tracks and deploy unified Pages site"
```

---

### Task 13: Top-level README, docs, and sync-data helper

**Files:**
- Create: `$REPO/README.md`
- Create: `$REPO/docs/specs/2026-06-19-degree-explorer-monorepo-design.md` (copy of the spec)
- Create: `$REPO/docs/plans/2026-06-19-degree-explorer-monorepo.md` (copy of this plan)
- Create: `$REPO/engine/build/sync-data.js` + `sync-data` npm script

**Interfaces:**
- Produces: documentation of structure/build/run/deploy/publish, and a documented path to refresh vendored data from the authoring repos.

- [ ] **Step 1: Write `README.md`**

Cover: what this is (three tracks, one engine); repo layout; `npm run build` / `build:<track>` / `dev:<track>`; the Pages URLs (`https://centralpiedmont.github.io/degree-explorer/` + `/tech/` `/business/` `/health/`); balena deploy pointer to `deploy/README.md`; the "Email this" Pages caveat; and the data/PDF authoring sources (`degree-sheets`, `cpcc-it-degree-sheets`) + how `npm run sync-data` refreshes a track. Adapt the offline-behavior + env-var sections from `$SRC/degree-sheets/kiosk/README.md`.

- [ ] **Step 2: Copy the spec and plan into the repo**

```bash
cd "$REPO"
cp "$SRC/degree-sheets/docs/superpowers/specs/2026-06-19-degree-explorer-monorepo-design.md" docs/specs/
cp "$SRC/degree-sheets/docs/superpowers/plans/2026-06-19-degree-explorer-monorepo.md" docs/plans/
```

- [ ] **Step 3: Write `engine/build/sync-data.js`**

A documented copier that refreshes one track's vendored `sheets.json` + degree-sheet PDFs from configured source paths (env-overridable; defaults to the `$SRC` layout). Keep it explicit — it copies, prints what changed, and never deletes.

```javascript
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..', '..');
const SRC = process.env.DE_SOURCE_ROOT || path.join(repoRoot, '..', 'AdvisingAndCareerDay');
const id = (process.argv.find((a) => a.startsWith('--track=')) || '').split('=')[1];

const MAP = {
  tech:     { sheets: 'degree-sheets/build/sheets.json',          pdfs: 'cpcc-it-degree-sheets/sheets' },
  business: { sheets: 'degree-sheets/build/sheets-business.json', pdfs: 'cpcc-it-degree-sheets/business' },
  health:   { sheets: 'degree-sheets/build/sheets-health.json',   pdfs: 'degree-sheets/kiosk-health/public/sheets' },
};
const m = MAP[id];
if (!m) throw new Error('usage: node engine/build/sync-data.js --track=tech|business|health');

fs.copyFileSync(path.join(SRC, m.sheets), path.join(repoRoot, 'tracks', id, 'sheets.json'));
const pdfSrc = path.join(SRC, m.pdfs), pdfDst = path.join(repoRoot, 'tracks', id, 'sheets');
fs.mkdirSync(pdfDst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(pdfSrc)) if (f.endsWith('.pdf')) { fs.copyFileSync(path.join(pdfSrc, f), path.join(pdfDst, f)); n++; }
console.log(`Synced ${id}: sheets.json + ${n} PDFs from ${SRC}. Re-run npm run build:${id} and verify.`);
```

- [ ] **Step 4: Add the npm script**

In `package.json` scripts add: `"sync-data": "node engine/build/sync-data.js"`.

- [ ] **Step 5: Verify sync-data is idempotent (no diff after a fresh sync)**

Run: `cd "$REPO" && npm run sync-data -- --track=tech && git status --porcelain tracks/tech`
Expected: no output (the vendored data already matches source).

- [ ] **Step 6: Commit**

```bash
cd "$REPO" && git add -A && git commit -m "docs: top-level README, carried-over spec+plan, sync-data helper"
```

---

### Task 14: Full local verification gate (definition of done)

No publishing happens until this passes. This is the spec's verification section, executed end to end.

**Files:** none (verification only); optional `docs/qa/contact-sheet.png`.

- [ ] **Step 1: Clean build from scratch**

Run: `cd "$REPO" && rm -rf node_modules dist && npm ci && npm run build`
Expected: builds `dist/{index.html,tech,business,health}` with no errors.

- [ ] **Step 2: Full test suite**

Run: `cd "$REPO" && npm test`
Expected: every suite passes.

- [ ] **Step 3: Asset + PDF integrity**

Run:
```bash
cd "$REPO"
for t in tech business health; do
  echo "$t: pdfs=$(ls dist/$t/sheets/*.pdf | wc -l) qr=$(ls dist/$t/assets/qr/*.png | wc -l) data=$(test -f dist/$t/kiosk-data.json && echo yes)"
done
```
Expected: pdfs 14/6/16; qr ≥ program count per track; data yes.

- [ ] **Step 4: Render + contact sheet of all three attract screens + launcher**

Serve `dist/` and screenshot the launcher and each track's attract screen; assemble a contact sheet and Read it to confirm brand + content:

```bash
cd "$REPO/dist" && python3 -m http.server 8099 &
S=$!
for u in "" tech/ business/ health/; do
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --window-size=1280,800 --screenshot="../docs/qa/$(echo ${u:-launcher} | tr -d /).png" "http://localhost:8099/$u"
done
kill $S
magick montage ../docs/qa/{launcher,tech,business,health}.png -tile 2x2 -geometry +6+6 ../docs/qa/contact-sheet.png
```
Then Read `docs/qa/contact-sheet.png` and confirm: launcher shows three branded cards; tech/business/health attract screens match their current builds.

- [ ] **Step 5: Confirm parity checklist (from the spec)**

Manually confirm, reading the screenshots from Task 9 + Step 4:
- Health shows admissions, "How to get in", spec chips, photo world tiles.
- Tech/business show none of those and render unchanged from today.
- Every track's QR degree-sheet URLs are `…/degree-explorer/<track>/sheets/<id>.pdf` (check a few entries in each `dist/<track>/kiosk-data.json`).

- [ ] **Step 6: Commit the QA record**

```bash
cd "$REPO" && git add -f docs/qa/contact-sheet.png && git commit -m "test: full local verification gate (build + tests + render parity)"
```

---

### Task 15: Publish to `centralpiedmont/degree-explorer` + archive old repos

**Outward-facing — do each remote step only with explicit user go-ahead.** Nothing here runs until Task 14 is green and the user confirms.

**Files:** none new (uses `gh`, `git`).

- [ ] **Step 1: Confirm with the user**

Summarize: repo to create (`centralpiedmont/degree-explorer`, public), Pages will publish, and the three old repos will be archived with banners. Get explicit approval before proceeding.

- [ ] **Step 2: Create the repo and push**

```bash
cd "$REPO"
gh repo create centralpiedmont/degree-explorer --public \
  --description "Central Piedmont Degree Explorer kiosks (tech / business / health) — one engine, three tracks, one Pages site." \
  --source . --remote origin --push
```
Expected: repo created; `main` pushed.

- [ ] **Step 3: Enable GitHub Pages (GitHub Actions source)**

```bash
gh api -X POST repos/centralpiedmont/degree-explorer/pages -f build_type=workflow 2>/dev/null || \
gh api -X PUT repos/centralpiedmont/degree-explorer/pages -f build_type=workflow
```
Then watch the deploy: `gh run watch --repo centralpiedmont/degree-explorer` (or `gh run list`).
Expected: the `Deploy kiosks to GitHub Pages` workflow succeeds.

- [ ] **Step 4: Verify the live site**

Check these resolve (HTTP 200) once the run completes:
```bash
for u in "" tech/ business/ health/ tech/sheets/it-technical-support.pdf health/sheets/nursing-adn.pdf; do
  echo -n "$u -> "; curl -s -o /dev/null -w "%{http_code}\n" "https://centralpiedmont.github.io/degree-explorer/$u"
done
```
Expected: all `200`. Open the launcher and one kiosk in a browser to confirm the funnel + QR images render.

- [ ] **Step 5: Archive the three old repos with a pointer banner**

For each of `advising-kiosk-tech`, `advising-kiosk-business`, `advising-kiosk-health`: prepend a banner to its `README.md` ("⚠️ Moved to centralpiedmont/degree-explorer — this repo is archived and read-only.") on its default branch, then archive:

```bash
for r in advising-kiosk-tech advising-kiosk-business advising-kiosk-health; do
  gh api -X PATCH repos/centralpiedmont/$r -F archived=true
done
```
(Edit each README via `gh api` contents or a quick clone/commit/push *before* archiving — archived repos are read-only.)
Expected: each repo shows the "Archived" badge and the banner.

- [ ] **Step 6: Final commit / tag**

```bash
cd "$REPO" && git tag -a v1.0.0 -m "Initial unified monorepo: tech+business+health kiosks, self-hosted PDFs, unified Pages" && git push --tags
```

---

## Follow-ups (out of this plan, noted for later)

- Remove the nested `kiosk*/` dirs from the `degree-sheets` working repo and update its README to point future kiosk work at `centralpiedmont/degree-explorer` (only after the monorepo is verified live).
- Confirm real SMTP credentials for the balena fleets (the "Email this" drain has always been an open item).
- Decide whether to also fold the separate `advising-career-day-checkin` kiosk into this monorepo in a future pass.

## Self-Review

**Spec coverage:** single shared engine (Tasks 1,2,6,7,8,10) ✓; per-track config + data (Tasks 3,4,5) ✓; self-contained/CI-buildable (Tasks 4,5,12,14) ✓; unified Pages + launcher (Tasks 10,12) ✓; **all** degree-sheet PDFs hosted in-repo with uniform `pagesBase` + the five code changes (Tasks 5,6,7) ✓; balena three-fleet deploy (Task 11) ✓; data coupling resolved + sync-data (Tasks 4,5,13) ✓; migration fresh-repo + archive (Task 15) ✓; verification gate (Tasks 9,14) ✓; out-of-scope respected (no PDF generation, no signs/cards/iOS — only built PDFs vendored) ✓.

**Placeholder scan:** no TBD/TODO; every code step shows real code or exact copy commands; copy strings to be pulled verbatim from named source files (not invented). The only "paste verbatim from source" instructions (WORLDS arrays, business/health config strings, CE markup) name the exact source file + symbol, which is concrete for a migration.

**Type consistency:** `loadTrack(id)` / `TRACK_IDS` / `tracksDir` (Task 3) used identically in Tasks 4,6,7,10,13; `worldForProgram(worlds,id)` / `validateWorldMap(worlds,allIds)` (Task 2) used with the `worlds`-first signature in Tasks 4,6; `buildKioskData(track,{...})` (Task 6) matches its test and the build-all caller; `kiosk-data.json` carries `copy`+`features` (Task 6) consumed by the front-end (Task 8) and server mail context (unchanged). `KIOSK_TRACK` selects `dist/<track>` consistently in server (Task 10) and compose (Task 11).
