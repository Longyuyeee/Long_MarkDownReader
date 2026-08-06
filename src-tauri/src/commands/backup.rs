use crate::commands::config::{AppConfig, LibraryConfig, SavedSearchConfig};
use crate::services::reliable_write::{write_new_bytes, write_utf8};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

const BACKUP_SCHEMA_VERSION: u32 = 1;
const BACKUP_STAGE: &str = "R3B";
const MAX_BACKUP_BYTES: u64 = 16 * 1024 * 1024;
const MAX_BACKUP_ENTRY_BYTES: usize = 4 * 1024 * 1024;
// R3C fixed-entry-allowlist: reject every ZIP member outside this exact set.
const EXPECTED_BACKUP_ENTRIES: [&str; 5] = [
    "manifest.json",
    "config.redacted.json",
    "contracts/file-formats.json",
    "contracts/release-capability-matrix.json",
    "contracts/data-resilience-policy.json",
];
const FILE_FORMATS: &str = include_str!("../../../shared/file-formats.json");
const RELEASE_CAPABILITY_MATRIX: &str =
    include_str!("../../../shared/release-capability-matrix.json");
const DATA_RESILIENCE_POLICY: &str = include_str!("../../../shared/data-resilience-policy.json");

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagementBackupImportPreflight {
    pub valid: bool,
    pub schema_version: u32,
    pub stage: String,
    pub created_at: u64,
    pub entry_count: usize,
    pub redacted_library_count: usize,
    pub saved_search_count: usize,
    pub requires_library_mapping: bool,
    pub required_library_mappings: Vec<RequiredLibraryMapping>,
    pub blocked_reasons: Vec<String>,
    pub warnings: Vec<String>,
    pub excluded: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RequiredLibraryMapping {
    pub path_fingerprint: String,
    pub path_leaf: String,
    pub name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LibraryPathMapping {
    pub path_fingerprint: String,
    pub path: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagementBackupRestoreReceipt {
    pub path: String,
    pub restored_at: u64,
    pub library_count: usize,
    pub saved_search_count: usize,
    pub warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupEntryDigest {
    path: String,
    bytes: usize,
    sha256: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedactedAppConfigBackup {
    libraries: Vec<RedactedLibraryConfig>,
    active_library_fingerprint: Option<String>,
    theme: String,
    code_theme: String,
    editor_mode: String,
    #[serde(default)]
    editor_mode_explicit: bool,
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

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedactedLibraryConfig {
    name: String,
    path_fingerprint: String,
    path_leaf: String,
    git_enabled: bool,
    git_remote_fingerprint: Option<String>,
    git_branch: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RedactedSavedSearchConfig {
    id: String,
    name: String,
    query: String,
    library_fingerprint: String,
    object_types: Vec<String>,
    #[serde(default)]
    graph_root: Option<String>,
    #[serde(default)]
    graph_depth: Option<usize>,
    created_at: u64,
}

#[derive(Clone, Debug)]
struct ParsedManagementBackup {
    manifest: ManagementBackupManifest,
    redacted_config: RedactedAppConfigBackup,
    entries: BTreeMap<String, Vec<u8>>,
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
        graph_root: search.graph_root.clone(),
        graph_depth: search.graph_depth,
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
        editor_mode_explicit: config.editor_mode_explicit,
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

fn expected_backup_entry_set() -> BTreeSet<&'static str> {
    EXPECTED_BACKUP_ENTRIES.into_iter().collect()
}

fn ensure_expected_backup_entry_name(name: &str) -> Result<(), String> {
    if name.starts_with('/') || name.starts_with('\\') || name.contains("..") || name.contains('\\')
    {
        return Err(format!("备份条目路径不安全：{name}"));
    }
    if !expected_backup_entry_set().contains(name) {
        return Err(format!("备份包含非预期条目：{name}"));
    }
    Ok(())
}

fn read_backup_entries(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    if bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err("管理备份超过大小上限，已拒绝导入".into());
    }
    let cursor = Cursor::new(bytes);
    let mut archive =
        ZipArchive::new(cursor).map_err(|error| format!("读取管理备份压缩包失败: {error}"))?;
    let mut entries = BTreeMap::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("读取管理备份条目失败: {error}"))?;
        let name = file.name().to_string();
        ensure_expected_backup_entry_name(&name)?;
        if entries.contains_key(&name) {
            return Err(format!("备份包含重复条目：{name}"));
        }
        let mut content = Vec::new();
        let bytes_read = file
            .by_ref()
            .take((MAX_BACKUP_ENTRY_BYTES + 1) as u64)
            .read_to_end(&mut content)
            .map_err(|error| format!("读取管理备份内容失败: {error}"))?;
        if bytes_read > MAX_BACKUP_ENTRY_BYTES {
            return Err(format!("备份条目过大：{name}"));
        }
        entries.insert(name, content);
    }
    let actual: BTreeSet<_> = entries.keys().map(|value| value.as_str()).collect();
    let expected = expected_backup_entry_set();
    if actual != expected {
        let missing = expected
            .difference(&actual)
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        let extra = actual
            .difference(&expected)
            .copied()
            .collect::<Vec<_>>()
            .join(", ");
        return Err(format!(
            "备份条目不完整或不匹配；缺失：{missing}；额外：{extra}"
        ));
    }
    Ok(entries)
}

fn parse_management_backup(bytes: &[u8]) -> Result<ParsedManagementBackup, String> {
    let entries = read_backup_entries(bytes)?;
    let manifest_bytes = entries
        .get("manifest.json")
        .ok_or_else(|| "备份缺少 manifest.json".to_string())?;
    let manifest: ManagementBackupManifest = serde_json::from_slice(manifest_bytes)
        .map_err(|error| format!("备份 manifest 解析失败: {error}"))?;
    if manifest.schema_version != BACKUP_SCHEMA_VERSION {
        return Err(format!(
            "暂不支持的备份 schemaVersion：{}",
            manifest.schema_version
        ));
    }
    if manifest.stage != BACKUP_STAGE {
        return Err(format!("暂不支持的备份阶段：{}", manifest.stage));
    }
    for digest in &manifest.entries {
        ensure_expected_backup_entry_name(&digest.path)?;
        if digest.path == "manifest.json" {
            return Err("manifest 不应自引用 manifest.json".into());
        }
        let Some(content) = entries.get(&digest.path) else {
            return Err(format!("manifest 引用了缺失条目：{}", digest.path));
        };
        if content.len() != digest.bytes || sha256_hex(content) != digest.sha256 {
            return Err(format!("备份条目校验失败：{}", digest.path));
        }
    }
    let expected_digest_paths: BTreeSet<_> = EXPECTED_BACKUP_ENTRIES
        .into_iter()
        .filter(|path| *path != "manifest.json")
        .collect();
    let actual_digest_paths: BTreeSet<_> = manifest
        .entries
        .iter()
        .map(|digest| digest.path.as_str())
        .collect();
    if actual_digest_paths != expected_digest_paths {
        return Err("manifest 条目清单和备份内容不一致".into());
    }
    let redacted_config: RedactedAppConfigBackup =
        serde_json::from_slice(entries.get("config.redacted.json").unwrap())
            .map_err(|error| format!("脱敏配置解析失败: {error}"))?;
    Ok(ParsedManagementBackup {
        manifest,
        redacted_config,
        entries,
    })
}

fn build_import_preflight(parsed: &ParsedManagementBackup) -> ManagementBackupImportPreflight {
    let mut blocked_reasons = Vec::new();
    let mut warnings = vec![
        "恢复不会导入文档正文、缓存正文、API Key、系统凭据或旧机器绝对路径。".into(),
        "所有知识库目录都需要在当前机器重新映射。".into(),
    ];
    let mut seen_fingerprints = BTreeSet::new();
    let mut required_library_mappings = Vec::new();
    for library in &parsed.redacted_config.libraries {
        if library.path_fingerprint.trim().is_empty()
            || !seen_fingerprints.insert(library.path_fingerprint.as_str())
        {
            blocked_reasons.push("备份中的知识库路径指纹为空或重复。".into());
            continue;
        }
        required_library_mappings.push(RequiredLibraryMapping {
            path_fingerprint: library.path_fingerprint.clone(),
            path_leaf: library.path_leaf.clone(),
            name: library.name.clone(),
        });
        if library.git_remote_fingerprint.is_some() {
            warnings.push(format!(
                "知识库「{}」的 Git Remote 只会以指纹校验存在，恢复后需手动重新填写 Remote URL。",
                library.name
            ));
        }
    }
    let library_fingerprints: BTreeSet<_> = parsed
        .redacted_config
        .libraries
        .iter()
        .map(|library| library.path_fingerprint.as_str())
        .collect();
    for search in &parsed.redacted_config.saved_searches {
        if !library_fingerprints.contains(search.library_fingerprint.as_str()) {
            blocked_reasons.push(format!("保存搜索「{}」指向不存在的知识库。", search.name));
        }
    }
    ManagementBackupImportPreflight {
        valid: blocked_reasons.is_empty(),
        schema_version: parsed.manifest.schema_version,
        stage: parsed.manifest.stage.clone(),
        created_at: parsed.manifest.created_at,
        entry_count: parsed.entries.len(),
        redacted_library_count: parsed.redacted_config.libraries.len(),
        saved_search_count: parsed.redacted_config.saved_searches.len(),
        requires_library_mapping: !parsed.redacted_config.libraries.is_empty(),
        required_library_mappings,
        blocked_reasons,
        warnings,
        excluded: parsed.manifest.excluded.clone(),
    }
}

fn restored_config_from_redacted(
    redacted: &RedactedAppConfigBackup,
    mappings: Vec<LibraryPathMapping>,
) -> Result<(AppConfig, Vec<String>), String> {
    let mut by_fingerprint = BTreeMap::new();
    let mut target_paths = BTreeSet::new();
    for mapping in mappings {
        let path = mapping.path.trim();
        if mapping.path_fingerprint.trim().is_empty() || path.is_empty() {
            return Err("知识库路径映射不能为空。".into());
        }
        if path.chars().count() > 4096 {
            return Err("知识库路径过长，已拒绝恢复。".into());
        }
        if !target_paths.insert(path.to_string()) {
            return Err("多个知识库不能映射到同一个目录。".into());
        }
        by_fingerprint.insert(mapping.path_fingerprint, path.to_string());
    }
    let mut libraries = Vec::new();
    let mut warnings = Vec::new();
    for library in &redacted.libraries {
        let path = by_fingerprint
            .get(&library.path_fingerprint)
            .ok_or_else(|| format!("缺少知识库「{}」的当前机器目录映射。", library.name))?
            .clone();
        if library.git_remote_fingerprint.is_some() {
            warnings.push(format!(
                "知识库「{}」的 Git Remote 未恢复，请在设置中重新填写。",
                library.name
            ));
        }
        libraries.push(LibraryConfig {
            name: library.name.clone(),
            path,
            git_enabled: library.git_enabled,
            git_remote: String::new(),
            git_branch: library.git_branch.clone(),
        });
    }
    let active_library_path = redacted
        .active_library_fingerprint
        .as_ref()
        .and_then(|fingerprint| by_fingerprint.get(fingerprint))
        .cloned()
        .or_else(|| libraries.first().map(|library| library.path.clone()))
        .unwrap_or_default();
    let mut saved_searches = Vec::new();
    for search in &redacted.saved_searches {
        let library_path = by_fingerprint
            .get(&search.library_fingerprint)
            .ok_or_else(|| format!("保存搜索「{}」缺少知识库目录映射。", search.name))?
            .clone();
        saved_searches.push(SavedSearchConfig {
            id: search.id.clone(),
            name: search.name.clone(),
            query: search.query.clone(),
            library_path,
            object_types: search.object_types.clone(),
            graph_root: search.graph_root.clone(),
            graph_depth: search.graph_depth,
            created_at: search.created_at,
        });
    }
    let config = AppConfig {
        libraries,
        active_library_path,
        theme: redacted.theme.clone(),
        code_theme: redacted.code_theme.clone(),
        editor_mode: redacted.editor_mode.clone(),
        editor_mode_explicit: redacted.editor_mode_explicit,
        editor_bg_color: redacted.editor_bg_color.clone(),
        hero_icon: redacted.hero_icon.clone(),
        auto_save_interval: redacted.auto_save_interval,
        text_auto_save_enabled: redacted.text_auto_save_enabled,
        max_history_count: redacted.max_history_count,
        is_autostart: redacted.is_autostart,
        exit_strategy: redacted.exit_strategy.clone(),
        visual_style: redacted.visual_style.clone(),
        motion_speed: redacted.motion_speed.clone(),
        ai_enabled: redacted.ai_enabled,
        ai_provider: redacted.ai_provider.clone(),
        ai_endpoint: redacted.ai_endpoint.clone(),
        ai_api_key: String::new(),
        ai_model: redacted.ai_model.clone(),
        saved_searches,
        // Display markers use device-local absolute paths and are intentionally not restored.
        file_display_styles: std::collections::HashMap::new(),
    };
    Ok((config, warnings))
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
        return Err("目标备份文件已存在；为避免误覆盖，请选择新的文件名。".into());
    }
    let config = read_config_from_disk(&app)?;
    let created_at = now_unix_seconds();
    let (bytes, mut receipt) = build_management_backup_archive(&config, created_at)?;
    write_new_bytes(target, &bytes)?;
    receipt.path = target.to_string_lossy().into_owned();
    Ok(receipt)
}

#[tauri::command]
pub fn preflight_management_backup_import(
    backup_path: String,
) -> Result<ManagementBackupImportPreflight, String> {
    let target = Path::new(&backup_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("zip"))
    {
        return Err("管理备份必须是 .zip 文件".into());
    }
    let metadata = fs::metadata(target).map_err(|error| format!("读取管理备份失败: {error}"))?;
    if metadata.len() > MAX_BACKUP_BYTES {
        return Err("管理备份超过大小上限，已拒绝导入".into());
    }
    let bytes = fs::read(target).map_err(|error| format!("读取管理备份失败: {error}"))?;
    let parsed = parse_management_backup(&bytes)?;
    Ok(build_import_preflight(&parsed))
}

#[tauri::command]
pub fn restore_management_backup(
    app: tauri::AppHandle,
    backup_path: String,
    library_mappings: Vec<LibraryPathMapping>,
) -> Result<ManagementBackupRestoreReceipt, String> {
    let target = Path::new(&backup_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("zip"))
    {
        return Err("管理备份必须是 .zip 文件".into());
    }
    let bytes = fs::read(target).map_err(|error| format!("读取管理备份失败: {error}"))?;
    let parsed = parse_management_backup(&bytes)?;
    let preflight = build_import_preflight(&parsed);
    if !preflight.valid {
        return Err(format!(
            "管理备份预检未通过：{}",
            preflight.blocked_reasons.join("；")
        ));
    }
    let (mut config, mut warnings) =
        restored_config_from_redacted(&parsed.redacted_config, library_mappings)?;
    config.ai_api_key.clear();
    let config_dir = app
        .path()
        .app_config_dir()
        .map_err(|error| format!("定位配置目录失败: {error}"))?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|error| format!("创建配置目录失败: {error}"))?;
    }
    let content = serde_json::to_string_pretty(&config)
        .map_err(|error| format!("序列化恢复配置失败: {error}"))?;
    write_utf8(config_dir.join("config.json"), &content)?;
    warnings.extend(preflight.warnings);
    Ok(ManagementBackupRestoreReceipt {
        path: target.to_string_lossy().into_owned(),
        restored_at: now_unix_seconds(),
        library_count: config.libraries.len(),
        saved_search_count: config.saved_searches.len(),
        warnings,
    })
}

#[cfg(test)]
pub(crate) fn inspect_backup_entries(bytes: &[u8]) -> Result<BTreeMap<String, Vec<u8>>, String> {
    read_backup_entries(bytes)
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
                query: "__longedit_graph_collection__".into(),
                library_path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                object_types: vec![],
                graph_root: Some("Projects\\Alpha.md".into()),
                graph_depth: Some(2),
                created_at: 1,
            }],
            file_display_styles: std::collections::HashMap::from([(
                "C:\\Users\\Alice\\Documents\\Vault\\SecretMarker.md".into(),
                crate::commands::config::FileDisplayStyle {
                    background_color: "#fff1a8".into(),
                    text_color: "#253041".into(),
                    icon: "flag".into(),
                },
            )]),
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
        assert!(!all_text.contains("SecretMarker.md"));
        assert!(all_text.contains("pathFingerprint"));
        assert!(all_text.contains("gitRemoteFingerprint"));
        assert!(all_text.contains("Projects\\\\Alpha.md"));
        assert!(all_text.contains("document-body"));
    }

    #[test]
    fn management_backup_preflight_requires_library_mapping() {
        let config = AppConfig {
            libraries: vec![LibraryConfig {
                name: "Vault".into(),
                path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                ..Default::default()
            }],
            active_library_path: "C:\\Users\\Alice\\Documents\\Vault".into(),
            ..Default::default()
        };
        let (bytes, _) = build_management_backup_archive(&config, 100).unwrap();
        let parsed = parse_management_backup(&bytes).unwrap();
        let preflight = build_import_preflight(&parsed);
        assert!(preflight.valid);
        assert!(preflight.requires_library_mapping);
        assert_eq!(preflight.required_library_mappings.len(), 1);
        assert_eq!(preflight.required_library_mappings[0].path_leaf, "Vault");
        assert!(preflight
            .warnings
            .iter()
            .any(|warning| warning.contains("旧机器绝对路径")));
    }

    #[test]
    fn management_backup_restore_rejects_missing_mapping() {
        let config = AppConfig {
            libraries: vec![LibraryConfig {
                name: "Vault".into(),
                path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                ..Default::default()
            }],
            saved_searches: vec![SavedSearchConfig {
                id: "search-1".into(),
                name: "Todo".into(),
                query: "__longedit_graph_collection__".into(),
                library_path: "C:\\Users\\Alice\\Documents\\Vault".into(),
                object_types: vec![],
                graph_root: Some("Projects\\Alpha.md".into()),
                graph_depth: Some(2),
                created_at: 1,
            }],
            ..Default::default()
        };
        let redacted = redacted_config(&config);
        assert!(restored_config_from_redacted(&redacted, vec![]).is_err());
        let restored = restored_config_from_redacted(
            &redacted,
            vec![LibraryPathMapping {
                path_fingerprint: fingerprint("C:\\Users\\Alice\\Documents\\Vault"),
                path: "D:\\Knowledge\\Vault".into(),
            }],
        )
        .unwrap()
        .0;
        assert_eq!(restored.libraries[0].path, "D:\\Knowledge\\Vault");
        assert_eq!(
            restored.saved_searches[0].library_path,
            "D:\\Knowledge\\Vault"
        );
        assert_eq!(
            restored.saved_searches[0].graph_root.as_deref(),
            Some("Projects\\Alpha.md")
        );
        assert_eq!(restored.saved_searches[0].graph_depth, Some(2));
        let serialized = serde_json::to_string(&restored).unwrap();
        assert!(!serialized.contains("C:\\Users\\Alice"));
    }

    #[test]
    fn management_backup_import_rejects_unexpected_zip_member() {
        let config = AppConfig::default();
        let (bytes, _) = build_management_backup_archive(&config, 100).unwrap();
        let mut original_entries = inspect_backup_entries(&bytes).unwrap();
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        for (path, content) in std::mem::take(&mut original_entries) {
            zip.start_file(path, SimpleFileOptions::default()).unwrap();
            zip.write_all(&content).unwrap();
        }
        zip.start_file("../secret.txt", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"nope").unwrap();
        let tampered = zip.finish().unwrap().into_inner();
        assert!(parse_management_backup(&tampered).is_err());
    }
}
