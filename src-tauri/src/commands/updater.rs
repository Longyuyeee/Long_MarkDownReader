use reqwest::header::{ACCEPT, USER_AGENT};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::PathBuf, time::Duration};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;
#[cfg(windows)]
use std::process::Command;

const RELEASE_API: &str =
    "https://api.github.com/repos/Longyuyeee/Long_MarkDownReader/releases/latest";
const RELEASE_DOWNLOAD_PREFIX: &str = "/Longyuyeee/Long_MarkDownReader/releases/download/";
const MAX_INSTALLER_BYTES: u64 = 250 * 1024 * 1024;
const PROGRESS_EMIT_BYTES: u64 = 256 * 1024;
const UPDATE_PROGRESS_EVENT: &str = "community-update-progress";

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
#[cfg(windows)]
const CREATE_NEW_PROCESS_GROUP: u32 = 0x00000200;

#[cfg(windows)]
const UPDATE_RELAUNCH_SCRIPT: &str = r#"
$ErrorActionPreference = 'Stop'
$installer = $env:LONGEDIT_UPDATE_INSTALLER
$application = $env:LONGEDIT_UPDATE_APPLICATION
$workingDirectory = Split-Path -Parent $application
$log = Join-Path (Split-Path -Parent $installer) 'relaunch.log'
function Write-RelaunchLog([string]$message) {
  Add-Content -LiteralPath $log -Value "$(Get-Date -Format o) $message" -Encoding UTF8 -ErrorAction SilentlyContinue
}
Write-RelaunchLog 'installer-start'
$install = Start-Process -FilePath $installer -ArgumentList '/S' -PassThru -Wait
Write-RelaunchLog "installer-exit=$($install.ExitCode)"
if ($install.ExitCode -ne 0) { exit $install.ExitCode }
Remove-Item Env:LONGEDIT_UPDATE_INSTALLER -ErrorAction SilentlyContinue
Remove-Item Env:LONGEDIT_UPDATE_APPLICATION -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1500
for ($attempt = 0; $attempt -lt 40; $attempt += 1) {
  if (Test-Path -LiteralPath $application) {
    try {
      $relaunch = Start-Process -FilePath $application -WorkingDirectory $workingDirectory -PassThru
      Start-Sleep -Milliseconds 1500
      $relaunch.Refresh()
      if (-not $relaunch.HasExited) {
        Write-RelaunchLog "relaunch-stable pid=$($relaunch.Id) attempt=$attempt"
        exit 0
      }
      Write-RelaunchLog "relaunch-exited code=$($relaunch.ExitCode) attempt=$attempt"
    }
    catch {
      Write-RelaunchLog "relaunch-error attempt=$attempt type=$($_.Exception.GetType().Name)"
    }
  }
  Start-Sleep -Milliseconds 500
}
Write-RelaunchLog 'relaunch-failed'
exit 1
"#;

#[cfg(windows)]
fn spawn_update_relauncher(installer: &std::path::Path) -> Result<(), String> {
    let application =
        std::env::current_exe().map_err(|error| format!("无法定位更新后的应用程序：{error}"))?;
    Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle",
            "Hidden",
            "-Command",
            UPDATE_RELAUNCH_SCRIPT,
        ])
        .env("LONGEDIT_UPDATE_INSTALLER", installer)
        .env("LONGEDIT_UPDATE_APPLICATION", application)
        .creation_flags(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP)
        .spawn()
        .map_err(|error| format!("启动更新安装与重启助手失败：{error}"))?;
    Ok(())
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
    draft: bool,
    prerelease: bool,
    assets: Vec<GithubAsset>,
}

#[derive(Debug, Clone, Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
    size: u64,
    digest: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommunityUpdateInfo {
    available: bool,
    current_version: String,
    latest_version: String,
    release_url: String,
    release_notes: String,
    published_at: Option<String>,
    installer_name: String,
    installer_size: u64,
    installer_sha256: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommunityUpdateProgress {
    phase: &'static str,
    downloaded_bytes: u64,
    total_bytes: u64,
    percent: u8,
}

fn progress_percent(downloaded: u64, total: u64) -> u8 {
    if total == 0 {
        0
    } else {
        ((downloaded.saturating_mul(100) / total).min(100)) as u8
    }
}

fn emit_update_progress(app: &AppHandle, phase: &'static str, downloaded: u64, total: u64) {
    let _ = app.emit(
        UPDATE_PROGRESS_EVENT,
        CommunityUpdateProgress {
            phase,
            downloaded_bytes: downloaded,
            total_bytes: total,
            percent: progress_percent(downloaded, total),
        },
    );
}

struct ValidatedRelease {
    version: String,
    release_url: String,
    notes: String,
    published_at: Option<String>,
    asset: GithubAsset,
    sha256: String,
}

fn clean_version(value: &str) -> &str {
    value.trim().trim_start_matches(['v', 'V'])
}

fn version_parts(value: &str) -> Option<Vec<u64>> {
    let core = clean_version(value).split(['-', '+']).next()?;
    let parts = core
        .split('.')
        .map(str::parse::<u64>)
        .collect::<Result<Vec<_>, _>>()
        .ok()?;
    (parts.len() == 3).then_some(parts)
}

fn is_newer(candidate: &str, current: &str) -> Result<bool, String> {
    let candidate =
        version_parts(candidate).ok_or_else(|| format!("远端版本号格式无效：{candidate}"))?;
    let current = version_parts(current).ok_or_else(|| format!("当前版本号格式无效：{current}"))?;
    Ok(candidate > current)
}

fn parse_sha256(value: Option<&str>) -> Result<String, String> {
    let digest = value
        .and_then(|item| item.strip_prefix("sha256:"))
        .ok_or_else(|| "发布附件没有 GitHub SHA-256 摘要，已拒绝下载".to_string())?;
    if digest.len() != 64 || !digest.chars().all(|item| item.is_ascii_hexdigit()) {
        return Err("发布附件的 SHA-256 摘要格式无效，已拒绝下载".to_string());
    }
    Ok(digest.to_ascii_lowercase())
}

fn validate_download_url(value: &str) -> Result<(), String> {
    let url = reqwest::Url::parse(value).map_err(|_| "更新下载地址无效".to_string())?;
    if url.scheme() != "https"
        || url.host_str() != Some("github.com")
        || !url.path().starts_with(RELEASE_DOWNLOAD_PREFIX)
    {
        return Err("更新下载地址不属于 LongEdit 官方 GitHub Release，已拒绝下载".to_string());
    }
    Ok(())
}

fn select_installer(release: &GithubRelease) -> Result<(GithubAsset, String), String> {
    if cfg!(not(all(target_os = "windows", target_arch = "x86_64"))) {
        return Err("当前自动安装仅支持 Windows x64".to_string());
    }
    let expected_version = clean_version(&release.tag_name);
    let expected_name = format!("LongEdit_{expected_version}_x64-setup.exe");
    let asset = release
        .assets
        .iter()
        .find(|asset| asset.name == expected_name)
        .cloned()
        .ok_or_else(|| format!("最新发布中没有找到受支持的安装包：{expected_name}"))?;
    if asset.size == 0 || asset.size > MAX_INSTALLER_BYTES {
        return Err("安装包大小异常，已拒绝下载".to_string());
    }
    validate_download_url(&asset.browser_download_url)?;
    let digest = parse_sha256(asset.digest.as_deref())?;
    Ok((asset, digest))
}

async fn latest_release() -> Result<ValidatedRelease, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|error| format!("无法初始化更新检查：{error}"))?;
    let response = client
        .get(RELEASE_API)
        .header(
            USER_AGENT,
            format!("LongEdit/{} community-updater", env!("CARGO_PKG_VERSION")),
        )
        .header(ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| format!("无法连接 GitHub 检查更新：{error}"))?
        .error_for_status()
        .map_err(|error| format!("GitHub 更新检查失败：{error}"))?
        .json::<GithubRelease>()
        .await
        .map_err(|error| format!("GitHub 发布信息格式无效：{error}"))?;
    if response.draft || response.prerelease {
        return Err("GitHub 最新发布不是稳定版本，已停止更新".to_string());
    }
    version_parts(&response.tag_name).ok_or_else(|| "GitHub 最新发布版本号格式无效".to_string())?;
    let (asset, sha256) = select_installer(&response)?;
    Ok(ValidatedRelease {
        version: clean_version(&response.tag_name).to_string(),
        release_url: response.html_url,
        notes: response.body.unwrap_or_default(),
        published_at: response.published_at,
        asset,
        sha256,
    })
}

#[tauri::command]
pub async fn check_community_update() -> Result<CommunityUpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let release = latest_release().await?;
    Ok(CommunityUpdateInfo {
        available: is_newer(&release.version, &current_version)?,
        current_version,
        latest_version: release.version,
        release_url: release.release_url,
        release_notes: release.notes,
        published_at: release.published_at,
        installer_name: release.asset.name,
        installer_size: release.asset.size,
        installer_sha256: release.sha256,
    })
}

fn update_directory() -> Result<PathBuf, String> {
    let directory = std::env::temp_dir().join("LongEdit").join("updates");
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建更新缓存目录：{error}"))?;
    Ok(directory)
}

#[tauri::command]
pub async fn install_community_update(
    app: AppHandle,
    expected_version: String,
) -> Result<(), String> {
    let release = latest_release().await?;
    if clean_version(&expected_version) != release.version {
        return Err("远端最新版本已经变化，请重新检查更新后再安装".to_string());
    }

    let mut response = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("无法初始化更新下载：{error}"))?
        .get(&release.asset.browser_download_url)
        .header(
            USER_AGENT,
            format!("LongEdit/{} community-updater", env!("CARGO_PKG_VERSION")),
        )
        .send()
        .await
        .map_err(|error| format!("下载安装包失败：{error}"))?
        .error_for_status()
        .map_err(|error| format!("下载安装包失败：{error}"))?;
    if response.content_length().unwrap_or(release.asset.size) > MAX_INSTALLER_BYTES {
        return Err("下载响应大小异常，已停止安装".to_string());
    }

    let directory = update_directory()?;
    let temporary = directory.join(format!("{}.download", release.asset.name));
    let installer = directory.join(&release.asset.name);
    if temporary.exists() {
        fs::remove_file(&temporary).map_err(|error| format!("清理未完成下载失败：{error}"))?;
    }

    let download_result: Result<(), String> = async {
        let mut file = fs::File::create(&temporary)
            .map_err(|error| format!("创建更新下载文件失败：{error}"))?;
        let mut hasher = Sha256::new();
        let mut downloaded = 0_u64;
        let mut last_emitted = 0_u64;
        emit_update_progress(&app, "downloading", 0, release.asset.size);

        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|error| format!("读取安装包失败：{error}"))?
        {
            downloaded = downloaded.saturating_add(chunk.len() as u64);
            if downloaded > release.asset.size || downloaded > MAX_INSTALLER_BYTES {
                return Err("安装包下载大小超过发布记录，已停止安装".to_string());
            }
            file.write_all(&chunk)
                .map_err(|error| format!("保存安装包失败：{error}"))?;
            hasher.update(&chunk);
            if downloaded == release.asset.size
                || downloaded.saturating_sub(last_emitted) >= PROGRESS_EMIT_BYTES
            {
                emit_update_progress(&app, "downloading", downloaded, release.asset.size);
                last_emitted = downloaded;
            }
        }
        file.flush()
            .map_err(|error| format!("刷新安装包缓存失败：{error}"))?;
        if downloaded != release.asset.size {
            return Err("安装包下载不完整，已停止安装".to_string());
        }

        emit_update_progress(&app, "verifying", downloaded, release.asset.size);
        let actual = format!("{:x}", hasher.finalize());
        if actual != release.sha256 {
            return Err("安装包 SHA-256 校验失败，已删除下载并停止安装".to_string());
        }
        if installer.exists() {
            fs::remove_file(&installer).map_err(|error| format!("清理旧安装包失败：{error}"))?;
        }
        fs::rename(&temporary, &installer).map_err(|error| format!("准备安装包失败：{error}"))?;
        emit_update_progress(&app, "installing", downloaded, release.asset.size);
        Ok(())
    }
    .await;
    if let Err(error) = download_result {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }

    #[cfg(windows)]
    {
        spawn_update_relauncher(&installer)?;
        app.exit(0);
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("当前自动安装仅支持 Windows x64".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_release_versions_numerically() {
        assert!(is_newer("v1.0.10", "1.0.9").unwrap());
        assert!(!is_newer("1.0.4", "1.0.4").unwrap());
        assert!(!is_newer("1.0.3", "1.0.4").unwrap());
        assert!(is_newer("2.0.0", "1.99.99").unwrap());
    }

    #[test]
    fn rejects_untrusted_download_locations() {
        assert!(validate_download_url("https://example.com/LongEdit.exe").is_err());
        assert!(validate_download_url(
            "https://github.com/Longyuyeee/Long_MarkDownReader/releases/download/v1.0.6/LongEdit_1.0.6_x64-setup.exe"
        )
        .is_ok());
    }

    #[test]
    fn requires_a_full_github_sha256_digest() {
        assert!(parse_sha256(Some(&format!("sha256:{}", "a".repeat(64)))).is_ok());
        assert!(parse_sha256(Some("sha256:abc")).is_err());
        assert!(parse_sha256(None).is_err());
    }

    #[test]
    fn download_progress_is_bounded_and_monotonic() {
        assert_eq!(progress_percent(0, 0), 0);
        assert_eq!(progress_percent(0, 100), 0);
        assert_eq!(progress_percent(1, 3), 33);
        assert_eq!(progress_percent(50, 100), 50);
        assert_eq!(progress_percent(100, 100), 100);
        assert_eq!(progress_percent(120, 100), 100);
    }

    #[cfg(windows)]
    #[test]
    fn update_relauncher_waits_for_install_and_reopens_the_application() {
        assert!(UPDATE_RELAUNCH_SCRIPT.contains("-PassThru -Wait"));
        assert!(UPDATE_RELAUNCH_SCRIPT.contains("$install.ExitCode"));
        assert!(UPDATE_RELAUNCH_SCRIPT.contains("-WorkingDirectory $workingDirectory -PassThru"));
        assert!(UPDATE_RELAUNCH_SCRIPT.contains("-not $relaunch.HasExited"));
        assert!(UPDATE_RELAUNCH_SCRIPT.contains("relaunch-stable"));
        assert_eq!(CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP, 0x08000200);
    }
}
