use crate::formats::pptx::{parse_pptx, PptxPresentationModel, MAX_PPTX_FILE_BYTES};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;
use zip::ZipArchive;

const MAX_PPTX_MEDIA_PREVIEWS: usize = 48;
const MAX_PPTX_MEDIA_BYTES: u64 = 6 * 1024 * 1024;
const MAX_PPTX_MEDIA_TOTAL_BYTES: u64 = 24 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxMediaPreview {
    pub part_name: String,
    pub mime_type: String,
    pub size: u64,
    pub data_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxReadReport {
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub read_only: bool,
    pub model: PptxPresentationModel,
    pub media: Vec<PptxMediaPreview>,
    pub media_warnings: Vec<String>,
}

fn media_mime(part_name: &str) -> Option<&'static str> {
    match part_name.rsplit('.').next()?.to_ascii_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        _ => None,
    }
}

fn valid_media_signature(bytes: &[u8], mime: &str) -> bool {
    match mime {
        "image/png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "image/jpeg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "image/gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "image/webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        "image/bmp" => bytes.starts_with(b"BM"),
        _ => false,
    }
}

fn extract_media_previews(
    bytes: &[u8],
    model: &PptxPresentationModel,
) -> Result<(Vec<PptxMediaPreview>, Vec<String>), String> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| format!("PPTX 媒体 ZIP 损坏: {error}"))?;
    let mut requested = Vec::new();
    let mut seen = HashSet::new();
    for part in model
        .slides
        .iter()
        .flat_map(|slide| slide.objects.iter())
        .filter_map(|object| object.media_part.as_ref())
    {
        if seen.insert(part.clone()) {
            requested.push(part.clone());
        }
    }
    let mut previews = Vec::new();
    let mut warnings = Vec::new();
    let mut total = 0_u64;
    for part_name in requested {
        if previews.len() >= MAX_PPTX_MEDIA_PREVIEWS {
            warnings.push("图片预览超过 48 个；其余图片保留占位".into());
            break;
        }
        let Some(mime) = media_mime(&part_name) else {
            warnings.push(format!("图片 {part_name} 的格式不在安全预览白名单"));
            continue;
        };
        let mut file = match archive.by_name(&part_name) {
            Ok(file) => file,
            Err(error) => {
                warnings.push(format!("图片 {part_name} 无法读取: {error}"));
                continue;
            }
        };
        if file.enclosed_name().is_none() || file.size() > MAX_PPTX_MEDIA_BYTES {
            warnings.push(format!(
                "图片 {part_name} 超过 6 MiB 或路径不安全，保留占位"
            ));
            continue;
        }
        if total.saturating_add(file.size()) > MAX_PPTX_MEDIA_TOTAL_BYTES {
            warnings.push("图片预览总量超过 24 MiB；其余图片保留占位".into());
            break;
        }
        let mut image = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut image)
            .map_err(|error| format!("读取 PPTX 图片 {part_name} 失败: {error}"))?;
        if !valid_media_signature(&image, mime) {
            warnings.push(format!("图片 {part_name} 的内容签名不匹配，保留占位"));
            continue;
        }
        total += image.len() as u64;
        previews.push(PptxMediaPreview {
            part_name,
            mime_type: mime.into(),
            size: image.len() as u64,
            data_url: format!(
                "data:{mime};base64,{}",
                general_purpose::STANDARD.encode(&image)
            ),
        });
    }
    Ok((previews, warnings))
}

fn read_pptx_path(path: &Path) -> Result<PptxReadReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 PPTX 元数据失败: {error}"))?;
    if metadata.len() > MAX_PPTX_FILE_BYTES {
        return Err("PPTX 文件超过 96 MiB 读取上限".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取 PPTX 失败: {error}"))?;
    let model = parse_pptx(&bytes)?;
    let (media, media_warnings) = extract_media_previews(&bytes, &model)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default();
    Ok(PptxReadReport {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified,
        read_only: true,
        model,
        media,
        media_warnings,
    })
}

#[tauri::command]
pub async fn read_pptx_presentation(
    path: String,
    guard: tauri::State<'_, WorkspaceGuard>,
) -> Result<PptxReadReport, String> {
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || read_pptx_path(&presentation))
        .await
        .map_err(|error| format!("PPTX 读取任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn media_signature_allowlist_rejects_mismatches() {
        assert!(valid_media_signature(b"\x89PNG\r\n\x1a\nrest", "image/png"));
        assert!(!valid_media_signature(b"not png", "image/png"));
        assert_eq!(media_mime("ppt/media/image1.svg"), None);
    }
}
