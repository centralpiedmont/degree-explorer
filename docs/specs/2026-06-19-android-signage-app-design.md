# Android Signage App (Degree Explorer) — Design

**Date:** 2026-06-19
**Repo:** `centralpiedmont/degree-explorer` (new `android/` module)
**Status:** Approved design, ready for implementation plan

## Problem

The Degree Explorer kiosk runs today on a Raspberry Pi (balena + Chromium kiosk + a Node
`server.js`). We want a second deployment target: a **generic Android HDMI signage stick**
driving a **touchscreen**, running the same interactive funnel — so the kiosk can ship on
cheap, widely-available Android hardware without a Pi or balena.

## Goal

An Android app that hosts the existing web kiosk full-screen, fully offline, locked down as
a single-purpose kiosk device, with **one APK per track** (tech / business / health).

- Reuse the existing web app wholesale — Android only hosts and locks it; no UX rewrite.
- Run with **zero network** at the venue (offline-first, like the Pi).
- True kiosk lockdown: auto-start on boot, full-screen, no escape, screen stays on.
- Build the APKs in **CI (GitHub Actions)** — no local Android toolchain assumed.

**In scope (v1):** the WebView host app, three build flavors with bundled offline content,
QR-only convert actions, kiosk hardening, a CI build producing three signed APKs, and one
small front-end guard to hide "Email this" on signage.

**Out of scope (v1):** OTA content updates, lead capture / "Email this" on Android, MDM /
fleet management, Play Store distribution, an attract-only (non-touch) mode.

## Decisions (locked)

| Decision | Choice |
|---|---|
| Interaction model | Touch — the same interactive funnel as the Pi kiosk |
| Target device | Generic Android HDMI stick (sideload APK, full Android, lock-task available) |
| App architecture | Thin native Kotlin **WebView** shell (not Capacitor, not TWA, not a native rewrite) |
| Content source | **Bundled in the APK** (offline-first); loaded via `file://` |
| Lead capture | **QR-only** for v1 — "Email this" removed (no server in the APK) |
| Track selection | **One APK per track** via three Gradle product flavors |
| APK build | **GitHub Actions** workflow produces three signed APK artifacts |
| Location | New `android/` module in the `degree-explorer` monorepo |

### Why WebView over the alternatives
- **TWA → Pages:** needs a live network at the venue and gives weak kiosk lockdown — both
  conflict with the offline-first, locked-down requirement.
- **Capacitor/Cordova:** adds a JS build layer + plugin dependencies for capabilities a bare
  WebView already covers. More moving parts, no benefit here.
- A bare WebView is the least code and fewest dependencies, and the web app is already the
  entire experience.

## Architecture

### Module layout

```
degree-explorer/
├── android/
│   ├── settings.gradle.kts  build.gradle.kts  gradle/  gradlew  gradlew.bat
│   ├── app/
│   │   ├── build.gradle.kts            # 3 product flavors (tech/business/health)
│   │   └── src/
│   │       ├── main/
│   │       │   ├── AndroidManifest.xml # single Activity, BOOT receiver, lock-task
│   │       │   ├── java/edu/cpcc/degreeexplorer/
│   │       │   │   ├── KioskActivity.kt        # full-screen WebView + hardening
│   │       │   │   ├── BootReceiver.kt         # relaunch on BOOT_COMPLETED
│   │       │   │   └── DeviceAdminReceiver.kt  # device-owner component for lock-task
│   │       │   └── res/                       # app icon, theme, strings,
│   │       │                                  #   xml/device_admin.xml (device-admin policy)
│   │       ├── tech/assets/      # populated from dist/tech/ at build time
│   │       ├── business/assets/  # populated from dist/business/
│   │       └── health/assets/    # populated from dist/health/
│   └── README.md                # build, signing, device-owner provisioning, install
├── engine/public/app.js         # +1 small guard: hide "Email this" when ?signage=1
└── .github/workflows/android.yml  # CI: npm build → copy dist → gradle assemble → upload APKs
```

The `android/` Gradle build is independent of the Node build; CI sequences them.

### The Activity (`KioskActivity.kt`)

A single full-screen Activity hosting one `WebView`:

- Loads `file:///android_asset/index.html?signage=1` (each flavor's `assets/` is its own
  track's `dist`, so the asset root is the track site; no per-track path needed in code).
- WebView settings: `javaScriptEnabled=true`, `domStorageEnabled=true`,
  `allowFileAccess=true`, `mediaPlaybackRequiresUserGesture=false`; zoom controls off;
  long-press/text-selection/context-menu suppressed; `WebViewClient` blocks any navigation
  whose URL is not under the local asset root (defense-in-depth — the content is fully
  local and the on-screen QR codes are scanned by visitors' phones, so the WebView never
  needs to leave the page).
- Orientation locked to landscape.
- `FLAG_KEEP_SCREEN_ON` so the display never sleeps.
- Immersive sticky fullscreen (status + navigation bars hidden, re-hidden on focus).
- Lifecycle: re-assert immersive + lock-task on `onResume`/`onWindowFocusChanged`.

### Kiosk hardening

- **Lock-task mode:** when the app is the **device owner** (provisioned once per stick via
  `adb shell dpm set-device-owner edu.cpcc.degreeexplorer/.DeviceAdminReceiver`),
  `startLockTask()` gives true lockdown — home/recents/back cannot escape. Without device
  owner, ordinary screen pinning is used as a softer fallback. The manifest whitelists the
  app for lock-task. Provisioning is documented in `android/README.md`.
- **Auto-start on boot:** `BootReceiver` listens for `BOOT_COMPLETED` and starts
  `KioskActivity`, so a power-cycled stick returns to the kiosk unattended.
- **Auto-relaunch:** if the Activity is stopped/dismissed, it restarts (and re-enters
  lock-task). Crash → Android restarts the single Activity.

### The one shared front-end change

`engine/public/app.js` currently always renders an "Email this" button in the convert band
(and the result band). On signage there is no server to receive it. Add a single guard: read
`?signage=1` from `location.search` once at startup into a constant (e.g.
`const SIGNAGE = new URLSearchParams(location.search).get('signage') === '1'`) and render the
"Email this" button only when `!SIGNAGE`. The Android WebView always loads with
`?signage=1`, so the button never appears there. Pi and Pages are unaffected (no param →
current behavior), and this also lets the Pages preview suppress the button (where it never
worked) by adding the param. This is additive and parity-safe; it is covered by the existing
front-end render path and verified in the Android smoke test + manual QA.

### Content bundling & flavors

- Three Gradle **product flavors** in `app/build.gradle.kts`: `tech`, `business`, `health`,
  each with `applicationIdSuffix` and a distinct app label, producing
  `degree-explorer-tech.apk` / `-business.apk` / `-health.apk`.
- A Gradle task (run before `mergeAssets`) copies `../dist/<flavor>/` into
  `app/src/<flavor>/assets/`. The web build (`npm run build`) must run first; CI enforces the
  order. Each APK therefore bundles its track's full offline site: HTML/CSS/JS,
  `kiosk-data.json`, hero photos, QR PNGs, and the degree-sheet PDFs.
- `assets/` directories are build outputs — gitignored, populated by CI (mirrors how `dist/`
  is gitignored and rebuilt).

### Build & distribution (CI)

- `.github/workflows/android.yml`: on tag/release or manual dispatch — `npm ci && npm run
  build`, copy each `dist/<track>` into its flavor assets, set up JDK 17 + Android SDK,
  `./gradlew assembleRelease`, sign, and upload the three APKs as release artifacts.
- **Signing:** a release keystore stored as CI secrets (base64 keystore + passwords); a
  self-signed release key is sufficient for sideloading. Documented.
- **Install:** sideload per stick (`adb install degree-explorer-<track>.apk` or USB), then
  one-time device-owner provisioning. Fleet/MDM management is a later concern.

## Testing

The native surface is intentionally thin; the kiosk logic is the **already-tested web app**
(61 Node tests in the monorepo). Native verification:

- **Instrumented smoke test** (Espresso + a WebView assertion) where the harness cost is
  worth it: the WebView loads `index.html?signage=1`, the attract screen's marker element
  appears, and no "Email this" button is present. Runs on a CI emulator if feasible;
  otherwise documented as a manual check.
- **Manual QA on a real stick (release gate):** boots straight into the kiosk; full-screen,
  no system bars; touch funnel works end to end; QR images render; idle auto-reset fires;
  back/home/recents cannot escape (device-owner); app returns after a forced stop and after
  a reboot; works with Wi-Fi disabled.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| WebView `file://` quirks vs the http(s) the app was built for | Same engine (Chromium WebView); smoke test + manual QA; keep all asset refs relative (already are) |
| Lock-task not truly locked without device owner | Document the one-time `dpm set-device-owner` provisioning; fall back to pinning otherwise |
| Cheap-stick WebView is an old Chromium | Target a minSdk with a modern System WebView; the web app uses no exotic APIs; verify on the actual stick model |
| CI emulator tests flaky/slow | Keep the instrumented test minimal; make manual-QA the authoritative release gate |
| Content drift (APK bundles a snapshot) | v1 accepts rebuild-and-reinstall; OTA refresh is a noted follow-up |

## Out of scope (explicit)

OTA content updates; "Email this"/lead capture on Android; MDM fleet management; Play Store
publishing; an attract-only non-touch mode; any change to the Pi/balena or Pages deployments
beyond the additive `?signage=1` guard.
