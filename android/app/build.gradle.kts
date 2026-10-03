plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "co.ke.mireli.driver"
    compileSdk = 36

    defaultConfig {
        // PENDING DECISION: confirm domain/brand ownership before first release.
        // Changing applicationId after publishing creates a brand new Play app.
        applicationId = "co.ke.mireli.driver"

        // Google Play requires new apps and updates to target API 36+ from
        // 31 August 2026. Re-check before every submission — this moves.
        targetSdk = 36

        // Device floor for the MVP. API 26 (Android 8) covers the large majority
        // of the phones an independent Kenyan driver actually owns, while still
        // allowing modern APIs. Raise it only after checking the real fleet.
        minSdk = 26

        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        // English is the default; Kiswahili ships as values-sw (see res/).
        // Only declare locales you have actually translated and reviewed —
        // an untranslated locale is worse than none.
        resourceConfigurations += listOf("en", "sw")

        buildConfigField(
            "String",
            "API_BASE_URL",
            "\"${project.findProperty("MIRELI_API_BASE_URL") ?: "https://staging.mireli.co.ke"}\"",
        )
    }

    signingConfigs {
        // Release signing is supplied via ~/.gradle/gradle.properties or CI
        // secrets — never committed. The debug config below is the ONLY config
        // with an inline key, and it is the Android SDK debug key.
        create("release") {
            val storePath = project.findProperty("MIRELI_KEYSTORE") as String?
            if (storePath != null && file(storePath).exists()) {
                storeFile = file(storePath)
                storePassword = project.findProperty("MIRELI_KEYSTORE_PASSWORD") as String?
                keyAlias = project.findProperty("MIRELI_KEY_ALIAS") as String?
                keyPassword = project.findProperty("MIRELI_KEY_PASSWORD") as String?
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            isMinifyEnabled = false
            versionNameSuffix = "-debug"
            buildConfigField(
                "String",
                "API_BASE_URL",
                "\"${project.findProperty("MIRELI_DEBUG_API_URL") ?: "http://10.0.2.2:3000"}\"",
            )
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("release")
            // Debuggable network logging must never reach production.
            buildConfigField("Boolean", "ENABLE_NETWORK_LOGGING", "false")
        }
    }

    // Keep line numbers for readable Play Console / Crashlytics stack traces.
    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources.excludes += setOf(
            "/META-INF/{AL2.0,LGPL2.1}",
            "META-INF/LICENSE.md",
            "META-INF/LICENSE-notice.md",
        )
    }

    testOptions {
        unitTests.isReturnDefaultValues = true
    }

    ksp {
        arg("room.schemaLocation", "$projectDir/schemas")
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.activity.compose)

    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material.icons)
    debugImplementation(libs.androidx.compose.ui.tooling)

    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)

    implementation(libs.retrofit)
    implementation(libs.retrofit.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.okhttp.tls)
    implementation(libs.kotlinx.serialization.json)

    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.biometric)

    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)

    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)

    implementation(libs.play.services.location)
    implementation(libs.accompanist.permissions)
    implementation(libs.coil.compose)

    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.3")

    testImplementation(libs.junit)
    testImplementation(libs.turbine)
    testImplementation(libs.mockk)
    androidTestImplementation(libs.androidx.test.junit)
    androidTestImplementation(libs.androidx.test.espresso.core)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
}