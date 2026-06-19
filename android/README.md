# Degree Explorer — Android signage app

Packages each Degree Explorer track as a locked-down Android **WebView kiosk APK** for a
generic Android HDMI signage stick driving a touchscreen. Same content as the web kiosk,
fully offline (no `INTERNET` permission), QR-only (the "Email this" button is hidden via
`?signage=1`). One APK per track via Gradle product flavors.

## What it is

- A single full-screen `WebView` Activity (`KioskActivity`) that loads the bundled track
  site from APK assets: `file:///android_asset/index.html?signage=1`.
- Three product flavors — `tech`, `business`, `health` — each sourcing its assets directly
  from the repo's built `dist/<flavor>/`. Output APKs:
  `degree-explorer-tech-<buildtype>.apk`, `-business-`, `-health-`.
- Kiosk hardening: device-owner **lock-task** (with screen-pinning fallback),
  `BOOT_COMPLETED` auto-start, `FLAG_KEEP_SCREEN_ON`, immersive sticky fullscreen,
  auto-relaunch, landscape lock.

> Flavors currently cover the original three tracks. A `hospitality` flavor is a follow-up.

## Prerequisites

- JDK 17 and the Android SDK. On this machine:
  `export JAVA_HOME=$(/usr/libexec/java_home -v 17)` and
  `export ANDROID_HOME=$HOME/Library/Android/sdk`.
- The web content must be built first (the flavors read `../dist/<flavor>/`):
  from the repo root, `npm run build`.

## Build (local)

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
export ANDROID_HOME=$HOME/Library/Android/sdk
npm run build                     # from repo root — populates dist/<track>/
cd android && ./gradlew assembleRelease   # 3 signed APKs (or assembleDebug for debug-signed)
```

Signed release APKs land at `android/app/build/outputs/apk/<track>/release/degree-explorer-<track>-release.apk`.

Release signing reads `android/keystore.properties` (gitignored) when present, otherwise the
env vars `KEYSTORE_FILE` / `KEYSTORE_PASSWORD` / `KEY_ALIAS` / `KEY_PASSWORD` (used by CI).
Generate a local keystore once:

```bash
cd android && mkdir -p keystore
keytool -genkeypair -v -keystore keystore/release.jks -alias degree-explorer \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass <pw> -keypass <pw> \
  -dname "CN=Central Piedmont Degree Explorer, O=Central Piedmont, L=Charlotte, ST=NC, C=US"
printf 'storeFile=keystore/release.jks\nstorePassword=<pw>\nkeyAlias=degree-explorer\nkeyPassword=<pw>\n' > keystore.properties
```

## Build (CI)

`.github/workflows/android.yml` builds and signs all three APKs and uploads them as
artifacts. Trigger it via **workflow_dispatch** or by pushing a tag matching `android-v*`.
Required repo secrets: `KEYSTORE_BASE64` (base64 of the keystore), `KEYSTORE_PASSWORD`,
`KEY_ALIAS`, `KEY_PASSWORD`.

## Install on a stick

```bash
"$ANDROID_HOME"/platform-tools/adb install -r degree-explorer-<track>-release.apk
```

### Lock it down (device owner — one-time, true kiosk lockdown)

On a freshly set-up stick **with no other accounts added**:

```bash
adb shell dpm set-device-owner edu.cpcc.degreeexplorer.<track>/edu.cpcc.degreeexplorer.KioskDeviceAdminReceiver
```

Replace `<track>` with `tech`, `business`, or `health` (it is the flavor's
`applicationIdSuffix`). With device owner set, `startLockTask()` prevents escape via
home/recents/back. Without it, the app still runs and pins, but is escapable.

**Device owner is recommended for any unattended kiosk, not just for lockdown.** On
Android 10+, background-activity-launch restrictions make the boot auto-start
(`BootReceiver`) and the `onStop` auto-relaunch unreliable on a *non*-device-owner device —
the system may drop those launches. Provisioning the app as device owner is what makes
boot-to-kiosk and relaunch-after-exit behave dependably.

Set landscape orientation and other display options on the stick as needed
(`adb shell wm` / the device's display settings).

## Updating content

The APK bundles a snapshot of the track site. To update: re-run `npm run build`, rebuild the
APK, and reinstall. (No OTA content refresh in v1.)

## Behavior notes

- **Offline:** all program data, images, QR codes, and degree-sheet PDFs are bundled; no
  network is required at the venue. There is no `INTERNET` permission.
- **QR-only:** the "Email this" lead-capture button is hidden on signage (`?signage=1`); the
  degree-sheet and info-session QR codes remain (scanned by visitors' own phones).

## ⚠️ Do not develop this repo inside iCloud-synced folders

iCloud Drive (Desktop & Documents sync) duplicates files (`name 2.ext`), including Gradle
`build/` artifacts and even `.git` internals, which causes duplicate-class build failures and
ref corruption. Keep the working copy outside iCloud (e.g. `~/Developer/`). If you must build
inside it, run `./gradlew clean` before each build and remove any `*" 2"*` duplicates.
