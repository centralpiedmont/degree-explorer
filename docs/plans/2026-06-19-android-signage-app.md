# Android Signage App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `android/` module to the `degree-explorer` monorepo that packages the existing offline kiosk as a locked-down Android WebView kiosk app — one APK per track (tech/business/health) — for a generic Android HDMI signage stick driving a touchscreen.

**Architecture:** A thin single-Activity Kotlin app whose only screen is a full-screen `WebView` loading the bundled track site from APK assets (`file:///android_asset/index.html?signage=1`). Each Gradle product flavor sources its assets directly from the already-built `dist/<flavor>/`. Android adds the kiosk hardening (lock-task via device owner, boot auto-start, keep-screen-on, immersive fullscreen, auto-relaunch, landscape lock). The one shared web change is a `?signage=1` guard that hides "Email this" (QR-only on signage). Release APKs are signed from a keystore and also built in CI.

**Tech Stack:** Kotlin 2.0.21, Android Gradle Plugin 8.7.2, Gradle 8.10.2 (wrapper), JDK 17, compileSdk/targetSdk 35, minSdk 24, platform `android.webkit.WebView` (zero third-party app deps). Node build (existing) produces the bundled web content. GitHub Actions for CI APK builds.

## Local toolchain (verified present on the build machine)

- JDK 17: `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`
- Android SDK: `export ANDROID_HOME=$HOME/Library/Android/sdk` (also `ANDROID_SDK_ROOT`)
- `keytool` at `/usr/bin/keytool`; `adb` at `$ANDROID_HOME/platform-tools/adb`.
- Set both env vars at the start of every Gradle command. Gradle finds the SDK via `ANDROID_HOME` (and `android/local.properties`, created in Task 2, gitignored).

## Paths & conventions

- `$REPO` = `/Users/frazier/Documents/Administrative/degree-explorer` (the monorepo; run all commands from here unless noted).
- Android module lives at `$REPO/android/`. App package/namespace: `edu.cpcc.degreeexplorer` (per-flavor `applicationIdSuffix` `.tech` / `.business` / `.health`).
- The web build must run before any Android assemble: `npm run build` populates `dist/{tech,business,health}/`, which the flavors read as their asset source.
- Work happens on a feature branch `android-signage` (the controller creates it before Task 1; do NOT work on `main`).

## Global Constraints

- **Kotlin only, zero third-party app dependencies** (plain `android.webkit.WebView` + platform `Activity`). Kotlin stdlib (from the Kotlin plugin) is the only library.
- **Offline-first:** no `INTERNET` permission; WebView loads `file:///android_asset/...` only. No network calls.
- **QR-only:** the "Email this" button must not appear on the signage build. The web app hides it when `?signage=1` is present; the WebView always loads with `?signage=1`.
- **Three flavors** (`tech`, `business`, `health`), dimension `track`; each sources assets from `../../dist/<flavor>/`. APK artifacts: `degree-explorer-<track>-<buildtype>.apk`.
- **Versions:** AGP 8.7.2, Kotlin 2.0.21, Gradle 8.10.2, compileSdk 35, targetSdk 35, minSdk 24, JDK 17.
- **Kiosk hardening required:** device-owner lock-task (with screen-pinning fallback), `BOOT_COMPLETED` auto-start, `FLAG_KEEP_SCREEN_ON`, immersive sticky fullscreen, auto-relaunch on dismissal, landscape lock.
- **`android/build/`, `android/app/build/`, `android/local.properties`, `android/keystore/`, `android/keystore.properties`, and `dist/` are gitignored.** Never commit the keystore or its passwords.
- Commit after every task on the `android-signage` branch. Do not push or open a PR until the final task (and only as the plan directs).

---

### Task 1: Front-end `?signage=1` guard (hide "Email this" on signage)

The lone shared web change. `engine/public/app.js` renders an "Email this" button (class `email`) in the program-detail convert band and the quiz-result band. On signage there is no server, so hide it when `?signage=1` is in the URL. Additive and parity-safe: with no param, behavior is unchanged (Pi/Pages).

**Files:**
- Modify: `$REPO/engine/public/app.js` (add a `SIGNAGE` constant at module top; gate every `.email` button render and its click wiring)

**Interfaces:**
- Produces: when the page is loaded with `?signage=1`, no element with class `email` is rendered anywhere; with no such param, the `email` button renders as before.

- [ ] **Step 1: Read the file and locate the email button(s)**

Run: `cd "$REPO" && grep -n "class=\"email\"\|\.email" engine/public/app.js`
Expected: one or more lines emitting `<button class="email">Email this</button>` and one or more wiring a `.email` click handler (e.g. `…querySelector('.email').onclick = …`). Note every line number.

- [ ] **Step 2: Add the SIGNAGE constant at the top of app.js**

Add as the first executable line at module scope (it only reads `location`, so placement at the very top is safe):

```javascript
// Signage builds (Android WebView) pass ?signage=1 — no server, so hide "Email this".
const SIGNAGE = new URLSearchParams(location.search).get('signage') === '1';
```

- [ ] **Step 3: Gate every "Email this" render**

For each template string that emits the button, wrap it so it renders nothing under signage. Change each:

```javascript
<button class="email">Email this</button>
```
to:
```javascript
${SIGNAGE ? '' : '<button class="email">Email this</button>'}
```

- [ ] **Step 4: Guard every `.email` click wiring**

For each line that wires the handler, make it null-safe so it no-ops when the button is absent. Change each:

```javascript
band.querySelector('.email').onclick = () => state.openEmail();
```
to:
```javascript
band.querySelector('.email')?.addEventListener('click', () => state.openEmail());
```
(Use optional chaining `?.` so a missing button doesn't throw. Keep whatever the existing handler body is — `state.openEmail()` or equivalent — just make the lookup null-safe.)

- [ ] **Step 5: Build the tech track and verify with a headless browser**

Run:
```bash
cd "$REPO" && npm run build:tech
cd "$REPO/dist" && python3 -m http.server 8131 >/dev/null 2>&1 &  echo $! > /tmp/de8131.pid
```
Load Playwright MCP tools (one ToolSearch call):
`select:mcp__plugin_playwright_playwright__browser_navigate,mcp__plugin_playwright_playwright__browser_click,mcp__plugin_playwright_playwright__browser_snapshot,mcp__plugin_playwright_playwright__browser_evaluate,mcp__plugin_playwright_playwright__browser_close`

WITH signage: navigate to `http://localhost:8131/tech/index.html?signage=1`, take a snapshot, click the first world tile, then the first program tile (use the snapshot to find them), then run `browser_evaluate` with `() => document.querySelectorAll('.email').length` — expect **0**.

WITHOUT signage: navigate to `http://localhost:8131/tech/` and repeat the two clicks, then `() => document.querySelectorAll('.email').length` — expect **≥ 1**.

Stop the server: `kill $(cat /tmp/de8131.pid)`.

- [ ] **Step 6: Confirm no regression in the web test suite**

Run: `cd "$REPO" && npm test`
Expected: 61/61 pass (this change is render-only; suites are unaffected).

- [ ] **Step 7: Commit**

```bash
cd "$REPO" && git add engine/public/app.js && git commit -m "feat(web): hide 'Email this' when ?signage=1 (QR-only signage builds)"
```

---

### Task 2: Android module scaffold — Gradle, flavors, WebView Activity, bundled assets

Stand up the buildable Android project: Gradle wrapper, three flavors sourcing assets from `dist/<flavor>/`, a minimal full-screen WebView Activity, theme, adaptive launcher icon, and ignores. Hardening comes in Task 3.

**Files (all under `$REPO/android/`):**
- Create: `settings.gradle.kts`, `build.gradle.kts`, `gradle.properties`, `.gitignore`, `local.properties` (gitignored)
- Create: `gradle/wrapper/gradle-wrapper.properties` (+ wrapper jar + `gradlew`/`gradlew.bat` via `gradle wrapper`)
- Create: `app/build.gradle.kts`, `app/proguard-rules.pro`
- Create: `app/src/main/AndroidManifest.xml`
- Create: `app/src/main/java/edu/cpcc/degreeexplorer/KioskActivity.kt`
- Create: `app/src/main/res/values/themes.xml`, `app/src/main/res/values/strings.xml`, `app/src/main/res/values/colors.xml`
- Create: `app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, `app/src/main/res/drawable/ic_launcher_foreground.xml`

**Interfaces:**
- Produces: `./gradlew :app:assembleTechDebug` builds `app/build/outputs/apk/tech/debug/app-tech-debug.apk`, whose `assets/` contains the tech site (`index.html`, `app.js`, `kiosk-data.json`, `assets/…`, `sheets/…`). `KioskActivity` loads `file:///android_asset/index.html?signage=1`.

- [ ] **Step 1: Create the directory tree**

```bash
mkdir -p "$REPO"/android/app/src/main/java/edu/cpcc/degreeexplorer
mkdir -p "$REPO"/android/app/src/main/res/{values,mipmap-anydpi-v26,drawable}
mkdir -p "$REPO"/android/gradle/wrapper
```

- [ ] **Step 2: `android/settings.gradle.kts`**

```kotlin
pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "degree-explorer-kiosk"
include(":app")
```

- [ ] **Step 3: `android/build.gradle.kts` (root)**

```kotlin
plugins {
    id("com.android.application") version "8.7.2" apply false
    id("org.jetbrains.kotlin.android") version "2.0.21" apply false
}
```

- [ ] **Step 4: `android/gradle.properties`**

```properties
org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
org.gradle.caching=true
```

- [ ] **Step 5: `android/.gitignore`**

```gitignore
.gradle/
build/
app/build/
local.properties
keystore/
keystore.properties
*.keystore
*.jks
.idea/
*.iml
.DS_Store
```

- [ ] **Step 6: `android/app/build.gradle.kts`**

```kotlin
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "edu.cpcc.degreeexplorer"
    compileSdk = 35

    defaultConfig {
        applicationId = "edu.cpcc.degreeexplorer"
        minSdk = 24
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
    }

    flavorDimensions += "track"
    productFlavors {
        create("tech") {
            dimension = "track"; applicationIdSuffix = ".tech"
            resValue("string", "app_name", "Degree Explorer — IT")
        }
        create("business") {
            dimension = "track"; applicationIdSuffix = ".business"
            resValue("string", "app_name", "Degree Explorer — Business")
        }
        create("health") {
            dimension = "track"; applicationIdSuffix = ".health"
            resValue("string", "app_name", "Degree Explorer — Health")
        }
    }

    // Each flavor bundles its track's built static site directly from ../../dist/<flavor>.
    // Run `npm run build` before assembling so dist/ is populated.
    sourceSets {
        getByName("tech")     { assets.srcDir("../../dist/tech") }
        getByName("business") { assets.srcDir("../../dist/business") }
        getByName("health")   { assets.srcDir("../../dist/health") }
    }

    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    // Name artifacts degree-explorer-<flavor>-<buildtype>.apk
    applicationVariants.all {
        outputs.all {
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl).outputFileName =
                "degree-explorer-${flavorName}-${buildType.name}.apk"
        }
    }
}
```

> Note: `app_name` is supplied per-flavor via `resValue` (do NOT also define `app_name` in `strings.xml`, or the build fails with a duplicate-resource error).

- [ ] **Step 7: `android/app/proguard-rules.pro`** (keep WebView JS interface safe; minify is off but keep the file present)

```proguard
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
```

- [ ] **Step 8: `android/app/src/main/res/values/strings.xml`** (no `app_name` here — it comes from flavors)

```xml
<resources>
    <string name="device_admin_label">Degree Explorer Kiosk</string>
</resources>
```

- [ ] **Step 9: `android/app/src/main/res/values/colors.xml`**

```xml
<resources>
    <color name="cpcc_gray">#54565A</color>
    <color name="black">#000000</color>
</resources>
```

- [ ] **Step 10: `android/app/src/main/res/values/themes.xml`** (fullscreen, no action bar, black background to avoid flashes)

```xml
<resources>
    <style name="Theme.Kiosk" parent="@android:style/Theme.Material.NoActionBar.Fullscreen">
        <item name="android:windowBackground">@color/black</item>
    </style>
</resources>
```

- [ ] **Step 11: Adaptive launcher icon** — `res/drawable/ic_launcher_foreground.xml`

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp" android:height="108dp"
    android:viewportWidth="108" android:viewportHeight="108">
    <path android:fillColor="#FFFFFF"
        android:pathData="M30,38h48v8h-48z M30,54h48v8h-48z M30,70h32v8h-32z"/>
</vector>
```

and `res/mipmap-anydpi-v26/ic_launcher.xml`:

```xml
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/cpcc_gray"/>
    <foreground android:drawable="@drawable/ic_launcher_foreground"/>
</adaptive-icon>
```

- [ ] **Step 12: `android/app/src/main/AndroidManifest.xml`** (minimal; Task 3 adds the receivers)

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application
        android:allowBackup="false"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.Kiosk"
        android:hardwareAccelerated="true">
        <activity
            android:name=".KioskActivity"
            android:exported="true"
            android:screenOrientation="sensorLandscape"
            android:configChanges="orientation|screenSize|keyboardHidden|keyboard|uiMode|navigation">
            <intent-filter>
                <action android:name="android.intent.action.MAIN"/>
                <category android:name="android.intent.category.LAUNCHER"/>
            </intent-filter>
        </activity>
    </application>
</manifest>
```

- [ ] **Step 13: `KioskActivity.kt`** (minimal WebView; Task 3 hardens it)

```kotlin
package edu.cpcc.degreeexplorer

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class KioskActivity : Activity() {
    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        webView = WebView(this)
        setContentView(webView)

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = true
            allowContentAccess = false
            cacheMode = WebSettings.LOAD_NO_CACHE
            mediaPlaybackRequiresUserGesture = false
            setSupportZoom(false)
            builtInZoomControls = false
            textZoom = 100
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.setOnLongClickListener { true }      // suppress text-selection/context menu
        webView.isLongClickable = false

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean {
                // Content is fully local; refuse to navigate off the bundled site.
                return req.url.scheme != "file"
            }
        }
        webView.loadUrl("file:///android_asset/index.html?signage=1")
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}
```

- [ ] **Step 14: Generate the Gradle wrapper (pin 8.10.2) and `local.properties`**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO/android"
printf 'sdk.dir=%s\n' "$ANDROID_HOME" > local.properties
gradle wrapper --gradle-version 8.10.2 --distribution-type bin
```
Expected: creates `gradlew`, `gradlew.bat`, `gradle/wrapper/gradle-wrapper.jar`, and `gradle-wrapper.properties` referencing `gradle-8.10.2-bin.zip`.

- [ ] **Step 15: Build the web content, then assemble the tech debug APK**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO" && npm run build
cd "$REPO/android" && ./gradlew :app:assembleTechDebug --no-daemon
```
Expected: `BUILD SUCCESSFUL`; APK at `app/build/outputs/apk/tech/debug/degree-explorer-tech-debug.apk`.

- [ ] **Step 16: Verify the APK actually bundles the tech site**

```bash
cd "$REPO/android"
unzip -l app/build/outputs/apk/tech/debug/degree-explorer-tech-debug.apk | grep -E "assets/(index.html|app.js|kiosk-data.json|sheets/)" | head
```
Expected: lists `assets/index.html`, `assets/app.js`, `assets/kiosk-data.json`, and at least one `assets/sheets/*.pdf`.

- [ ] **Step 17: Commit**

```bash
cd "$REPO" && git add android && git commit -m "feat(android): Gradle scaffold, 3 flavors, WebView kiosk Activity bundling dist/<track>"
```

---

### Task 3: Kiosk hardening — lock-task, boot auto-start, immersive, keep-awake, relaunch

Turn the plain WebView Activity into a locked-down kiosk: device-owner lock-task (with pinning fallback), immersive sticky fullscreen, keep-screen-on, auto-relaunch on dismissal, and a boot receiver that relaunches after power-cycles.

**Files:**
- Create: `android/app/src/main/java/edu/cpcc/degreeexplorer/KioskDeviceAdminReceiver.kt`
- Create: `android/app/src/main/java/edu/cpcc/degreeexplorer/BootReceiver.kt`
- Create: `android/app/src/main/res/xml/device_admin.xml`
- Modify: `android/app/src/main/java/edu/cpcc/degreeexplorer/KioskActivity.kt` (add hardening)
- Modify: `android/app/src/main/AndroidManifest.xml` (receivers + lock-task affinity)

**Interfaces:**
- Consumes: `KioskActivity` (Task 2).
- Produces: an Activity that calls `startLockTask()` when permitted, hides system bars immersively, holds the screen on, relaunches itself if stopped; a `BootReceiver` that launches `KioskActivity` on `BOOT_COMPLETED`; a `KioskDeviceAdminReceiver` enabling device-owner provisioning.

- [ ] **Step 1: `res/xml/device_admin.xml`**

```xml
<device-admin xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-policies>
        <force-lock/>
    </uses-policies>
</device-admin>
```

- [ ] **Step 2: `KioskDeviceAdminReceiver.kt`**

```kotlin
package edu.cpcc.degreeexplorer

import android.app.admin.DeviceAdminReceiver

class KioskDeviceAdminReceiver : DeviceAdminReceiver()
```

- [ ] **Step 3: `BootReceiver.kt`**

```kotlin
package edu.cpcc.degreeexplorer

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            val launch = Intent(context, KioskActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(launch)
        }
    }
}
```

- [ ] **Step 4: Add hardening to `KioskActivity.kt`**

Add these imports:
```kotlin
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.view.WindowManager
```
Add a field and an `enableImmersive()` + `maybeLockTask()` helper, and call them. Concretely, set the keep-screen-on flag and lock-task whitelist in `onCreate` (before `loadUrl`), and re-assert immersive on focus/resume:

```kotlin
    private val adminComponent get() = ComponentName(this, KioskDeviceAdminReceiver::class.java)
    private val dpm get() = getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    // --- add inside onCreate, before webView.loadUrl(...) ---
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    if (dpm.isDeviceOwnerApp(packageName)) {
        dpm.setLockTaskPackages(adminComponent, arrayOf(packageName))
    }

    // --- add as methods ---
    private fun maybeLockTask() {
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
            val state = am.lockTaskModeState
            if (state == android.app.ActivityManager.LOCK_TASK_MODE_NONE) startLockTask()
        } catch (_: Exception) { /* pinning may be unavailable; ignore */ }
    }

    private fun enableImmersive() {
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                or View.SYSTEM_UI_FLAG_FULLSCREEN
                or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION)
    }

    override fun onResume() {
        super.onResume()
        enableImmersive()
        maybeLockTask()
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) enableImmersive()
    }
```

Also call `enableImmersive()` once at the end of `onCreate`.

- [ ] **Step 5: Auto-relaunch on dismissal** — add to `KioskActivity.kt`

```kotlin
    override fun onStop() {
        super.onStop()
        // If the kiosk gets backgrounded (e.g. a stray HOME), bring it straight back.
        if (!isFinishing) {
            startActivity(Intent(this, KioskActivity::class.java)
                .addFlags(Intent.FLAG_ACTIVITY_REORDER_TO_FRONT))
        }
    }
```
Add `import android.content.Intent` if not already present.

- [ ] **Step 6: Update `AndroidManifest.xml`** — add the boot permission, lock-task affinity, and register the two receivers

Add `<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>` above `<application>`. Add `android:lockTaskMode="if_whitelisted"` to the `<activity>`. Inside `<application>`, add:

```xml
        <receiver
            android:name=".BootReceiver"
            android:exported="true"
            android:enabled="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED"/>
            </intent-filter>
        </receiver>

        <receiver
            android:name=".KioskDeviceAdminReceiver"
            android:exported="true"
            android:permission="android.permission.BIND_DEVICE_ADMIN">
            <meta-data
                android:name="android.app.device_admin"
                android:resource="@xml/device_admin"/>
            <intent-filter>
                <action android:name="android.app.action.DEVICE_ADMIN_ENABLED"/>
            </intent-filter>
        </receiver>
```

- [ ] **Step 7: Build all three debug flavors to confirm it compiles**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO" && npm run build
cd "$REPO/android" && ./gradlew assembleDebug --no-daemon
```
Expected: `BUILD SUCCESSFUL`; three APKs under `app/build/outputs/apk/{tech,business,health}/debug/degree-explorer-<track>-debug.apk`.

- [ ] **Step 8: Lint-check the manifest merged correctly**

```bash
cd "$REPO/android"
unzip -p app/build/outputs/apk/tech/debug/degree-explorer-tech-debug.apk AndroidManifest.xml | strings | grep -E "BOOT_COMPLETED|device_admin|lockTaskMode" | head
```
Expected: shows the boot action, device-admin metadata, and lock-task mode present in the packaged manifest.

- [ ] **Step 9: Commit**

```bash
cd "$REPO" && git add android && git commit -m "feat(android): kiosk hardening (lock-task, boot auto-start, immersive, keep-awake, relaunch)"
```

---

### Task 4: Release signing (keystore) + GitHub Actions APK build

Add a release signing config (keystore read from `keystore.properties` locally / env in CI), produce signed release APKs locally, and add the CI workflow that builds and uploads all three. Generate the keystore and set the four CI secrets.

**Files:**
- Modify: `android/app/build.gradle.kts` (signingConfigs + wire release)
- Create: `android/keystore/` + `android/keystore.properties` (both gitignored; local only)
- Create: `$REPO/.github/workflows/android.yml`

**Interfaces:**
- Consumes: the flavors/build from Tasks 2–3.
- Produces: `./gradlew assembleRelease` emits three **signed** `degree-explorer-<track>-release.apk`; CI uploads the same three as workflow artifacts.

- [ ] **Step 1: Generate a release keystore (local, gitignored)**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
cd "$REPO/android" && mkdir -p keystore
keytool -genkeypair -v -keystore keystore/release.jks -alias degree-explorer \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass cpcckiosk -keypass cpcckiosk \
  -dname "CN=Central Piedmont Degree Explorer, O=Central Piedmont, L=Charlotte, ST=NC, C=US"
printf 'storeFile=keystore/release.jks\nstorePassword=cpcckiosk\nkeyAlias=degree-explorer\nkeyPassword=cpcckiosk\n' > keystore.properties
```
Expected: `keystore/release.jks` created; `keystore.properties` written. (Both are gitignored — verify `git -C "$REPO" status --porcelain android/keystore android/keystore.properties` shows nothing.)

- [ ] **Step 2: Wire signing into `android/app/build.gradle.kts`**

Add near the top of the file (before the `android { }` block):

```kotlin
import java.util.Properties
val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
}
```

Inside `android { }`, add a `signingConfigs` block and reference it from `release`:

```kotlin
    signingConfigs {
        create("release") {
            val storePath = keystoreProps.getProperty("storeFile") ?: System.getenv("KEYSTORE_FILE")
            if (storePath != null) {
                storeFile = rootProject.file(storePath)
                storePassword = keystoreProps.getProperty("storePassword") ?: System.getenv("KEYSTORE_PASSWORD")
                keyAlias = keystoreProps.getProperty("keyAlias") ?: System.getenv("KEY_ALIAS")
                keyPassword = keystoreProps.getProperty("keyPassword") ?: System.getenv("KEY_PASSWORD")
            }
        }
    }
```
and in `buildTypes { getByName("release") { … } }` add as the first line:
```kotlin
            signingConfig = signingConfigs.getByName("release")
```

- [ ] **Step 3: Build signed release APKs locally**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO" && npm run build
cd "$REPO/android" && ./gradlew assembleRelease --no-daemon
```
Expected: `BUILD SUCCESSFUL`; `app/build/outputs/apk/{tech,business,health}/release/degree-explorer-<track>-release.apk`.

- [ ] **Step 4: Verify the release APKs are signed**

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
APKSIGNER=$(ls "$ANDROID_HOME"/build-tools/*/apksigner | sort | tail -1)
"$APKSIGNER" verify --print-certs "$REPO/android/app/build/outputs/apk/tech/release/degree-explorer-tech-release.apk" | head
```
Expected: prints a signer certificate (CN=Central Piedmont Degree Explorer …), no "not signed" error.

- [ ] **Step 5: Write `$REPO/.github/workflows/android.yml`**

```yaml
name: Build Android signage APKs

on:
  workflow_dispatch:
  push:
    tags: ["android-v*"]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: "17"
      - uses: android-actions/setup-android@v3
      - name: Decode keystore
        run: |
          echo "${{ secrets.KEYSTORE_BASE64 }}" | base64 -d > android/keystore-ci.jks
        shell: bash
      - name: Assemble release APKs
        working-directory: android
        env:
          KEYSTORE_FILE: keystore-ci.jks
          KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
          KEY_ALIAS: ${{ secrets.KEY_ALIAS }}
          KEY_PASSWORD: ${{ secrets.KEY_PASSWORD }}
        run: ./gradlew assembleRelease --no-daemon
      - uses: actions/upload-artifact@v4
        with:
          name: degree-explorer-apks
          path: android/app/build/outputs/apk/*/release/degree-explorer-*-release.apk
          if-no-files-found: error
```

> The CI signing config reads the keystore path from `KEYSTORE_FILE` (env) when `keystore.properties` is absent (it's gitignored, so it won't exist in CI). `rootProject.file("keystore-ci.jks")` resolves under `android/`.

- [ ] **Step 6: Set the four GitHub Actions secrets**

```bash
cd "$REPO"
base64 -i android/keystore/release.jks | gh secret set KEYSTORE_BASE64 --repo centralpiedmont/degree-explorer
gh secret set KEYSTORE_PASSWORD --body "cpcckiosk" --repo centralpiedmont/degree-explorer
gh secret set KEY_ALIAS --body "degree-explorer" --repo centralpiedmont/degree-explorer
gh secret set KEY_PASSWORD --body "cpcckiosk" --repo centralpiedmont/degree-explorer
```
Expected: four "✓ Set secret" confirmations.

- [ ] **Step 7: Commit (workflow + signing wiring only — never the keystore)**

```bash
cd "$REPO"
git status --porcelain android/keystore android/keystore.properties   # must be EMPTY (gitignored)
git add android/app/build.gradle.kts .github/workflows/android.yml && git commit -m "ci(android): release signing config + GitHub Actions APK build"
```

---

### Task 5: Instrumented smoke test (WebView loads, no email button)

A minimal on-device/emulator test proving the bundled site loads in the WebView and the signage guard works. Kept tiny; manual QA (Task 6) remains the authoritative functional gate.

**Files:**
- Create: `android/app/src/androidTest/java/edu/cpcc/degreeexplorer/KioskSmokeTest.kt`
- Modify: `android/app/build.gradle.kts` (androidTest deps + test runner + testBuildType)

**Interfaces:**
- Consumes: `KioskActivity`.
- Produces: an instrumented test that launches `KioskActivity`, waits for the WebView to finish loading `index.html?signage=1`, and asserts the page rendered (attract content present) with zero `.email` elements.

- [ ] **Step 1: Add test deps + runner to `android/app/build.gradle.kts`**

In `defaultConfig { }` add:
```kotlin
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
```
In `android { }` add `testBuildType = "debug"`. Add to `dependencies { }` (create the block if absent — these are the only third-party libs, and they're test-only):
```kotlin
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
```

- [ ] **Step 2: Write `KioskSmokeTest.kt`**

```kotlin
package edu.cpcc.degreeexplorer

import android.webkit.WebView
import androidx.test.core.app.ActivityScenario
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

@RunWith(AndroidJUnit4::class)
class KioskSmokeTest {
    @Test
    fun loadsSiteWithSignageAndNoEmailButton() {
        ActivityScenario.launch(KioskActivity::class.java).use { scenario ->
            Thread.sleep(4000) // allow the WebView to load the bundled site + render
            val emailCount = evalInt(scenario, "document.querySelectorAll('.email').length")
            val bodyLen = evalInt(scenario, "document.body.innerText.length")
            assertTrue("page should render content", bodyLen > 0)
            assertEquals("no email button under ?signage=1", 0, emailCount)
        }
    }

    private fun evalInt(scenario: ActivityScenario<KioskActivity>, js: String): Int {
        val latch = CountDownLatch(1)
        var result = -1
        scenario.onActivity { act ->
            val wv = (act.findViewById<android.view.View>(android.R.id.content) as android.view.ViewGroup)
                .getChildAt(0) as WebView
            wv.evaluateJavascript(js) { v ->
                result = v.trim('"').toIntOrNull() ?: -1
                latch.countDown()
            }
        }
        latch.await(5, TimeUnit.SECONDS)
        return result
    }
}
```

- [ ] **Step 3: Build the androidTest APK (compile check, no device needed)**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO" && npm run build
cd "$REPO/android" && ./gradlew :app:assembleTechDebugAndroidTest --no-daemon
```
Expected: `BUILD SUCCESSFUL` (the test compiles).

- [ ] **Step 4: Run on an emulator if one is available; otherwise document as manual**

```bash
export ANDROID_HOME=$HOME/Library/Android/sdk; export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
adb devices
```
If a device/emulator is listed, run: `cd "$REPO/android" && ./gradlew :app:connectedTechDebugAndroidTest --no-daemon` and expect the test to pass. If no device is available, that is acceptable — record in the task report that the test compiles and must be run on the CI emulator or a real device (the manual QA in Task 6 covers the behavior).

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add android && git commit -m "test(android): instrumented WebView smoke test (loads site, no email under signage)"
```

---

### Task 6: README, .gitignore for dist-in-android, and final verification

Document build/sign/provision/install, ensure the monorepo ignores the Android build outputs, and run the final local verification gate.

**Files:**
- Create: `android/README.md`
- Modify: `$REPO/.gitignore` (ignore `android/**/build/` and `android/.gradle/` from the repo root, in case)
- Modify: `$REPO/README.md` (add a short "Android signage app" pointer)

**Interfaces:** none (docs + final gate).

- [ ] **Step 1: Append Android-build ignores to the repo-root `$REPO/.gitignore`**

Add these lines (the `android/.gitignore` already covers most, but belt-and-suspenders from the repo root):
```gitignore
android/.gradle/
android/build/
android/app/build/
android/local.properties
android/keystore/
android/keystore.properties
```

- [ ] **Step 2: Write `android/README.md`**

Document, concretely:
- Prerequisites: JDK 17, Android SDK, `npm run build` first.
- Build: `export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk; (cd "$REPO" && npm run build); (cd android && ./gradlew assembleRelease)` → three signed APKs at `app/build/outputs/apk/<track>/release/`.
- CI: the `android-v*` tag (or manual dispatch) runs `.github/workflows/android.yml`, which builds and uploads the three APKs as artifacts. Required secrets: `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`.
- Install on a stick: `adb install -r degree-explorer-<track>-release.apk`.
- Lock it down (device owner, one-time, on a freshly-set-up stick with no other accounts): `adb shell dpm set-device-owner edu.cpcc.degreeexplorer.<track>/edu.cpcc.degreeexplorer.KioskDeviceAdminReceiver`. Without device owner, the app still runs and pins, but is escapable.
- Updating content: re-run `npm run build`, rebuild + reinstall the APK (no OTA in v1).
- Note the QR-only behavior (no "Email this" on signage) and offline operation.

- [ ] **Step 3: Add an "Android signage app" section to `$REPO/README.md`**

A short paragraph: the `android/` module packages each track as a locked-down Android WebView kiosk APK for HDMI signage sticks; see `android/README.md`. Same content as the web kiosk, offline, QR-only.

- [ ] **Step 4: Final local verification gate**

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17); export ANDROID_HOME=$HOME/Library/Android/sdk
cd "$REPO" && rm -rf dist android/app/build && npm run build && (cd android && ./gradlew clean assembleRelease --no-daemon)
ls android/app/build/outputs/apk/*/release/degree-explorer-*-release.apk
for t in tech business health; do
  echo "=== $t ==="
  unzip -l "android/app/build/outputs/apk/$t/release/degree-explorer-$t-release.apk" | grep -cE "assets/sheets/.*\.pdf" | xargs echo "  bundled PDFs:"
done
```
Expected: three signed release APKs exist; bundled PDF counts are 14 (tech), 6 (business), 16 (health).

- [ ] **Step 5: Commit**

```bash
cd "$REPO" && git add android/README.md README.md .gitignore && git commit -m "docs(android): build/sign/provision README + repo ignores; final verification"
```

---

## Post-implementation (controller, after all tasks)

- Run the final whole-branch review over the `android-signage` branch (source surface: `android/**`, the `app.js` diff, `.github/workflows/android.yml`).
- Trigger the CI workflow once (push the branch + `gh workflow run android.yml` or an `android-v0.1.0` tag) and confirm it produces the three APK artifacts — the spec's "build in CI" gate.
- Integrate per superpowers:finishing-a-development-branch (merge `android-signage` → `main`, push).

## Self-Review

**Spec coverage:** WebView shell + bundled offline assets (Task 2) ✓; touch funnel reuse (inherent — loads the web app) ✓; QR-only via `?signage=1` (Task 1) ✓; three flavors (Task 2) ✓; kiosk hardening — lock-task/device-owner, boot, immersive, keep-awake, relaunch, landscape (Tasks 2–3) ✓; CI APK build (Task 4) ✓; release signing (Task 4) ✓; instrumented smoke test + manual-QA gate (Tasks 5–6) ✓; `android/README.md` with provisioning (Task 6) ✓; in-monorepo `android/` module (all tasks) ✓; offline / no INTERNET permission (Task 2 manifest) ✓; out-of-scope items (OTA, lead capture, MDM, Play Store, attract mode) — none added ✓.

**Placeholder scan:** no TBD/TODO; every file has complete code or an exact, enumerated doc outline (Task 6 README is a concrete bullet list of required content, not "write docs"); all commands are runnable with the env-var preamble.

**Type/name consistency:** package `edu.cpcc.degreeexplorer` and class names `KioskActivity` / `BootReceiver` / `KioskDeviceAdminReceiver` are identical across the manifest, the `dpm set-device-owner` command, and the source files; `applicationIdSuffix` `.tech/.business/.health` matches the device-owner command's `edu.cpcc.degreeexplorer.<track>`; APK output name `degree-explorer-<flavor>-<buildtype>.apk` is used identically in the build config, the unzip/verify steps, the CI artifact glob, and the README; signing reads `keystore.properties` locally and `KEYSTORE_FILE/KEYSTORE_PASSWORD/KEY_ALIAS/KEY_PASSWORD` env in CI, matching the secrets set in Task 4 Step 6 and the workflow env in Step 5.
