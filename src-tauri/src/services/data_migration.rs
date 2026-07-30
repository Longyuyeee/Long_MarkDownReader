use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MigrationAction {
    SourceMissing,
    CurrentOnly,
    Migrated,
    ConflictPreserved,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DataMigrationReport {
    pub identifier_from: String,
    pub identifier_to: String,
    pub config: MigrationAction,
    pub cache: MigrationAction,
}

impl DataMigrationReport {
    pub fn changed(&self) -> bool {
        self.config == MigrationAction::Migrated || self.cache == MigrationAction::Migrated
    }

    pub fn has_conflict(&self) -> bool {
        self.config == MigrationAction::ConflictPreserved
            || self.cache == MigrationAction::ConflictPreserved
    }
}

pub fn check_and_migrate_data(app: &tauri::AppHandle) -> Result<DataMigrationReport, String> {
    let old_product_name = "Long编辑";
    let new_product_name = "Long编辑";
    let old_identifier = "com.mistyedit.mdhelper";
    let new_identifier = app.config().identifier.clone();
    let resolver = app.path();
    let current_config = resolver
        .app_config_dir()
        .map_err(|error| format!("config dir error: {error}"))?;
    let current_cache = resolver
        .app_cache_dir()
        .map_err(|error| format!("cache dir error: {error}"))?;
    let mut report = DataMigrationReport {
        identifier_from: old_identifier.to_string(),
        identifier_to: new_identifier.clone(),
        config: MigrationAction::CurrentOnly,
        cache: MigrationAction::CurrentOnly,
    };

    if old_identifier != new_identifier {
        report.config = migrate_directory(&current_config, &new_identifier, old_identifier)?;
        report.cache = migrate_directory(&current_cache, &new_identifier, old_identifier)?;
    }

    if cfg!(target_os = "windows") && old_product_name != new_product_name {
        report.config = migrate_directory(&current_config, new_product_name, old_product_name)?;
        report.cache = migrate_directory(&current_cache, new_product_name, old_product_name)?;
    }

    Ok(report)
}

fn legacy_path(current: &Path, current_token: &str, old_token: &str) -> Result<PathBuf, String> {
    let current_text = current.to_string_lossy();
    if !current_text.contains(current_token) {
        return Err(format!(
            "current data path does not contain identifier token {current_token}"
        ));
    }
    Ok(PathBuf::from(
        current_text.replace(current_token, old_token),
    ))
}

fn migrate_directory(
    current: &Path,
    current_token: &str,
    old_token: &str,
) -> Result<MigrationAction, String> {
    let old = legacy_path(current, current_token, old_token)?;
    match (old.exists(), current.exists()) {
        (false, _) => Ok(MigrationAction::SourceMissing),
        (true, true) => Ok(MigrationAction::ConflictPreserved),
        (true, false) => {
            if let Some(parent) = current.parent() {
                fs::create_dir_all(parent)
                    .map_err(|error| format!("create migration parent failed: {error}"))?;
            }
            fs::rename(&old, current)
                .map_err(|error| format!("move legacy data failed: {error}"))?;
            Ok(MigrationAction::Migrated)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_root(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("longedit-migration-{label}-{nonce}"))
    }

    #[test]
    fn migration_moves_legacy_directory_without_overwriting() {
        let root = test_root("move");
        let old = root.join("com.mistyedit.mdhelper").join("config");
        let current = root.join("com.longyuye.mdreader").join("config");
        fs::create_dir_all(&old).expect("legacy dir");
        fs::write(old.join("config.json"), "{}").expect("legacy file");

        let action = migrate_directory(&current, "com.longyuye.mdreader", "com.mistyedit.mdhelper")
            .expect("migration");

        assert_eq!(action, MigrationAction::Migrated);
        assert!(current.join("config.json").exists());
        assert!(!old.exists());
        fs::remove_dir_all(root).expect("cleanup");
    }

    #[test]
    fn migration_preserves_both_directories_on_conflict() {
        let root = test_root("conflict");
        let old = root.join("com.mistyedit.mdhelper").join("cache");
        let current = root.join("com.longyuye.mdreader").join("cache");
        fs::create_dir_all(&old).expect("legacy dir");
        fs::create_dir_all(&current).expect("current dir");
        fs::write(old.join("old.db"), "old").expect("legacy file");
        fs::write(current.join("current.db"), "current").expect("current file");

        let action = migrate_directory(&current, "com.longyuye.mdreader", "com.mistyedit.mdhelper")
            .expect("migration");

        assert_eq!(action, MigrationAction::ConflictPreserved);
        assert!(old.join("old.db").exists());
        assert!(current.join("current.db").exists());
        fs::remove_dir_all(root).expect("cleanup");
    }
}
