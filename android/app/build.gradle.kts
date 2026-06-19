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
