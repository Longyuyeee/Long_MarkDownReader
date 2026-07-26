use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;
use zip::ZipArchive;

const MAX_DOCX_MEDIA_PREVIEWS: usize = 32;
const MAX_DOCX_MEDIA_BYTES: u64 = 4 * 1024 * 1024;
const MAX_DOCX_MEDIA_TOTAL_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxMediaPreview {
    pub part_name: String,
    pub mime_type: String,
    pub size: u64,
    pub data_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxReadReport {
    pub path: String,
    pub size: u64,
    pub modified: u64,
    pub signature: String,
    pub read_only: bool,
    pub model: DocxDocumentModel,
    pub media: Vec<DocxMediaPreview>,
    pub media_warnings: Vec<String>,
}

fn file_signature(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{}:{modified}", metadata.len())
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
    source: &[u8],
    model: &DocxDocumentModel,
) -> Result<(Vec<DocxMediaPreview>, Vec<String>), String> {
    let mut archive = ZipArchive::new(Cursor::new(source))
        .map_err(|error| format!("DOCX 媒体读取失败: {error}"))?;
    let mut requested = Vec::new();
    let mut seen = HashSet::new();
    for part in model
        .blocks
        .iter()
        .flat_map(|block| block.image_parts.iter())
    {
        if seen.insert(part.clone()) {
            requested.push(part.clone());
        }
    }
    let mut previews = Vec::new();
    let mut warnings = Vec::new();
    let mut total = 0_u64;
    for part_name in requested {
        if previews.len() >= MAX_DOCX_MEDIA_PREVIEWS {
            warnings.push("图片预览超过 32 个；其余对象保留占位".into());
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
        if file.enclosed_name().is_none() || file.size() > MAX_DOCX_MEDIA_BYTES {
            warnings.push(format!(
                "图片 {part_name} 超过 4 MiB 或路径不安全，保留占位"
            ));
            continue;
        }
        if total.saturating_add(file.size()) > MAX_DOCX_MEDIA_TOTAL_BYTES {
            warnings.push("图片预览总量超过 12 MiB；其余对象保留占位".into());
            break;
        }
        let mut bytes = Vec::with_capacity(file.size() as usize);
        file.read_to_end(&mut bytes)
            .map_err(|error| format!("读取 DOCX 图片 {part_name} 失败: {error}"))?;
        if !valid_media_signature(&bytes, mime) {
            warnings.push(format!(
                "图片 {part_name} 的内容签名与扩展名不一致，保留占位"
            ));
            continue;
        }
        total += bytes.len() as u64;
        previews.push(DocxMediaPreview {
            part_name,
            mime_type: mime.into(),
            size: bytes.len() as u64,
            data_url: format!(
                "data:{mime};base64,{}",
                general_purpose::STANDARD.encode(&bytes)
            ),
        });
    }
    Ok((previews, warnings))
}

fn read_docx_path(path: &Path) -> Result<DocxReadReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 读取上限".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    let model = parse_docx(&source)?;
    let (media, media_warnings) = extract_media_previews(&source, &model)?;
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_millis() as u64)
        .unwrap_or_default();
    Ok(DocxReadReport {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified,
        signature: file_signature(&metadata),
        read_only: true,
        model,
        media,
        media_warnings,
    })
}

#[tauri::command]
pub async fn read_docx_document(
    library_root: String,
    path: String,
) -> Result<DocxReadReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || read_docx_path(&document))
        .await
        .map_err(|error| format!("DOCX 读取任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_only_supported_media_signatures() {
        assert!(valid_media_signature(b"\x89PNG\r\n\x1a\nbody", "image/png"));
        assert!(valid_media_signature(
            &[0xff, 0xd8, 0xff, 0xdb],
            "image/jpeg"
        ));
        assert!(valid_media_signature(b"GIF89abody", "image/gif"));
        assert!(valid_media_signature(b"RIFF1234WEBPbody", "image/webp"));
        assert!(valid_media_signature(b"BMbody", "image/bmp"));
        assert!(!valid_media_signature(b"<svg/>", "image/png"));
        assert!(!valid_media_signature(
            b"\x89PNG\r\n\x1a\nbody",
            "image/svg+xml"
        ));
    }
}
