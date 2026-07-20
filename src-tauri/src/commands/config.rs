use crate::services::credentials::{delete_ai_secret, read_ai_secret, store_ai_secret};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

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
        }
    }
}

#[tauri::command]
pub fn get_config(app_handle: tauri::AppHandle) -> AppConfig {
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
    let config_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|error| format!("config dir error: {error}"))?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|error| error.to_string())?;
    }
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
    }
}
