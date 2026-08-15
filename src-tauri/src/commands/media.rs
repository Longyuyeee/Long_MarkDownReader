use crate::formats::file_registry::file_format_for_path;
use crate::formats::raster_image::{
    inspect_raster_image, transform_raster_image, RasterImageTransform, EDITABLE_IMAGE_EXTENSIONS,
    MAX_IMAGE_BYTES,
};
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::Path;
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageEditIdentity {
    pub path: String,
    pub source_digest: String,
    pub width: u32,
    pub height: u32,
    pub editable_extensions: Vec<String>,
    pub max_edge: u32,
    pub save_mode: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageSavedCopyReport {
    pub status: String,
    pub source_path: String,
    pub target_path: String,
    pub source_digest: String,
    pub output_digest: String,
    pub source_width: u32,
    pub source_height: u32,
    pub output_width: u32,
    pub output_height: u32,
    pub output_mime_type: String,
    pub output_bytes: u64,
    pub source_unchanged: bool,
    pub target_reopened: bool,
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

#[tauri::command]
pub async fn inspect_image_edit_source(
    library_root: String,
    path: String,
) -> Result<ImageEditIdentity, String> {
    let path = WorkspaceGuard::new(library_root)?
        .resolve_existing_file(path, EDITABLE_IMAGE_EXTENSIONS)?;
    let source = fs::read(&path).map_err(|error| format!("读取源图片失败: {error}"))?;
    let extension = extension_for(&path)?;
    let (width, height, source_digest) = inspect_raster_image(&source, &extension)?;
    Ok(ImageEditIdentity {
        path: path.to_string_lossy().to_string(),
        source_digest,
        width,
        height,
        editable_extensions: EDITABLE_IMAGE_EXTENSIONS
            .iter()
            .map(|value| value.to_string())
            .collect(),
        max_edge: 16_384,
        save_mode: "copy-only".into(),
    })
}

#[tauri::command]
pub async fn save_image_transform_copy(
    library_root: String,
    source_path: String,
    target_path: String,
    expected_source_digest: String,
    transform: RasterImageTransform,
) -> Result<ImageSavedCopyReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(source_path, EDITABLE_IMAGE_EXTENSIONS)?;
    let target_path = guard.resolve_file_for_write(target_path, EDITABLE_IMAGE_EXTENSIONS)?;
    save_image_transform_copy_to_path(
        &source_path,
        &target_path,
        &expected_source_digest,
        &transform,
    )
}

fn extension_for(path: &Path) -> Result<String, String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "图片路径缺少受支持的扩展名".into())
}

fn remove_created_image_if_exact(path: &Path, expected: &[u8]) {
    if fs::read(path).is_ok_and(|bytes| bytes == expected) {
        let _ = fs::remove_file(path);
    }
}

fn save_image_transform_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_source_digest: &str,
    transform: &RasterImageTransform,
) -> Result<ImageSavedCopyReport, String> {
    if source_path == target_path {
        return Err("可靠另存禁止覆盖源图片".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠另存不会覆盖现有文件".into());
    }
    let source_metadata = source_path
        .metadata()
        .map_err(|error| format!("读取源图片元数据失败: {error}"))?;
    if source_metadata.len() > MAX_IMAGE_BYTES as u64 {
        return Err("图片超过 100 MiB 安全编辑上限".into());
    }
    let source = fs::read(source_path).map_err(|error| format!("读取源图片失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    if source_digest != expected_source_digest.trim().to_ascii_lowercase() {
        return Err("源图片已被外部修改，请重新打开后再另存".into());
    }
    let source_extension = extension_for(source_path)?;
    let target_extension = extension_for(target_path)?;
    let transformed =
        transform_raster_image(&source, &source_extension, &target_extension, transform)?;
    let source_before_write =
        fs::read(source_path).map_err(|error| format!("保存前复核源图片失败: {error}"))?;
    if source_before_write != source {
        return Err("源图片在隔离处理期间发生变化，请重新打开后再保存".into());
    }
    write_new_bytes(target_path, &transformed.output_bytes)?;
    let verification = (|| -> Result<(), String> {
        let saved = fs::read(target_path)
            .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
        if saved != transformed.output_bytes
            || format!("{:x}", Sha256::digest(&saved)) != transformed.output_digest
        {
            return Err("目标图片落盘字节与隔离验证输出不一致".into());
        }
        let (saved_width, saved_height, _) = inspect_raster_image(&saved, &target_extension)
            .map_err(|error| format!("目标图片结构复读失败: {error}"))?;
        if (saved_width, saved_height) != (transformed.output_width, transformed.output_height) {
            return Err("目标图片复读尺寸与隔离验证输出不一致".into());
        }
        let source_after =
            fs::read(source_path).map_err(|error| format!("保存后复核源图片失败: {error}"))?;
        if source_after != source {
            return Err("源图片在另存期间发生变化".into());
        }
        Ok(())
    })();
    if let Err(error) = verification {
        remove_created_image_if_exact(target_path, &transformed.output_bytes);
        return Err(error);
    }
    Ok(ImageSavedCopyReport {
        status: "saved_verified".into(),
        source_path: source_path.to_string_lossy().to_string(),
        target_path: target_path.to_string_lossy().to_string(),
        source_digest,
        output_digest: transformed.output_digest,
        source_width: transformed.source_width,
        source_height: transformed.source_height,
        output_width: transformed.output_width,
        output_height: transformed.output_height,
        output_mime_type: transformed.output_mime_type,
        output_bytes: transformed.output_bytes.len() as u64,
        source_unchanged: true,
        target_reopened: true,
    })
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
    use super::{mime_type, playback_support, save_image_transform_copy_to_path};
    use crate::formats::raster_image::RasterImageTransform;
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
    use sha2::{Digest, Sha256};
    use std::fs;
    use std::io::Cursor;

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

    #[test]
    fn saves_verified_copy_without_changing_or_overwriting_source() {
        let base = std::env::temp_dir().join(format!(
            "longedit-image-copy-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let source_path = base.join("source.png");
        let target_path = base.join("copy.jpg");
        let image =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(3, 2, Rgba([10, 20, 30, 255])));
        let mut source = Vec::new();
        image
            .write_to(&mut Cursor::new(&mut source), ImageFormat::Png)
            .unwrap();
        fs::write(&source_path, &source).unwrap();
        let source_digest = format!("{:x}", Sha256::digest(&source));
        let report = save_image_transform_copy_to_path(
            &source_path,
            &target_path,
            &source_digest,
            &RasterImageTransform {
                quarter_turns: 1,
                flip_horizontal: false,
                flip_vertical: true,
                width: Some(8),
                height: Some(12),
            },
        )
        .unwrap();
        assert_eq!(report.status, "saved_verified");
        assert_eq!((report.output_width, report.output_height), (8, 12));
        assert_eq!(fs::read(&source_path).unwrap(), source);
        assert!(target_path.exists());
        assert!(save_image_transform_copy_to_path(
            &source_path,
            &target_path,
            &source_digest,
            &RasterImageTransform {
                quarter_turns: 0,
                flip_horizontal: false,
                flip_vertical: false,
                width: None,
                height: None,
            },
        )
        .unwrap_err()
        .contains("不会覆盖"));
        fs::remove_dir_all(base).unwrap();
    }
}
