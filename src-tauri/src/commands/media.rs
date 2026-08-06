use crate::formats::file_registry::file_format_for_path;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::time::UNIX_EPOCH;
use tauri::AppHandle;
use tauri_plugin_fs::FsExt;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
const VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "ogv", "m4v"];

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInspection {
    pub path: String,
    pub format_id: String,
    pub format_label: String,
    pub kind: String,
    pub mime_type: String,
    pub size: u64,
    pub modified: u64,
    pub read_only: bool,
}

fn mime_type(extension: &str) -> &'static str {
    match extension {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "avif" => "image/avif",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "ogv" => "video/ogg",
        _ => "application/octet-stream",
    }
}

#[tauri::command]
pub async fn inspect_media_file(
    app: AppHandle,
    library_root: String,
    path: String,
) -> Result<MediaInspection, String> {
    let allowed: Vec<&str> = IMAGE_EXTENSIONS.iter().chain(VIDEO_EXTENSIONS.iter()).copied().collect();
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &allowed)?;
    let format = file_format_for_path(&path)?;
    if !["raster-image", "video"].contains(&format.id.as_str()) {
        return Err("当前文件没有注册为媒体预览格式".into());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > format.max_bytes {
        return Err(format!("{} 超过 {} MiB 的应用内预览上限，请使用外部播放器打开", format.label, format.max_bytes / 1024 / 1024));
    }
    app.fs_scope().allow_file(&path)
        .map_err(|error| format!("无法授权当前媒体文件的只读预览: {error}"))?;
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase();
    let modified = metadata.modified().ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();
    Ok(MediaInspection {
        path: path.to_string_lossy().to_string(),
        format_id: format.id.clone(),
        format_label: format.label.clone(),
        kind: if IMAGE_EXTENSIONS.contains(&extension.as_str()) { "image" } else { "video" }.into(),
        mime_type: mime_type(&extension).into(),
        size: metadata.len(),
        modified,
        read_only: true,
    })
}
