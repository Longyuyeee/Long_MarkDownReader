use crate::formats::file_registry::file_format_for_path;
use crate::formats::raster_image::{
    inspect_raster_image, transform_raster_image, RasterImageTransform, EDITABLE_IMAGE_EXTENSIONS,
    MAX_IMAGE_BYTES,
};
use crate::formats::text::read_text_snapshot;
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::GenericImageView;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_fs::FsExt;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "avif"];
const VIDEO_EXTENSIONS: &[&str] = &[
    "mp4", "webm", "ogv", "m4v", "mov", "mkv", "avi", "mpeg", "mpg",
];
const DIRECT_VIDEO_EXTENSIONS: &[&str] = &["mp4", "webm", "ogv", "m4v"];
const MAX_VIDEO_FRAME_PNG_BYTES: usize = 32 * 1024 * 1024;
const MAX_VIDEO_FRAME_PIXELS: u64 = 50_000_000;
const SUBTITLE_EXTENSIONS: &[&str] = &["vtt", "srt"];
const MAX_SUBTITLE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SUBTITLE_CUES: usize = 10_000;

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
    pub jpeg_quality: Option<u8>,
    pub brightness: i16,
    pub contrast: i16,
    pub saturation: u16,
    pub orientation_normalized: bool,
    pub metadata_removed: bool,
    pub source_unchanged: bool,
    pub target_reopened: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoFrameSavedReport {
    pub status: String,
    pub target_path: String,
    pub output_digest: String,
    pub output_bytes: u64,
    pub width: u32,
    pub height: u32,
    pub media_time: f64,
    pub source_identity_unchanged: bool,
    pub target_reopened: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSubtitleTrack {
    pub id: String,
    pub label: String,
    pub format: String,
    pub cue_count: usize,
    pub source_bytes: u64,
    pub webvtt: String,
    pub cues: Vec<VideoSubtitleCue>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoSubtitleCue {
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
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
pub async fn discover_video_subtitles(
    library_root: String,
    path: String,
) -> Result<Vec<VideoSubtitleTrack>, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let video_path = guard.resolve_existing_file(path, VIDEO_EXTENSIONS)?;
    discover_video_subtitles_for_path(&guard, &video_path)
}

fn discover_video_subtitles_for_path(
    guard: &WorkspaceGuard,
    video_path: &Path,
) -> Result<Vec<VideoSubtitleTrack>, String> {
    let mut tracks = Vec::new();
    for extension in SUBTITLE_EXTENSIONS {
        let Some(candidate) = find_matching_sidecar(video_path, extension)? else {
            continue;
        };
        let sidecar = guard.resolve_existing_file(candidate, SUBTITLE_EXTENSIONS)?;
        let metadata = sidecar
            .metadata()
            .map_err(|error| format!("读取字幕元数据失败: {error}"))?;
        if metadata.len() == 0 {
            return Err(format!(
                "{}.{} 字幕为空",
                video_stem(video_path)?,
                extension
            ));
        }
        if metadata.len() > MAX_SUBTITLE_BYTES {
            return Err(format!(
                "{}.{} 超过 2 MiB 字幕读取上限",
                video_stem(video_path)?,
                extension
            ));
        }
        let snapshot = read_text_snapshot(&sidecar)
            .map_err(|error| format!("读取 .{} 字幕失败: {}", extension, error.message))?;
        let (webvtt, cues) = match *extension {
            "vtt" => normalize_webvtt(&snapshot.content)?,
            "srt" => convert_srt_to_webvtt(&snapshot.content)?,
            _ => unreachable!(),
        };
        let cue_count = cues.len();
        tracks.push(VideoSubtitleTrack {
            id: extension.to_string(),
            label: if *extension == "vtt" {
                "WebVTT 字幕".into()
            } else {
                "SRT 字幕".into()
            },
            format: extension.to_ascii_uppercase(),
            cue_count,
            source_bytes: metadata.len(),
            webvtt,
            cues,
        });
    }
    Ok(tracks)
}

fn find_matching_sidecar(video_path: &Path, extension: &str) -> Result<Option<PathBuf>, String> {
    let stem = video_path
        .file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "视频文件名无效".to_string())?;
    let parent = video_path
        .parent()
        .ok_or_else(|| "视频路径缺少父目录".to_string())?;
    let entries = fs::read_dir(parent).map_err(|error| format!("读取视频目录失败: {error}"))?;
    for entry in entries {
        let path = entry
            .map_err(|error| format!("读取视频目录项失败: {error}"))?
            .path();
        let same_stem = path
            .file_stem()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(stem));
        let same_extension = path
            .extension()
            .and_then(|value| value.to_str())
            .is_some_and(|value| value.eq_ignore_ascii_case(extension));
        if same_stem && same_extension && path.is_file() {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

fn video_stem(path: &Path) -> Result<&str, String> {
    path.file_stem()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "视频文件名无效".into())
}

fn normalize_webvtt(source: &str) -> Result<(String, Vec<VideoSubtitleCue>), String> {
    let normalized = source
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let first_line = normalized.lines().next().unwrap_or_default().trim();
    if !first_line.starts_with("WEBVTT") {
        return Err("VTT 字幕缺少 WEBVTT 文件头".into());
    }
    let lines: Vec<&str> = normalized.lines().collect();
    let mut cues = Vec::new();
    let mut index = 1usize;
    while index < lines.len() {
        if !lines[index].contains("-->") {
            index += 1;
            continue;
        }
        let (_, start_time, end_time) = normalized_timing_line(lines[index], false)?;
        index += 1;
        let text_start = index;
        while index < lines.len() && !lines[index].trim().is_empty() {
            index += 1;
        }
        if text_start == index {
            return Err("VTT 字幕片段缺少文字".into());
        }
        cues.push(VideoSubtitleCue {
            start_time,
            end_time,
            text: lines[text_start..index].join("\n"),
        });
        validate_cue_count(cues.len())?;
    }
    validate_cue_count(cues.len())?;
    Ok((format!("{}\n", normalized.trim_end()), cues))
}

fn convert_srt_to_webvtt(source: &str) -> Result<(String, Vec<VideoSubtitleCue>), String> {
    let normalized = source
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let mut output = String::from("WEBVTT\n\n");
    let mut cues = Vec::new();
    for block in normalized.split("\n\n") {
        let lines: Vec<&str> = block.lines().map(str::trim_end).collect();
        if lines.iter().all(|line| line.trim().is_empty()) {
            continue;
        }
        let timing_index = if lines
            .first()
            .is_some_and(|line| line.trim().parse::<u64>().is_ok())
        {
            1
        } else {
            0
        };
        let timing = lines
            .get(timing_index)
            .ok_or_else(|| "SRT 字幕片段缺少时间轴".to_string())?;
        let (normalized_timing, start_time, end_time) = normalized_timing_line(timing, true)?;
        output.push_str(&normalized_timing);
        output.push('\n');
        let text_lines = &lines[(timing_index + 1)..];
        if text_lines.is_empty() || text_lines.iter().all(|line| line.trim().is_empty()) {
            return Err("SRT 字幕片段缺少文字".into());
        }
        let text = text_lines.join("\n");
        output.push_str(&text);
        output.push_str("\n\n");
        cues.push(VideoSubtitleCue {
            start_time,
            end_time,
            text,
        });
        validate_cue_count(cues.len())?;
    }
    validate_cue_count(cues.len())?;
    Ok((output, cues))
}

fn normalized_timing_line(line: &str, allow_comma: bool) -> Result<(String, f64, f64), String> {
    let mut parts = line.splitn(2, "-->");
    let start = parts.next().unwrap_or_default().trim();
    let remainder = parts
        .next()
        .ok_or_else(|| "字幕时间轴缺少 --> 分隔符".to_string())?
        .trim();
    let mut end_and_settings = remainder.splitn(2, char::is_whitespace);
    let end = end_and_settings.next().unwrap_or_default();
    let start_time = parse_subtitle_timestamp(start, allow_comma)?;
    let end_time = parse_subtitle_timestamp(end, allow_comma)?;
    if end_time <= start_time {
        return Err("字幕片段结束时间必须晚于开始时间".into());
    }
    let settings = end_and_settings.next().unwrap_or_default().trim();
    Ok((
        format!(
            "{} --> {}{}",
            start.replace(',', "."),
            end.replace(',', "."),
            if settings.is_empty() {
                String::new()
            } else {
                format!(" {settings}")
            }
        ),
        start_time,
        end_time,
    ))
}

fn parse_subtitle_timestamp(value: &str, allow_comma: bool) -> Result<f64, String> {
    let separator = if value.contains('.') {
        '.'
    } else if allow_comma && value.contains(',') {
        ','
    } else {
        return Err(format!("字幕时间戳格式无效: {value}"));
    };
    let components: Vec<&str> = value.split(separator).collect();
    if components.len() != 2
        || components[1].len() != 3
        || !components[1].bytes().all(|b| b.is_ascii_digit())
    {
        return Err(format!("字幕时间戳格式无效: {value}"));
    }
    let clock: Vec<&str> = components[0].split(':').collect();
    if !(2..=3).contains(&clock.len())
        || clock
            .iter()
            .any(|part| part.len() != 2 || !part.bytes().all(|b| b.is_ascii_digit()))
    {
        return Err(format!("字幕时间戳格式无效: {value}"));
    }
    let minute = clock[clock.len() - 2].parse::<u8>().unwrap_or(60);
    let second = clock[clock.len() - 1].parse::<u8>().unwrap_or(60);
    if minute > 59 || second > 59 {
        return Err(format!("字幕时间戳超出有效范围: {value}"));
    }
    let hours = if clock.len() == 3 {
        clock[0].parse::<u64>().unwrap_or_default()
    } else {
        0
    };
    let milliseconds = components[1].parse::<u64>().unwrap_or_default();
    Ok((hours * 3600 + minute as u64 * 60 + second as u64) as f64 + milliseconds as f64 / 1000.0)
}

fn validate_cue_count(cue_count: usize) -> Result<(), String> {
    if cue_count == 0 {
        Err("字幕没有可播放的时间片段".into())
    } else if cue_count > MAX_SUBTITLE_CUES {
        Err("字幕超过 10000 个时间片段安全上限".into())
    } else {
        Ok(())
    }
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

#[tauri::command]
pub async fn save_video_frame_png(
    library_root: String,
    source_path: String,
    target_path: String,
    expected_source_size: u64,
    expected_source_modified: u64,
    png_base64: String,
    expected_width: u32,
    expected_height: u32,
    media_time: f64,
) -> Result<VideoFrameSavedReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(source_path, VIDEO_EXTENSIONS)?;
    let target_path = guard.resolve_file_for_write(target_path, &["png"])?;
    save_video_frame_png_to_path(
        &source_path,
        &target_path,
        expected_source_size,
        expected_source_modified,
        &png_base64,
        expected_width,
        expected_height,
        media_time,
    )
}

fn modified_seconds(metadata: &fs::Metadata) -> u64 {
    metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or_default()
}

#[allow(clippy::too_many_arguments)]
fn save_video_frame_png_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_source_size: u64,
    expected_source_modified: u64,
    png_base64: &str,
    expected_width: u32,
    expected_height: u32,
    media_time: f64,
) -> Result<VideoFrameSavedReport, String> {
    if target_path.exists() {
        return Err("目标文件已存在；视频截图不会覆盖现有文件".into());
    }
    if expected_width == 0
        || expected_height == 0
        || expected_width as u64 * expected_height as u64 > MAX_VIDEO_FRAME_PIXELS
    {
        return Err("视频截图尺寸无效或超过 5000 万像素安全上限".into());
    }
    if !media_time.is_finite() || media_time < 0.0 {
        return Err("视频截图时间戳无效".into());
    }
    if png_base64.len() > MAX_VIDEO_FRAME_PNG_BYTES * 4 / 3 + 8 {
        return Err("视频截图编码超过 32 MiB 安全上限".into());
    }
    let source_before = source_path
        .metadata()
        .map_err(|error| format!("读取源视频元数据失败: {error}"))?;
    if source_before.len() != expected_source_size
        || modified_seconds(&source_before) != expected_source_modified
    {
        return Err("源视频已被外部修改，请重新打开后再截图".into());
    }
    let png = STANDARD
        .decode(png_base64.trim().as_bytes())
        .map_err(|_| "视频截图不是有效的 Base64 PNG 数据".to_string())?;
    if png.is_empty() || png.len() > MAX_VIDEO_FRAME_PNG_BYTES {
        return Err("视频截图为空或超过 32 MiB 安全上限".into());
    }
    let image = image::load_from_memory_with_format(&png, image::ImageFormat::Png)
        .map_err(|error| format!("视频截图 PNG 结构无效: {error}"))?;
    if image.dimensions() != (expected_width, expected_height) {
        return Err("视频截图实际尺寸与当前视频帧不一致".into());
    }
    let output_digest = format!("{:x}", Sha256::digest(&png));
    write_new_bytes(target_path, &png)?;
    let verification = (|| -> Result<(), String> {
        let saved =
            fs::read(target_path).map_err(|error| format!("截图已创建，但无法复读: {error}"))?;
        if saved != png || format!("{:x}", Sha256::digest(&saved)) != output_digest {
            return Err("截图落盘字节与 Canvas 输出不一致".into());
        }
        let reopened = image::load_from_memory_with_format(&saved, image::ImageFormat::Png)
            .map_err(|error| format!("截图 PNG 无法重新解码: {error}"))?;
        if reopened.dimensions() != (expected_width, expected_height) {
            return Err("截图复读尺寸与当前视频帧不一致".into());
        }
        let source_after = source_path
            .metadata()
            .map_err(|error| format!("截图后复核源视频失败: {error}"))?;
        if source_after.len() != expected_source_size
            || modified_seconds(&source_after) != expected_source_modified
        {
            return Err("源视频在截图另存期间发生变化".into());
        }
        Ok(())
    })();
    if let Err(error) = verification {
        remove_created_image_if_exact(target_path, &png);
        return Err(error);
    }
    Ok(VideoFrameSavedReport {
        status: "saved_verified".into(),
        target_path: target_path.to_string_lossy().to_string(),
        output_digest,
        output_bytes: png.len() as u64,
        width: expected_width,
        height: expected_height,
        media_time,
        source_identity_unchanged: true,
        target_reopened: true,
    })
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
        jpeg_quality: transformed.jpeg_quality,
        brightness: transformed.brightness,
        contrast: transformed.contrast,
        saturation: transformed.saturation,
        orientation_normalized: transformed.orientation_normalized,
        metadata_removed: transformed.metadata_removed,
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
    let modified = modified_seconds(&metadata);
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
    use super::{
        convert_srt_to_webvtt, discover_video_subtitles_for_path, mime_type, modified_seconds,
        normalize_webvtt, playback_support, save_image_transform_copy_to_path,
        save_video_frame_png_to_path,
    };
    use crate::formats::raster_image::RasterImageTransform;
    use crate::services::workspace_guard::WorkspaceGuard;
    use base64::{engine::general_purpose::STANDARD, Engine as _};
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
                flip_vertical: true,
                width: Some(8),
                height: Some(12),
                ..RasterImageTransform::default()
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
                ..RasterImageTransform::default()
            },
        )
        .unwrap_err()
        .contains("不会覆盖"));
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn converts_bounded_srt_and_validates_webvtt() {
        let srt = "1\r\n00:00:00,200 --> 00:00:01,200\r\n第一段\r\n\r\n2\r\n00:00:01,300 --> 00:00:02,200\r\nSecond cue\r\n";
        let (converted, srt_cues) = convert_srt_to_webvtt(srt).unwrap();
        assert_eq!(srt_cues.len(), 2);
        assert_eq!(srt_cues[0].start_time, 0.2);
        assert_eq!(srt_cues[1].text, "Second cue");
        assert!(converted.starts_with("WEBVTT\n\n00:00:00.200 --> 00:00:01.200"));
        assert!(converted.contains("第一段"));

        let (normalized, vtt_cues) =
            normalize_webvtt("WEBVTT\n\n00:00.200 --> 00:01.200\nVTT cue\n").unwrap();
        assert_eq!(vtt_cues.len(), 1);
        assert_eq!(vtt_cues[0].text, "VTT cue");
        assert!(normalized.ends_with('\n'));
        assert!(normalize_webvtt("00:00.000 --> 00:01.000\nmissing header").is_err());
        assert!(convert_srt_to_webvtt("1\ninvalid\ntext\n").is_err());
    }

    #[test]
    fn discovers_only_same_stem_library_sidecars_without_writing_sources() {
        let base = std::env::temp_dir().join(format!(
            "longedit-video-subtitle-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let video = base.join("lesson.webm");
        let vtt = base.join("lesson.vtt");
        let srt = base.join("lesson.srt");
        let unrelated = base.join("other.vtt");
        let video_bytes = b"real-video-placeholder";
        let vtt_source = "WEBVTT\n\n00:00.200 --> 00:01.200\nVTT cue\n";
        let srt_source = "1\n00:00:01,300 --> 00:00:02,200\nSRT cue\n";
        fs::write(&video, video_bytes).unwrap();
        fs::write(&vtt, vtt_source).unwrap();
        fs::write(&srt, srt_source).unwrap();
        fs::write(&unrelated, "WEBVTT\n\n00:00.000 --> 00:01.000\nOther\n").unwrap();

        let guard = WorkspaceGuard::new(&base).unwrap();
        let tracks = discover_video_subtitles_for_path(&guard, &video).unwrap();
        assert_eq!(tracks.len(), 2);
        assert_eq!(tracks[0].id, "vtt");
        assert_eq!(tracks[1].id, "srt");
        assert_eq!(tracks.iter().map(|track| track.cue_count).sum::<usize>(), 2);
        assert_eq!(fs::read(&video).unwrap(), video_bytes);
        assert_eq!(fs::read_to_string(&vtt).unwrap(), vtt_source);
        assert_eq!(fs::read_to_string(&srt).unwrap(), srt_source);
        assert_eq!(
            fs::read_to_string(&unrelated).unwrap().lines().last(),
            Some("Other")
        );
        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn saves_verified_video_frame_png_without_touching_source() {
        let base = std::env::temp_dir().join(format!(
            "longedit-video-frame-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let source_path = base.join("source.webm");
        let target_path = base.join("frame.png");
        let source = b"bounded-real-video-placeholder";
        fs::write(&source_path, source).unwrap();
        let source_metadata = source_path.metadata().unwrap();
        let frame =
            DynamicImage::ImageRgba8(ImageBuffer::from_pixel(4, 3, Rgba([12, 140, 220, 255])));
        let mut png = Vec::new();
        frame
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .unwrap();
        let report = save_video_frame_png_to_path(
            &source_path,
            &target_path,
            source_metadata.len(),
            modified_seconds(&source_metadata),
            &STANDARD.encode(&png),
            4,
            3,
            1.25,
        )
        .unwrap();
        assert_eq!(report.status, "saved_verified");
        assert_eq!((report.width, report.height), (4, 3));
        assert_eq!(report.media_time, 1.25);
        assert_eq!(fs::read(&source_path).unwrap(), source);
        assert_eq!(fs::read(&target_path).unwrap(), png);
        assert!(save_video_frame_png_to_path(
            &source_path,
            &target_path,
            source_metadata.len(),
            modified_seconds(&source_metadata),
            &STANDARD.encode(&png),
            4,
            3,
            1.25,
        )
        .unwrap_err()
        .contains("不会覆盖"));
        fs::remove_dir_all(base).unwrap();
    }
}
