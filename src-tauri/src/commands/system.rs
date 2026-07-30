use scraper::{Html, Selector};
#[cfg(target_os = "windows")]
use std::process::Command;

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
