use crate::formats::file_registry::file_format_by_id;
use scraper::{Html, Selector};
use serde::Serialize;
#[cfg(target_os = "windows")]
use std::process::Command;
#[cfg(target_os = "windows")]
use winreg::{enums::HKEY_CURRENT_USER, RegKey};

const LONGEDIT_REGISTERED_APP: &str = "LongEdit";
const LONGEDIT_PROG_ID: &str = "LongEdit.ExternalFile";
const LONGEDIT_CAPABILITIES_PATH: &str = r"Software\LongEdit\Capabilities";

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DefaultAppCandidateStatus {
    pub format_id: String,
    pub extensions: Vec<String>,
    pub registered_extensions: Vec<String>,
    pub available: bool,
    pub user_choice_required: bool,
    pub diagnostic: String,
}

fn default_app_candidate_extensions(format_id: &str) -> Result<Vec<String>, String> {
    let format = file_format_by_id(format_id)?;
    if !matches!(format.external_policy.as_str(), "edit" | "preview") {
        return Err(format!(
            "{} 当前不能注册为 LongEdit 外部打开候选",
            format.label
        ));
    }
    Ok(format.extensions.clone())
}

#[cfg(target_os = "windows")]
fn registered_candidate_extensions(extensions: &[String]) -> Vec<String> {
    let classes = RegKey::predef(HKEY_CURRENT_USER);
    extensions
        .iter()
        .filter(|extension| {
            classes
                .open_subkey(format!(r"Software\Classes\{}\OpenWithProgids", extension))
                .and_then(|key| key.get_raw_value(LONGEDIT_PROG_ID))
                .is_ok()
        })
        .cloned()
        .collect()
}

#[cfg(target_os = "windows")]
fn default_app_status(format_id: &str, extensions: Vec<String>) -> DefaultAppCandidateStatus {
    let registered_extensions = registered_candidate_extensions(&extensions);
    DefaultAppCandidateStatus {
        format_id: format_id.to_string(),
        extensions,
        registered_extensions,
        available: true,
        user_choice_required: true,
        diagnostic: "LongEdit 只注册为可选应用；是否成为默认应用仍由 Windows 和用户确认。".into(),
    }
}

#[cfg(not(target_os = "windows"))]
fn default_app_status(format_id: &str, extensions: Vec<String>) -> DefaultAppCandidateStatus {
    DefaultAppCandidateStatus {
        format_id: format_id.to_string(),
        extensions,
        registered_extensions: Vec::new(),
        available: false,
        user_choice_required: true,
        diagnostic: "逐格式默认应用配置当前仅支持 Windows。".into(),
    }
}

#[tauri::command]
pub fn get_default_app_candidate_status(
    format_id: String,
) -> Result<DefaultAppCandidateStatus, String> {
    let extensions = default_app_candidate_extensions(&format_id)?;
    Ok(default_app_status(&format_id, extensions))
}

#[tauri::command]
pub fn prepare_default_app_candidate(
    format_id: String,
) -> Result<DefaultAppCandidateStatus, String> {
    let extensions = default_app_candidate_extensions(&format_id)?;

    #[cfg(target_os = "windows")]
    {
        let executable = std::env::current_exe()
            .map_err(|error| format!("无法定位 LongEdit 程序文件: {error}"))?;
        let executable = executable
            .to_str()
            .ok_or_else(|| "LongEdit 程序路径不是有效的 Unicode 路径".to_string())?;
        let classes = RegKey::predef(HKEY_CURRENT_USER);
        let (program, _) = classes
            .create_subkey(format!(r"Software\Classes\{LONGEDIT_PROG_ID}"))
            .map_err(|error| format!("无法注册 LongEdit 打开能力: {error}"))?;
        program
            .set_value("", &"LongEdit 支持的外部文件")
            .map_err(|error| format!("无法写入 LongEdit 文件说明: {error}"))?;
        let (icon, _) = program
            .create_subkey("DefaultIcon")
            .map_err(|error| format!("无法注册 LongEdit 文件图标: {error}"))?;
        icon.set_value("", &format!(r#""{executable}",0"#))
            .map_err(|error| format!("无法写入 LongEdit 文件图标: {error}"))?;
        let (open_command, _) = program
            .create_subkey(r"shell\open\command")
            .map_err(|error| format!("无法注册 LongEdit 打开命令: {error}"))?;
        open_command
            .set_value("", &format!(r#""{executable}" "%1""#))
            .map_err(|error| format!("无法写入 LongEdit 打开命令: {error}"))?;

        let (capabilities, _) = classes
            .create_subkey(LONGEDIT_CAPABILITIES_PATH)
            .map_err(|error| format!("无法注册 LongEdit 默认应用能力: {error}"))?;
        capabilities
            .set_value("ApplicationName", &LONGEDIT_REGISTERED_APP)
            .and_then(|_| {
                capabilities.set_value(
                    "ApplicationDescription",
                    &"由用户逐格式选择的 LongEdit 文件编辑与安全预览能力",
                )
            })
            .map_err(|error| format!("无法写入 LongEdit 应用说明: {error}"))?;
        let (file_associations, _) = capabilities
            .create_subkey("FileAssociations")
            .map_err(|error| format!("无法注册 LongEdit 格式能力: {error}"))?;
        for extension in &extensions {
            let (open_with, _) = classes
                .create_subkey(format!(r"Software\Classes\{}\OpenWithProgids", extension))
                .map_err(|error| format!("无法准备 {extension} 的应用候选: {error}"))?;
            open_with
                .set_value(LONGEDIT_PROG_ID, &"")
                .and_then(|_| file_associations.set_value(extension, &LONGEDIT_PROG_ID))
                .map_err(|error| format!("无法准备 {extension} 的应用候选: {error}"))?;
        }
        let (registered_apps, _) = classes
            .create_subkey(r"Software\RegisteredApplications")
            .map_err(|error| format!("无法登记 LongEdit 默认应用入口: {error}"))?;
        registered_apps
            .set_value(LONGEDIT_REGISTERED_APP, &LONGEDIT_CAPABILITIES_PATH)
            .map_err(|error| format!("无法登记 LongEdit 默认应用入口: {error}"))?;

        open_default_apps_settings_for_longedit()?;
        return Ok(default_app_status(&format_id, extensions));
    }

    #[cfg(not(target_os = "windows"))]
    Err("逐格式默认应用配置当前仅支持 Windows。".to_string())
}

#[tauri::command]
pub fn open_default_apps_settings() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    let mut command = Command::new("explorer.exe");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
        command.arg("ms-settings:defaultapps");
        return command
            .spawn()
            .map(|_| ())
            .map_err(|error| error.to_string());
    }

    #[cfg(not(target_os = "windows"))]
    Err("默认应用设置仅在 Windows 上可用".to_string())
}

#[cfg(target_os = "windows")]
fn open_default_apps_settings_for_longedit() -> Result<(), String> {
    use std::os::windows::process::CommandExt;
    Command::new("explorer.exe")
        .creation_flags(0x08000000)
        .arg("ms-settings:defaultapps?registeredAppUser=LongEdit")
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn get_url_title(url: String) -> Result<String, String> {
    let response = reqwest::get(&url)
        .await
        .map_err(|error| error.to_string())?;
    let body = response.text().await.map_err(|error| error.to_string())?;
    let document = Html::parse_document(&body);
    let selector = Selector::parse("title").map_err(|_| "解析失败")?;
    Ok(document
        .select(&selector)
        .next()
        .map(|element| element.inner_html().trim().to_string())
        .unwrap_or(url))
}

#[tauri::command]
pub fn exit_app(app_handle: tauri::AppHandle) {
    app_handle.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_app_candidates_follow_external_workspace_policy() {
        assert_eq!(default_app_candidate_extensions("opml").unwrap(), [".opml"]);
        assert!(default_app_candidate_extensions("legacy-doc").is_err());
        assert!(default_app_candidate_extensions("wps-document").is_err());
        assert!(default_app_candidate_extensions("missing-format").is_err());
    }
}
