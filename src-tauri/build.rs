fn main() {
    tauri_build::build();
    // Unit-test executables can retain the native dialog import too. Activate
    // Common Controls v6 for every MSVC executable, including the test harness.
    if std::env::var("CARGO_CFG_TARGET_ENV").as_deref() == Ok("msvc") {
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'");
        // Tauri already embeds the full application manifest into resource.lib
        // for binary targets. Do not generate a second resource with the same ID.
        println!("cargo:rustc-link-arg-bins=/MANIFEST:NO");
    }
}
