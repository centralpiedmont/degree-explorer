import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val keystorePropsFile = rootProject.file("keystore.properties")
val keystoreProps = Properties().apply {
    if (keystorePropsFile.exists()) keystorePropsFile.inputStream().use { load(it) }
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
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    testBuildType = "debug"

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
        create("hospitality") {
            dimension = "track"; applicationIdSuffix = ".hospitality"
            resValue("string", "app_name", "Degree Explorer — Hospitality")
        }
    }

    // Each flavor bundles its track's built static site directly from ../../dist/<flavor>.
    // Run `npm run build` before assembling so dist/ is populated.
    sourceSets {
        getByName("tech")        { assets.srcDir("../../dist/tech") }
        getByName("business")    { assets.srcDir("../../dist/business") }
        getByName("health")      { assets.srcDir("../../dist/health") }
        getByName("hospitality") { assets.srcDir("../../dist/hospitality") }
    }

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

    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("release")
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

dependencies {
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
}
