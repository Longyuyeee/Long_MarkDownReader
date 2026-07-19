use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub fn check_and_migrate_data(app: &tauri::AppHandle) -> Result<(), String> {
    let old_product_name = "Long编辑";
    let new_product_name = "Long编辑";
    let old_identifier = "com.mistyedit.mdhelper";
    let new_identifier = app.config().identifier.clone();
    let resolver = app.path();

    if old_identifier != new_identifier {
        migrate_directory(
            resolver
                .app_config_dir()
                .map_err(|error| format!("config dir error: {error}"))?,
            &new_identifier,
            old_identifier,
        );
        migrate_directory(
            resolver
                .app_cache_dir()
                .map_err(|error| format!("cache dir error: {error}"))?,
            &new_identifier,
            old_identifier,
        );
    }

    if cfg!(target_os = "windows") && old_product_name != new_product_name {
        migrate_directory(
            resolver
                .app_config_dir()
                .map_err(|error| format!("config dir error: {error}"))?,
            new_product_name,
            old_product_name,
        );
        migrate_directory(
            resolver
                .app_cache_dir()
                .map_err(|error| format!("cache dir error: {error}"))?,
            new_product_name,
            old_product_name,
        );
    }
    Ok(())
}

fn migrate_directory(current: PathBuf, current_token: &str, old_token: &str) {
    let old = PathBuf::from(current.to_string_lossy().replace(current_token, old_token));
    if old.exists() && !current.exists() {
        if let Some(parent) = current.parent() {
            let _ = fs::create_dir_all(parent);
        }
        let _ = fs::rename(old, current);
    }
}
