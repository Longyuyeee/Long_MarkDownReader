use scraper::{Html, Selector};
use std::process::Command;

#[tauri::command]
pub fn set_as_default_handler() -> Result<(), String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let script = format!(
        "$classesPath = 'Registry::HKEY_CURRENT_USER\\Software\\Classes'; \
         $mdPath = \"$classesPath\\.md\"; \
         $progId = 'Long编辑.MD'; \
         $progIdPath = \"$classesPath\\$progId\"; \
         if (-not (Test-Path $mdPath)) {{ New-Item -Path $mdPath -Force | Out-Null }}; \
         Set-Item -Path $mdPath -Value $progId; \
         if (-not (Test-Path \"$progIdPath\\shell\\open\\command\")) {{ New-Item -Path \"$progIdPath\\shell\\open\\command\" -Force | Out-Null }}; \
         Set-Item -Path $progIdPath -Value 'Markdown 文本文件'; \
         Set-ItemProperty -Path $progIdPath -Name 'FriendlyAppName' -Value 'Long编辑'; \
         Set-Item -Path \"$progIdPath\\shell\\open\\command\" -Value '\"{}\" \"%1\"'",
        executable.to_string_lossy()
    );
    let output = hidden_powershell(&script)?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn check_association_status() -> bool {
    hidden_powershell(
        "(Get-Item -Path 'Registry::HKEY_CURRENT_USER\\Software\\Classes\\.md' -ErrorAction SilentlyContinue).'(default)'",
    )
    .map(|output| String::from_utf8_lossy(&output.stdout).trim() == "Long编辑.MD")
    .unwrap_or(false)
}

fn hidden_powershell(script: &str) -> Result<std::process::Output, String> {
    let mut command = Command::new("powershell");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    command
        .args(["-Command", script])
        .output()
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
