import java.net.URI

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
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

android {
    namespace = "com.hanseo.dearshot"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.hanseo.dearshot"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "API_BASE_URL", "\"${apiBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
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
}

