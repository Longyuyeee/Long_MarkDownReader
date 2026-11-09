plugins { id("com.android.application") version "8.11.0" }
android {
    namespace = "com.longyuye.mdreader.storagefixture"
    compileSdk = 36
    sourceSets.getByName("main").assets.srcDir("../fixtures/mobile-external-packs")
    sourceSets.getByName("main").assets.srcDir("build/generated/control-assets")
    defaultConfig { applicationId = "com.longyuye.mdreader.storagefixture"; minSdk = 29; targetSdk = 36; versionCode = 1; versionName = "1" }
    buildTypes { getByName("release") { isMinifyEnabled = false } }
}
