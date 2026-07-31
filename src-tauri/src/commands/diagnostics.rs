use crate::commands::config::AppConfig;
use crate::services::knowledge_index::{inspect_index, KnowledgeIndexRuntime};
use crate::services::reliable_write::write_new_bytes;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::io::{Cursor, Write};
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const DIAGNOSTIC_SCHEMA_VERSION: u32 = 1;
const DIAGNOSTIC_STAGE: &str = "R3D";
const FILE_FORMATS: &str = include_str!("../../../shared/file-formats.json");
const RELEASE_CAPABILITY_MATRIX: &str =
    include_str!("../../../shared/release-capability-matrix.json");
const DATA_RESILIENCE_POLICY: &str = include_str!("../../../shared/data-resilience-policy.json");

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivacyDiagnosticBundleReceipt {
    pub path: String,
    pub bytes: u64,
    pub sha256: String,
    pub created_at: u64,
    pub entry_count: usize,
    pub library_count: usize,
    pub excluded: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PrivacyDiagnosticManifest {
    schema_version: u32,
    stage: String,
    app_version: String,
    created_at: u64,
    entries: Vec<DiagnosticEntryDigest>,
    excluded: Vec<String>,
    privacy_boundary: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DiagnosticEntryDigest {
    path: String,
    bytes: usize,
    sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedEnvironmentDiagnostic {
    schema_version: u32,
    stage: String,
    app_version: String,
    os: String,
    arch: String,
    family: String,
    debug_build: bool,
    format_contract_sha256: String,
    release_capability_matrix_sha256: String,
    data_resilience_policy_sha256: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedConfigDiagnostic {
    library_count: usize,
    active_library_fingerprint: Option<String>,
    theme: String,
    code_theme: String,
    editor_mode: String,
    visual_style: String,
    motion_speed: String,
    ai_enabled: bool,
    ai_provider: String,
    ai_model: String,
    ai_endpoint_fingerprint: Option<String>,
    ai_endpoint_configured: bool,
    saved_search_count: usize,
    libraries: Vec<RedactedDiagnosticLibrary>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RedactedDiagnosticLibrary {
    path_fingerprint: String,
    path_leaf: String,
    git_enabled: bool,
    git_remote_configured: bool,
    git_remote_fingerprint: Option<String>,
    git_branch: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct KnowledgeIndexDiagnosticSummary {
    library_count: usize,
    cache_root_available: bool,
    libraries: Vec<LibraryIndexDiagnostic>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LibraryIndexDiagnostic {
    path_fingerprint: String,
    path_leaf: String,
    state: String,
    schema_version: u32,
    built_at: Option<u64>,
    source_count: usize,
    object_count: usize,
    relation_count: usize,
    cache_bytes: u64,
    recovery_available: bool,
    stale_source_count: Option<usize>,
    error_category: Option<String>,
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

fn error_category(error: Option<&str>) -> Option<String> {
    let value = error?;
    let lower = value.to_ascii_lowercase();
    Some(if lower.contains("json") || lower.contains("schema") || lower.contains("版本") {
        "index-parse-or-schema".into()
    } else if lower.contains("size") || lower.contains("大小") || lower.contains("上限") {
        "index-size-limit".into()
    } else if lower.contains("permission")
        || lower.contains("access")
        || lower.contains("拒绝访问")
        || lower.contains("权限")
    {
        "filesystem-permission".into()
    } else {
        "other-redacted-error".into()
    })
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
    let content = std::fs::read_to_string(&config_path)
        .map_err(|error| format!("读取配置失败: {error}"))?;
    serde_json::from_str(&content).map_err(|error| format!("配置文件解析失败: {error}"))
}

fn redacted_config_diagnostic(config: &AppConfig) -> RedactedConfigDiagnostic {
    RedactedConfigDiagnostic {
        library_count: config.libraries.len(),
        active_library_fingerprint: (!config.active_library_path.trim().is_empty())
            .then(|| fingerprint(&config.active_library_path)),
        theme: config.theme.clone(),
        code_theme: config.code_theme.clone(),
        editor_mode: config.editor_mode.clone(),
        visual_style: config.visual_style.clone(),
        motion_speed: config.motion_speed.clone(),
        ai_enabled: config.ai_enabled,
        ai_provider: config.ai_provider.clone(),
        ai_model: config.ai_model.clone(),
        ai_endpoint_fingerprint: (!config.ai_endpoint.trim().is_empty())
            .then(|| fingerprint(&config.ai_endpoint)),
        ai_endpoint_configured: !config.ai_endpoint.trim().is_empty(),
        saved_search_count: config.saved_searches.len(),
        libraries: config
            .libraries
            .iter()
            .map(|library| RedactedDiagnosticLibrary {
                path_fingerprint: fingerprint(&library.path),
                path_leaf: path_leaf(&library.path),
                git_enabled: library.git_enabled,
                git_remote_configured: !library.git_remote.trim().is_empty(),
                git_remote_fingerprint: (!library.git_remote.trim().is_empty())
                    .then(|| fingerprint(&library.git_remote)),
                git_branch: library.git_branch.clone(),
            })
            .collect(),
    }
}

fn build_index_diagnostic_summary(
    app: &tauri::AppHandle,
    runtime: &KnowledgeIndexRuntime,
    config: &AppConfig,
) -> KnowledgeIndexDiagnosticSummary {
    let Ok(cache_root) = app.path().app_cache_dir() else {
        return KnowledgeIndexDiagnosticSummary {
            library_count: config.libraries.len(),
            cache_root_available: false,
            libraries: Vec::new(),
        };
    };
    let mut libraries = Vec::new();
    for library in &config.libraries {
        let workspace = Path::new(&library.path);
        let status = inspect_index(&cache_root, workspace, runtime);
        libraries.push(LibraryIndexDiagnostic {
            path_fingerprint: fingerprint(&library.path),
            path_leaf: path_leaf(&library.path),
            state: status.state,
            schema_version: status.schema_version,
            built_at: status.built_at,
            source_count: status.source_count,
            object_count: status.object_count,
            relation_count: status.relation_count,
            cache_bytes: status.cache_bytes,
            recovery_available: status.recovery_available,
            stale_source_count: status.stale_source_count,
            error_category: error_category(status.error.as_deref()),
        });
    }
    KnowledgeIndexDiagnosticSummary {
        library_count: config.libraries.len(),
        cache_root_available: true,
        libraries,
    }
}

fn add_zip_entry(
    zip: &mut ZipWriter<Cursor<Vec<u8>>>,
    entries: &mut Vec<DiagnosticEntryDigest>,
    path: &str,
    bytes: &[u8],
) -> Result<(), String> {
    zip.start_file(
        path,
        SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
    )
    .map_err(|error| format!("写入诊断包条目失败: {error}"))?;
    zip.write_all(bytes)
        .map_err(|error| format!("写入诊断包内容失败: {error}"))?;
    entries.push(DiagnosticEntryDigest {
        path: path.into(),
        bytes: bytes.len(),
        sha256: sha256_hex(bytes),
    });
    Ok(())
}

fn build_privacy_diagnostic_archive(
    config: &AppConfig,
    index_summary: KnowledgeIndexDiagnosticSummary,
    created_at: u64,
) -> Result<(Vec<u8>, PrivacyDiagnosticBundleReceipt), String> {
    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let mut entries = Vec::new();
    let environment = RedactedEnvironmentDiagnostic {
        schema_version: DIAGNOSTIC_SCHEMA_VERSION,
        stage: DIAGNOSTIC_STAGE.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        os: std::env::consts::OS.into(),
        arch: std::env::consts::ARCH.into(),
        family: std::env::consts::FAMILY.into(),
        debug_build: cfg!(debug_assertions),
        format_contract_sha256: sha256_hex(FILE_FORMATS.as_bytes()),
        release_capability_matrix_sha256: sha256_hex(RELEASE_CAPABILITY_MATRIX.as_bytes()),
        data_resilience_policy_sha256: sha256_hex(DATA_RESILIENCE_POLICY.as_bytes()),
    };
    let environment = serde_json::to_vec_pretty(&environment)
        .map_err(|error| format!("序列化环境诊断失败: {error}"))?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "diagnostics/environment.redacted.json",
        &environment,
    )?;
    let config_summary = serde_json::to_vec_pretty(&redacted_config_diagnostic(config))
        .map_err(|error| format!("序列化配置诊断失败: {error}"))?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "diagnostics/config-summary.redacted.json",
        &config_summary,
    )?;
    let index_summary = serde_json::to_vec_pretty(&index_summary)
        .map_err(|error| format!("序列化索引诊断失败: {error}"))?;
    add_zip_entry(
        &mut zip,
        &mut entries,
        "diagnostics/index-state-summary.json",
        &index_summary,
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
        "raw-error-message".into(),
        "environment-variable".into(),
    ];
    let manifest = PrivacyDiagnosticManifest {
        schema_version: DIAGNOSTIC_SCHEMA_VERSION,
        stage: DIAGNOSTIC_STAGE.into(),
        app_version: env!("CARGO_PKG_VERSION").into(),
        created_at,
        entries: entries.clone(),
        excluded: excluded.clone(),
        privacy_boundary:
            "Diagnostic bundle contains only redacted environment, configuration, index summaries, and machine-readable capability contracts."
                .into(),
    };
    let manifest = serde_json::to_vec_pretty(&manifest)
        .map_err(|error| format!("序列化诊断包清单失败: {error}"))?;
    add_zip_entry(&mut zip, &mut entries, "manifest.json", &manifest)?;
    let bytes = zip
        .finish()
        .map_err(|error| format!("完成诊断包压缩失败: {error}"))?
        .into_inner();
    let receipt = PrivacyDiagnosticBundleReceipt {
        path: String::new(),
        bytes: bytes.len() as u64,
        sha256: sha256_hex(&bytes),
        created_at,
        entry_count: entries.len(),
        library_count: config.libraries.len(),
        excluded,
    };
    Ok((bytes, receipt))
}

#[tauri::command]
pub fn export_privacy_diagnostic_bundle(
    app: tauri::AppHandle,
    runtime: tauri::State<'_, KnowledgeIndexRuntime>,
    target_path: String,
) -> Result<PrivacyDiagnosticBundleReceipt, String> {
    let target = Path::new(&target_path);
    if target
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("zip"))
    {
        return Err("隐私诊断包必须保存为 .zip 文件".into());
    }
    if target.exists() {
        return Err("目标诊断包文件已存在；为避免误覆盖，请选择新的文件名。".into());
    }
    let config = read_config_from_disk(&app)?;
    let index_summary = build_index_diagnostic_summary(&app, &runtime, &config);
    let created_at = now_unix_seconds();
    let (bytes, mut receipt) =
        build_privacy_diagnostic_archive(&config, index_summary, created_at)?;
    write_new_bytes(target, &bytes)?;
    receipt.path = target.to_string_lossy().into_owned();
    Ok(receipt)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeMap;
    use std::io::Read;

    fn inspect_entries(bytes: &[u8]) -> BTreeMap<String, Vec<u8>> {
        let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).unwrap();
        let mut entries = BTreeMap::new();
        for index in 0..archive.len() {
            let mut file = archive.by_index(index).unwrap();
            let mut content = Vec::new();
            file.read_to_end(&mut content).unwrap();
            entries.insert(file.name().to_string(), content);
        }
        entries
    }

    #[test]
    fn privacy_diagnostic_bundle_excludes_sensitive_values() {
        let config = AppConfig {
            libraries: vec![crate::commands::config::LibraryConfig {
                name: "Private".into(),
                path: "C:\\Users\\Alice\\Documents\\SecretVault".into(),
                git_enabled: true,
                git_remote: "https://token@example.com/private/repo.git".into(),
                git_branch: "main".into(),
            }],
            active_library_path: "C:\\Users\\Alice\\Documents\\SecretVault".into(),
            ai_enabled: true,
            ai_api_key: "sk-should-never-export".into(),
            ai_endpoint: "https://private.gateway.example/v1".into(),
            saved_searches: vec![crate::commands::config::SavedSearchConfig {
                id: "search-1".into(),
                name: "secret search".into(),
                query: "confidential project body".into(),
                library_path: "C:\\Users\\Alice\\Documents\\SecretVault".into(),
                object_types: vec!["markdown".into()],
                graph_root: None,
                graph_depth: None,
                created_at: 1,
            }],
            ..Default::default()
        };
        let index_summary = KnowledgeIndexDiagnosticSummary {
            library_count: 1,
            cache_root_available: true,
            libraries: vec![LibraryIndexDiagnostic {
                path_fingerprint: fingerprint("C:\\Users\\Alice\\Documents\\SecretVault"),
                path_leaf: "SecretVault".into(),
                state: "corrupt".into(),
                schema_version: 1,
                built_at: None,
                source_count: 3,
                object_count: 2,
                relation_count: 1,
                cache_bytes: 42,
                recovery_available: true,
                stale_source_count: None,
                error_category: Some("index-parse-or-schema".into()),
            }],
        };
        let (bytes, receipt) = build_privacy_diagnostic_archive(&config, index_summary, 100).unwrap();
        assert_eq!(receipt.entry_count, 7);
        let entries = inspect_entries(&bytes);
        assert!(entries.contains_key("manifest.json"));
        assert!(entries.contains_key("diagnostics/environment.redacted.json"));
        assert!(entries.contains_key("diagnostics/config-summary.redacted.json"));
        assert!(entries.contains_key("diagnostics/index-state-summary.json"));
        let all_text = entries
            .values()
            .map(|value| String::from_utf8_lossy(value))
            .collect::<Vec<_>>()
            .join("\n");
        assert!(!all_text.contains("C:\\Users\\Alice"));
        assert!(!all_text.contains("sk-should-never-export"));
        assert!(!all_text.contains("token@example.com"));
        assert!(!all_text.contains("private.gateway.example"));
        assert!(!all_text.contains("confidential project body"));
        assert!(all_text.contains("pathFingerprint"));
        assert!(all_text.contains("aiEndpointFingerprint"));
        assert!(all_text.contains("raw-error-message"));
    }
}
