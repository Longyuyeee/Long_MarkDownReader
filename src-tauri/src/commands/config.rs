use crate::services::credentials::{delete_ai_secret, read_ai_secret, store_ai_secret};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;

const MAX_SAVED_SEARCHES: usize = 64;
const MAX_SAVED_SEARCH_NAME_CHARS: usize = 80;
const MAX_SAVED_SEARCH_QUERY_CHARS: usize = 500;
const MAX_SAVED_SEARCH_FORMATS: usize = 8;
const GRAPH_COLLECTION_QUERY: &str = "__longedit_graph_collection__";

fn default_git_branch() -> String {
    "main".into()
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct LibraryConfig {
    pub name: String,
    pub path: String,
    #[serde(default)]
    pub git_enabled: bool,
    #[serde(default)]
    pub git_remote: String,
    #[serde(default = "default_git_branch")]
    pub git_branch: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct SavedSearchConfig {
    pub id: String,
    pub name: String,
    pub query: String,
    pub library_path: String,
    #[serde(default)]
    pub object_types: Vec<String>,
    #[serde(default)]
    pub graph_root: Option<String>,
    #[serde(default)]
    pub graph_depth: Option<usize>,
    pub created_at: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub libraries: Vec<LibraryConfig>,
    pub active_library_path: String,
    pub theme: String,
    pub code_theme: String,
    pub editor_mode: String,
    pub editor_bg_color: String,
    pub hero_icon: String,
    pub auto_save_interval: u32,
    pub text_auto_save_enabled: bool,
    pub max_history_count: u32,
    pub is_autostart: bool,
    #[serde(default = "default_exit_strategy")]
    pub exit_strategy: String,
    #[serde(default = "default_visual_style")]
    pub visual_style: String,
    #[serde(default = "default_motion_speed")]
    pub motion_speed: String,
    pub ai_enabled: bool,
    #[serde(default = "default_ai_provider")]
    pub ai_provider: String,
    #[serde(default = "default_ai_endpoint")]
    pub ai_endpoint: String,
    #[serde(default, skip_serializing)]
    pub ai_api_key: String,
    #[serde(default = "default_ai_model")]
    pub ai_model: String,
    pub saved_searches: Vec<SavedSearchConfig>,
}

fn default_visual_style() -> String {
    "soft".into()
}

fn default_motion_speed() -> String {
    "calm".into()
}

fn default_ai_provider() -> String {
    "openai".into()
}

fn default_ai_endpoint() -> String {
    "https://api.openai.com/v1".into()
}

fn default_ai_model() -> String {
    "gpt-4o-mini".into()
}

fn default_exit_strategy() -> String {
    "ask".into()
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            libraries: vec![],
            active_library_path: String::new(),
            theme: "system".into(),
            code_theme: "github".into(),
            editor_mode: "wysiwyg".into(),
            editor_bg_color: String::new(),
            hero_icon: "BookOpen".into(),
            auto_save_interval: 3,
            text_auto_save_enabled: true,
            max_history_count: 10,
            is_autostart: false,
            exit_strategy: default_exit_strategy(),
            visual_style: default_visual_style(),
            motion_speed: default_motion_speed(),
            ai_enabled: false,
            ai_provider: default_ai_provider(),
            ai_endpoint: default_ai_endpoint(),
            ai_api_key: String::new(),
            ai_model: default_ai_model(),
            saved_searches: vec![],
        }
    }
}

fn validate_saved_searches(
    searches: &[SavedSearchConfig],
    libraries: &[LibraryConfig],
) -> Result<(), String> {
    if searches.len() > MAX_SAVED_SEARCHES {
        return Err(format!("保存的搜索不能超过 {MAX_SAVED_SEARCHES} 个"));
    }
    let library_paths: std::collections::HashSet<_> = libraries
        .iter()
        .map(|library| library.path.as_str())
        .collect();
    let mut ids = std::collections::HashSet::new();
    for search in searches {
        if search.id.trim().is_empty()
            || search.id.chars().count() > 80
            || !ids.insert(search.id.as_str())
        {
            return Err("保存的搜索 ID 为空、重复或过长".into());
        }
        if search.name.trim().is_empty()
            || search.name.chars().count() > MAX_SAVED_SEARCH_NAME_CHARS
        {
            return Err("保存的搜索名称为空或过长".into());
        }
        let graph_collection = search.graph_root.is_some() || search.graph_depth.is_some();
        if search.query.trim().is_empty()
            || search.query.chars().count() > MAX_SAVED_SEARCH_QUERY_CHARS
        {
            return Err("保存的搜索查询为空或过长".into());
        }
        if graph_collection {
            if search.query != GRAPH_COLLECTION_QUERY || !search.object_types.is_empty() {
                return Err("图谱集合查询标记或格式过滤器无效".into());
            }
            let graph_root = search.graph_root.as_deref().ok_or("图谱集合缺少中心对象")?;
            let graph_path = Path::new(graph_root);
            if graph_root.trim().is_empty()
                || graph_root.chars().count() > 4096
                || graph_path.is_absolute()
                || graph_path.components().any(|component| {
                    matches!(
                        component,
                        Component::ParentDir | Component::RootDir | Component::Prefix(_)
                    )
                })
                || !graph_path
                    .extension()
                    .and_then(|value| value.to_str())
                    .is_some_and(|extension| {
                        extension.eq_ignore_ascii_case("md")
                            || extension.eq_ignore_ascii_case("pdf")
                    })
            {
                return Err("图谱集合中心对象必须是知识库内的 Markdown/PDF 相对路径".into());
            }
            if !matches!(search.graph_depth, Some(1..=4)) {
                return Err("图谱集合深度必须在 1 到 4 之间".into());
            }
        }
        if search.library_path.trim().is_empty() || search.library_path.chars().count() > 4096 {
            return Err("保存的搜索知识库路径为空或过长".into());
        }
        if !library_paths.contains(search.library_path.as_str()) {
            return Err("保存的搜索必须属于已登记知识库".into());
        }
        if search.object_types.len() > MAX_SAVED_SEARCH_FORMATS {
            return Err("保存的搜索格式过滤器过多".into());
        }
        let mut object_types = std::collections::HashSet::new();
        for object_type in &search.object_types {
            let format = crate::formats::file_registry::file_format_by_id(object_type)?;
            if !format.capabilities.index.is_supported()
                || !object_types.insert(object_type.as_str())
            {
                return Err(format!("保存的搜索格式过滤器无效: {object_type}"));
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn get_config(app_handle: tauri::AppHandle) -> AppConfig {
    #[cfg(debug_assertions)]
    if let Some(config) = debug_e2e_config() {
        return config;
    }

    let config_dir = match app_handle.path().app_config_dir() {
        Ok(directory) => directory,
        Err(_) => return get_default_config(&app_handle),
    };
    let config_path = config_dir.join("config.json");
    let _ = recover_interrupted_write(&config_path);
    let mut config = if config_path.exists() {
        let content = fs::read_to_string(&config_path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_else(|error| {
            eprintln!("Config parse error: {error}, using default");
            get_default_config(&app_handle)
        })
    } else {
        get_default_config(&app_handle)
    };
    if !config.ai_api_key.is_empty() {
        match store_ai_secret(&config.ai_api_key) {
            Ok(()) => {
                config.ai_api_key.clear();
                if let Ok(content) = serde_json::to_string_pretty(&config) {
                    if let Err(error) = write_utf8(&config_path, &content) {
                        eprintln!("Failed to remove migrated API credential from config: {error}");
                    }
                }
            }
            Err(error) => {
                // Leave the legacy value on disk so migration can be retried next launch.
                eprintln!("Legacy API credential migration failed: {error}");
                config.ai_api_key.clear();
            }
        }
    }
    config
}

#[cfg(debug_assertions)]
fn debug_e2e_config() -> Option<AppConfig> {
    let library_path = std::env::var("LONGEDIT_E2E_LIBRARY").ok()?;
    if library_path.trim().is_empty() {
        return None;
    }

    let theme = std::env::var("LONGEDIT_E2E_THEME").unwrap_or_else(|_| "white".into());
    let visual_style = std::env::var("LONGEDIT_E2E_STYLE").unwrap_or_else(|_| {
        match theme.as_str() {
            "dark" => "soft",
            "contrast" => "sharp",
            _ => "minimal",
        }
        .into()
    });
    let code_theme = std::env::var("LONGEDIT_E2E_CODE_THEME").unwrap_or_else(|_| "github".into());
    let motion_speed = std::env::var("LONGEDIT_E2E_MOTION").unwrap_or_else(|_| "calm".into());
    Some(AppConfig {
        libraries: vec![LibraryConfig {
            name: "Chart visual matrix".into(),
            path: library_path.clone(),
            ..Default::default()
        }],
        active_library_path: library_path,
        theme,
        visual_style,
        code_theme,
        motion_speed,
        ..Default::default()
    })
}

fn get_default_config(app_handle: &tauri::AppHandle) -> AppConfig {
    let mut path = app_handle
        .path()
        .document_dir()
        .unwrap_or_else(|_| PathBuf::from("C:\\"));
    path.push("Long编辑知识库");
    let default_path = path.to_string_lossy().into_owned();
    AppConfig {
        libraries: vec![LibraryConfig {
            name: "默认知识库".into(),
            path: default_path.clone(),
            ..Default::default()
        }],
        active_library_path: default_path,
        ..Default::default()
    }
}

#[tauri::command]
pub fn save_config(app_handle: tauri::AppHandle, mut config: AppConfig) -> Result<(), String> {
    #[cfg(debug_assertions)]
    if std::env::var_os("LONGEDIT_E2E_LIBRARY").is_some() {
        return Ok(());
    }

    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|error| format!("config dir error: {error}"))?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    }
    validate_saved_searches(&config.saved_searches, &config.libraries)?;
    config.ai_api_key.clear();
    let content = serde_json::to_string_pretty(&config).map_err(|error| error.to_string())?;
    write_utf8(config_dir.join("config.json"), &content)
}

#[tauri::command]
pub async fn get_ai_credential_status() -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(|| read_ai_secret().map(|secret| secret.is_some()))
        .await
        .map_err(|error| format!("系统凭据任务失败: {error}"))?
}

#[tauri::command]
pub async fn set_ai_credential(api_key: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || store_ai_secret(&api_key))
        .await
        .map_err(|error| format!("系统凭据任务失败: {error}"))?
}

#[tauri::command]
pub async fn clear_ai_credential() -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(delete_ai_secret)
        .await
        .map_err(|error| format!("系统凭据任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn app_config_never_serializes_legacy_api_key() {
        let config = AppConfig {
            ai_api_key: "must-not-leave-process".into(),
            ..Default::default()
        };
        let serialized = serde_json::to_string(&config).unwrap();
        assert!(!serialized.contains("must-not-leave-process"));
        assert!(!serialized.contains("aiApiKey"));
        let legacy: AppConfig = serde_json::from_str(
            r#"{"aiApiKey":"legacy-value","libraries":[],"activeLibraryPath":""}"#,
        )
        .unwrap();
        assert_eq!(legacy.ai_api_key, "legacy-value");
        assert!(legacy.text_auto_save_enabled);
    }

    #[test]
    fn saved_search_config_is_bounded_and_uses_indexed_formats() {
        let valid = SavedSearchConfig {
            id: "search-1".into(),
            name: "Project notes".into(),
            query: "milestone".into(),
            library_path: "C:\\Knowledge".into(),
            object_types: vec!["markdown".into(), "pdf".into()],
            graph_root: None,
            graph_depth: None,
            created_at: 1,
        };
        let libraries = vec![LibraryConfig {
            name: "Knowledge".into(),
            path: "C:\\Knowledge".into(),
            ..Default::default()
        }];
        assert!(validate_saved_searches(std::slice::from_ref(&valid), &libraries).is_ok());

        let mut duplicate = valid.clone();
        duplicate.object_types.push("pdf".into());
        assert!(validate_saved_searches(&[duplicate], &libraries).is_err());

        let mut unsupported = valid;
        unsupported.object_types = vec!["unknown".into()];
        assert!(validate_saved_searches(&[unsupported], &libraries).is_err());

        let mut outside = SavedSearchConfig {
            id: "search-2".into(),
            name: "Outside".into(),
            query: "query".into(),
            library_path: "C:\\Outside".into(),
            object_types: vec![],
            graph_root: None,
            graph_depth: None,
            created_at: 2,
        };
        assert!(validate_saved_searches(std::slice::from_ref(&outside), &libraries).is_err());
        outside.library_path = libraries[0].path.clone();
        assert!(validate_saved_searches(&[outside], &libraries).is_ok());

        let graph_collection = SavedSearchConfig {
            id: "graph-1".into(),
            name: "Project graph".into(),
            query: GRAPH_COLLECTION_QUERY.into(),
            library_path: libraries[0].path.clone(),
            object_types: vec![],
            graph_root: Some("Projects\\Alpha.md".into()),
            graph_depth: Some(2),
            created_at: 3,
        };
        assert!(
            validate_saved_searches(std::slice::from_ref(&graph_collection), &libraries).is_ok()
        );
        let mut unsafe_graph = graph_collection;
        unsafe_graph.graph_root = Some("..\\Outside.md".into());
        assert!(validate_saved_searches(&[unsafe_graph], &libraries).is_err());
    }
}
