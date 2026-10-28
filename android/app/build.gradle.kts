import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)

    alias(libs.plugins.hilt.android)
    alias(libs.plugins.ksp)
}

// Set locally with -PdearshotApiBaseUrl=... or DEARSHOT_API_BASE_URL.
// An empty value keeps the starter app buildable before the API client is added.
val apiBaseUrl = providers.gradleProperty("dearshotApiBaseUrl")
    .orElse(providers.environmentVariable("DEARSHOT_API_BASE_URL"))
    .getOrElse("")
    .trim()

if (apiBaseUrl.isNotEmpty()) {
    val parsedUrl = URI(apiBaseUrl)
    require(parsedUrl.scheme in setOf("http", "https") && parsedUrl.host != null && parsedUrl.userInfo == null) {
        "dearshotApiBaseUrl must be an HTTP(S) URL without credentials"
    }
}
val kakaoNativeAppKey = providers
    .gradleProperty("dearshotKakaoNativeAppKey")
    .orElse(
        providers.environmentVariable("KAKAO_NATIVE_APP_KEY")
    )
    .getOrElse("")
    .trim()

if (kakaoNativeAppKey.isNotEmpty()) {
    require(
        kakaoNativeAppKey.matches(
            Regex("[0-9a-fA-F]{32}")
        )
    ) {
        "Kakao native app key must be 32 hexadecimal characters"
    }
}
// Use the Web OAuth client ID, matching GOOGLE_WEB_CLIENT_ID on the backend.
val googleWebClientId = providers
    .gradleProperty("dearshotGoogleWebClientId")
    .orElse(providers.environmentVariable("GOOGLE_WEB_CLIENT_ID"))
    .getOrElse("")
    .trim()

if (googleWebClientId.isNotEmpty()) {
    require(googleWebClientId.matches(Regex("[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com"))) {
        "Google web client ID must be an OAuth client ID ending in .apps.googleusercontent.com"
    }
}

android {
    namespace = "com.hanseo.dearshot"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hanseo.dearshot"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
        buildConfigField(
            "String",
            "KAKAO_NATIVE_APP_KEY",
            "\"$kakaoNativeAppKey\"",
        )

        manifestPlaceholders["kakaoLoginScheme"] =
            "kakao$kakaoNativeAppKey"
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", "\"$googleWebClientId\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    androidResources {
        generateLocaleConfig = true
        localeFilters.addAll(listOf("en", "ko"))

        noCompress += "onnx"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.compose.material3)
    debugImplementation(libs.androidx.compose.ui.tooling)
    implementation(libs.androidx.navigation3.runtime)
    implementation(libs.androidx.navigation3.ui)
    implementation(libs.kotlinx.serialization.core)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.retrofit.core)
    implementation(libs.retrofit.json)
    implementation(libs.okhttp.core)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.datastore.tink)
    implementation(libs.tink.android)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.junit)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)
    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.androidx.hilt.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.navigation3)
    implementation(libs.kakao.user)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play.services.auth)
    implementation(libs.google.id)
    implementation(libs.androidx.camera.core)
    implementation(libs.androidx.camera.camera2)
    implementation(libs.androidx.camera.lifecycle)
    implementation(libs.androidx.camera.view)
    implementation(libs.onnxruntime.android)
}

