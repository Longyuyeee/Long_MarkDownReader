use crate::commands::config::{AppConfig, LibraryConfig, SavedSearchConfig};
use crate::services::reliable_write::write_new_bytes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const BACKUP_SCHEMA_VERSION: u32 = 1;
const BACKUP_STAGE: &str = "R3B";
const FILE_FORMATS: &str = include_str!("../../../shared/file-formats.json");
const RELEASE_CAPABILITY_MATRIX: &str =
    include_str!("../../../shared/release-capability-matrix.json");
const DATA_RESILIENCE_POLICY: &str = include_str!("../../../shared/data-resilience-policy.json");

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagementBackupReceipt {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
    pub created_at: u64,
    pub entry_count: usize,
    pub redacted_library_count: usize,
    pub excluded: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ManagementBackupManifest {
    schema_version: u32,
    stage: String,
    app_version: String,
    created_at: u64,
    entries: Vec<BackupEntryDigest>,
    excluded: Vec<String>,
    privacy_boundary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntryDigest {
    path: String,
    bytes: usize,
    sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedAppConfigBackup {
    libraries: Vec<RedactedLibraryConfig>,
    active_library_fingerprint: Option<String>,
    theme: String,
    code_theme: String,
    editor_mode: String,
    editor_bg_color: String,
    hero_icon: String,
    auto_save_interval: u32,
    text_auto_save_enabled: bool,
    max_history_count: u32,
    is_autostart: bool,
    exit_strategy: String,
    visual_style: String,
    motion_speed: String,
    ai_enabled: bool,
    ai_provider: String,
    ai_endpoint: String,
    ai_model: String,
    saved_searches: Vec<RedactedSavedSearchConfig>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedLibraryConfig {
    name: String,
    path_fingerprint: String,
    path_leaf: String,
    git_enabled: bool,
    git_remote_fingerprint: Option<String>,
    git_branch: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedSavedSearchConfig {
    id: String,
    name: String,
    query: String,
    library_fingerprint: String,
    object_types: Vec<String>,
    created_at: u64,
}

fn now_unix_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

fn sha256_hex(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn fingerprint(value: &str) -> String {
    sha256_hex(value.as_bytes())
}

fn path_leaf(path: &str) -> String {
    Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("library")
        .chars()
        .take(120)
        .collect()
}

fn redacted_library(library: &LibraryConfig) -> RedactedLibraryConfig {
    RedactedLibraryConfig {
        name: library.name.chars().take(120).collect(),
        path_fingerprint: fingerprint(&library.path),
        path_leaf: path_leaf(&library.path),
        git_enabled: library.git_enabled,
        git_remote_fingerprint: (!library.git_remote.trim().is_empty())
            .then(|| fingerprint(&library.git_remote)),
        git_branch: library.git_branch.chars().take(120).collect(),
    }
}

fn redacted_saved_search(search: &SavedSearchConfig) -> RedactedSavedSearchConfig {
    RedactedSavedSearchConfig {
        id: search.id.clone(),
        name: search.name.clone(),
        query: search.query.clone(),
        library_fingerprint: fingerprint(&search.library_path),
        object_types: search.object_types.clone(),
        created_at: search.created_at,
    }
}

fn redacted_config(config: &AppConfig) -> RedactedAppConfigBackup {
    RedactedAppConfigBackup {
        libraries: config.libraries.iter().map(redacted_library).collect(),
        active_library_fingerprint: (!config.active_library_path.trim().is_empty())
            .then(|| fingerprint(&config.active_library_path)),
        theme: config.theme.clone(),
        code_theme: config.code_theme.clone(),
        editor_mode: config.editor_mode.clone(),
        editor_bg_color: config.editor_bg_color.clone(),
        hero_icon: config.hero_icon.clone(),
        auto_save_interval: config.auto_save_interval,
        text_auto_save_enabled: config.text_auto_save_enabled,
        max_history_count: config.max_history_count,
        is_autostart: config.is_autostart,
        exit_strategy: config.exit_strategy.clone(),
        visual_style: config.visual_style.clone(),
        motion_speed: config.motion_speed.clone(),
        ai_enabled: config.ai_enabled,
        ai_provider: config.ai_provider.clone(),
        ai_endpoint: config.ai_endpoint.clone(),
        ai_model: config.ai_model.clone(),
        saved_searches: config
            .saved_searches
            .iter()
            .map(redacted_saved_search)
            .collect(),
    }
}

fn add_zip_entry(
    zip: &mut ZipWriter<Cursor<Vec<u8>>>,
    entries: &mut Vec<BackupEntryDigest>,
    path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    zip.start_file(
        path,
        SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
    )
    .map_err(|error| format!("写入备份条目失败: {error}"))?;
    zip.write_all(bytes)
        .map_err(|error| format!("写入备份内容失败: {error}"))?;
    entries.push(BackupEntryDigest {
        path: path.into(),
        bytes: bytes.len(),
        sha256: sha256_hex(bytes),
    });
    Ok(())
}

pub(crate) fn build_management_backup_archive(
    config: &AppConfig,
    created_at: u64,
) -> Result<(Vec<u8>, ManagementBackupReceipt), String> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let mut entries = Vec::new();
    let redacted_config = serde_json::to_vec_pretty(&redacted_config(config))
        .map_err(|error| format!("序列化脱敏配置失败: {error}"))?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "config.redacted.json",
        &redacted_config,
    )?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "contracts/file-formats.json",
        FILE_FORMATS.as_bytes(),
    )?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "contracts/release-capability-matrix.json",
        RELEASE_CAPABILITY_MATRIX.as_bytes(),
    )?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "contracts/data-resilience-policy.json",
        DATA_RESILIENCE_POLICY.as_bytes(),
    )?;

    let excluded = vec![
        "document-body".into(),
        "api-key".into(),
        "system-credential".into(),
        "absolute-user-path".into(),
        "recoverable-cache-body".into(),
        "external-library-content".into(),
    ];
    let manifest = ManagementBackupManifest {
        schema_version: BACKUP_SCHEMA_VERSION,
        stage: BACKUP_STAGE.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        created_at,
        entries: entries.clone(),
        excluded: excluded.clone(),
        privacy_boundary:
            "Backup contains only redacted settings and machine-readable capability contracts."
                .into(),
    };
    let manifest = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("序列化备份清单失败: {error}"))?;
    add_zip_entry(&mut zip, &mut entries, "manifest.json", &manifest)?;

    let bytes = zip
        .finish()
        .map_err(|error| format!("完成备份压缩包失败: {error}"))?
        .into_inner();
    let receipt = ManagementBackupReceipt {
        path: String::new(),
        bytes: bytes.len() as u64,
        sha256: sha256_hex(&bytes),
        created_at,
        entry_count: entries.len(),
        redacted_library_count: config.libraries.len(),
        excluded,
    };
    Ok((bytes, receipt))
}

fn read_config_from_disk(app: &tauri::AppHandle) -> Result<AppConfig, String> {
    let config_path = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("无法定位配置目录: {error}"))?
        .join("config.json");
    if !config_path.exists() {
        return Ok(AppConfig::default());
    }
    let content =
        fs::read_to_string(&config_path).map_err(|error| format!("读取配置失败: {error}"))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("配置文件已损坏，暂不能导出备份: {error}"))
}

#[tauri::command]
pub fn export_management_backup(
    app: tauri::AppHandle,
    target_path: String,
) -> Result<ManagementBackupReceipt, String> {
    let target = Path::new(&target_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("zip"))
    {
        return Err("管理备份必须保存为 .zip 文件".into());
    }
    if target.exists() {
        return Err("目标备份文件已存在；为避免误覆盖，请选择新的文件名".into());
    }
    let config = read_config_from_disk(&app)?;
    let created_at = now_unix_seconds();
    let (bytes, mut receipt) = build_management_backup_archive(&config, created_at)?;
    write_new_bytes(target, &bytes)?;
    receipt.path = target.to_string_lossy().into_owned();
    Ok(receipt)
}

#[cfg(test)]
pub(crate) fn inspect_backup_entries(
    bytes: &[u8],
) -> Result<std::collections::BTreeMap<String, Vec<u8>>, String> {
    let cursor = Cursor::new(bytes);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|error| format!("读取备份压缩包失败: {error}"))?;
    let mut entries = std::collections::BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取备份条目失败: {error}"))?;
        let name = file.name().to_string();
        let mut content = Vec::new();
        std::io::copy(&mut file, &mut content)
            .map_err(|error| format!("读取备份内容失败: {error}"))?;
        entries.insert(name, content);
    }
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn management_backup_excludes_paths_and_credentials() {
        let config = AppConfig {
            libraries: vec![LibraryConfig {
                name: "Personal Vault".into(),
                path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                git_enabled: true,
                git_remote: "https://token@example.com/private/repo.git".into(),
                git_branch: "main".into(),
            }],
            active_library_path: "C:\\Users\\Alice\\Documents\\Vault".into(),
            ai_api_key: "sk-should-never-export".into(),
            saved_searches: vec![SavedSearchConfig {
                id: "search-1".into(),
                name: "Todo".into(),
                query: "project".into(),
                library_path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                object_types: vec!["markdown".into()],
                created_at: 1,
            }],
            ..Default::default()
        };
        let (bytes, receipt) = build_management_backup_archive(&config, 100).unwrap();
        let entries = inspect_backup_entries(&bytes).unwrap();
        assert_eq!(receipt.entry_count, 5);
        assert!(entries.contains_key("manifest.json"));
        assert!(entries.contains_key("config.redacted.json"));
        let all_text = entries
            .values()
            .map(|value| String::from_utf8_lossy(value))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!all_text.contains("C:\\Users\\Alice"));
        assert!(!all_text.contains("sk-should-never-export"));
        assert!(!all_text.contains("token@example.com"));
        assert!(all_text.contains("pathFingerprint"));
        assert!(all_text.contains("gitRemoteFingerprint"));
        assert!(all_text.contains("document-body"));
    }
}
