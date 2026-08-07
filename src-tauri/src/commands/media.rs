use crate::formats::file_registry::file_format_for_path;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::FsExt;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "webm", "ogv", "m4v", "mov", "mkv", "avi", "mpeg", "mpg",
];
const DIRECT_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "ogv", "m4v"];

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
    pub extension: String,
    pub playback_support: String,
    pub streaming: bool,
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
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        "mpeg" | "mpg" => "video/mpeg",
        _ => "application/octet-stream",
    }
}

fn playback_support(extension: &str, is_image: bool) -> &'static str {
    if is_image {
        "native-image"
    } else if DIRECT_VIDEO_EXTENSIONS.contains(&extension) {
        "webview-native"
    } else {
        "system-codec-dependent"
    }
}

#[tauri::command]
pub async fn inspect_media_file(
    app: AppHandle,
    library_root: String,
    path: String,
) -> Result<MediaInspection, String> {
    let allowed: Vec<&str> = IMAGE_EXTENSIONS
        .iter()
        .chain(VIDEO_EXTENSIONS.iter())
        .copied()
        .collect();
    let path = WorkspaceGuard::new(library_root)?.resolve_existing_file(path, &allowed)?;
    inspect_resolved_media_file(&app, path)
}

#[tauri::command]
pub async fn inspect_external_media_file(
    app: AppHandle,
    access: State<'_, ExternalFileAccess>,
    path: String,
) -> Result<MediaInspection, String> {
    let path = access.resolve_preview(path)?;
    inspect_resolved_media_file(&app, path)
}

fn inspect_resolved_media_file(
    app: &AppHandle,
    path: std::path::PathBuf,
) -> Result<MediaInspection, String> {
    let format = file_format_for_path(&path)?;
    if !["raster-image", "video"].contains(&format.id.as_str()) {
        return Err("当前文件没有注册为媒体预览格式".into());
    }
    let metadata = path.metadata().map_err(|error| error.to_string())?;
    if metadata.len() > format.max_bytes {
        return Err(format!(
            "{} 超过 {} MiB 的应用内预览上限，请使用外部播放器打开",
            format.label,
            format.max_bytes / 1024 / 1024
        ));
    }
    app.fs_scope()
        .allow_file(&path)
        .map_err(|error| format!("无法授权当前媒体文件的只读预览: {error}"))?;
    app.asset_protocol_scope()
        .allow_file(&path)
        .map_err(|error| format!("无法授权当前媒体文件的流式预览: {error}"))?;

    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default();
    let is_image = IMAGE_EXTENSIONS.contains(&extension.as_str());
    Ok(MediaInspection {
        path: path.to_string_lossy().to_string(),
        format_id: format.id.clone(),
        format_label: format.label.clone(),
        kind: if is_image { "image" } else { "video" }.into(),
        mime_type: mime_type(&extension).into(),
        size: metadata.len(),
        modified,
        read_only: true,
        extension: extension.clone(),
        playback_support: playback_support(&extension, is_image).into(),
        streaming: true,
    })
}

#[cfg(test)]
mod tests {
    use super::{mime_type, playback_support};

    #[test]
    fn classifies_native_and_codec_dependent_video_formats() {
        assert_eq!(playback_support("mp4", false), "webview-native");
        assert_eq!(playback_support("webm", false), "webview-native");
        assert_eq!(playback_support("mkv", false), "system-codec-dependent");
        assert_eq!(playback_support("mov", false), "system-codec-dependent");
        assert_eq!(playback_support("avif", true), "native-image");
    }

    #[test]
    fn maps_extended_video_mime_types() {
        assert_eq!(mime_type("mov"), "video/quicktime");
        assert_eq!(mime_type("mkv"), "video/x-matroska");
        assert_eq!(mime_type("avi"), "video/x-msvideo");
        assert_eq!(mime_type("mpeg"), "video/mpeg");
    }
}
