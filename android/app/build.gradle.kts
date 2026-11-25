plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.gymtracker.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.gymtracker.app"
        minSdk = 23
        targetSdk = 34 // < 35 : pas d'affichage bord-à-bord forcé, la mise en page web reste correcte
        versionCode = 1
        versionName = "1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signé avec la clé de debug : l'APK est installable directement (usage personnel).
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }

    // L'interface web (dossier ../../public) est embarquée telle quelle dans l'appli.
    sourceSets["main"].assets.srcDirs("../../public")
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.documentfile:documentfile:1.0.1")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.android.gms:play-services-code-scanner:16.1.0")
}
