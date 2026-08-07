use crate::formats::odf::MAX_ODF_FILE_BYTES;
use crate::formats::odt::{parse_odt, OdtDocumentModel};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::{Cursor, Read};
use std::path::Path;
use std::time::UNIX_EPOCH;
use zip::ZipArchive;

const MAX_ODT_PREVIEW_IMAGES: usize = 32;
const MAX_ODT_PREVIEW_IMAGE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_ODT_PREVIEW_TOTAL_BYTES: u64 = 12 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdtMediaPreview {
    pub part_name: String,
    pub media_type: String,
    pub data_url: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OdtReadReport {
    pub path: String,
    pub size: u64,
    pub modified: Option<u64>,
    pub signature: String,
    pub read_only: bool,
    pub source_preserved: bool,
    pub model: OdtDocumentModel,
    pub media: Vec<OdtMediaPreview>,
    pub media_warnings: Vec<String>,
}

fn image_type(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else {
        None
    }
}

fn extract_media_previews(
    source: &[u8],
    model: &OdtDocumentModel,
) -> Result<(Vec<OdtMediaPreview>, Vec<String>), String> {
    let mut archive =
        ZipArchive::new(Cursor::new(source)).map_err(|error| format!("打开 ODT 失败: {error}"))?;
    let mut previews = Vec::new();
    let mut warnings = Vec::new();
    let mut total = 0_u64;
    let mut parts = model
        .blocks
        .iter()
        .flat_map(|block| block.image_parts.iter())
        .collect::<Vec<_>>();
    parts.sort();
    parts.dedup();
    for part in parts {
        if previews.len() >= MAX_ODT_PREVIEW_IMAGES {
            warnings.push("ODT 图片预览数量超过 32 项，剩余图片保持占位".into());
            break;
        }
        let Ok(mut entry) = archive.by_name(part) else {
            warnings.push(format!("ODT 图片部件缺失：{part}"));
            continue;
        };
        if entry.size() > MAX_ODT_PREVIEW_IMAGE_BYTES
            || total.saturating_add(entry.size()) > MAX_ODT_PREVIEW_TOTAL_BYTES
        {
            warnings.push(format!("ODT 图片超过预览预算：{part}"));
            continue;
        }
        let mut bytes = Vec::with_capacity(entry.size() as usize);
        entry
            .read_to_end(&mut bytes)
            .map_err(|error| format!("读取 ODT 图片 {part} 失败: {error}"))?;
        let Some(media_type) = image_type(&bytes) else {
            warnings.push(format!("ODT 图片签名不受支持：{part}"));
            continue;
        };
        total += bytes.len() as u64;
        previews.push(OdtMediaPreview {
            part_name: part.clone(),
            media_type: media_type.into(),
            data_url: format!(
                "data:{media_type};base64,{}",
                general_purpose::STANDARD.encode(bytes)
            ),
        });
    }
    Ok((previews, warnings))
}

fn read_odt_path(path: &Path) -> Result<OdtReadReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 ODT 元数据失败: {error}"))?;
    if metadata.len() > MAX_ODF_FILE_BYTES {
        return Err("ODT 文件超过 64 MiB 读取上限".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 ODT 失败: {error}"))?;
    let model = parse_odt(&source)?;
    let (media, media_warnings) = extract_media_previews(&source, &model)?;
    let after = fs::read(path).map_err(|error| format!("复核 ODT 源文件失败: {error}"))?;
    let source_preserved = source == after;
    if !source_preserved {
        return Err("ODT 文件在只读预览期间发生变化".into());
    }
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs());
    Ok(OdtReadReport {
        path: path.to_string_lossy().into_owned(),
        size: metadata.len(),
        modified,
        signature: format!("{:x}", Sha256::digest(&source)),
        read_only: true,
        source_preserved,
        model,
        media,
        media_warnings,
    })
}

#[tauri::command]
pub async fn read_odt_document(
    library_root: String,
    path: String,
) -> Result<OdtReadReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["odt"])?;
    tauri::async_runtime::spawn_blocking(move || read_odt_path(&document))
        .await
        .map_err(|error| format!("ODT 读取任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn fixture(name: &str) -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("fixtures")
            .join("odt")
            .join("producers")
            .join(name)
    }

    #[test]
    fn reads_verified_producer_sources_without_mutation() {
        for name in ["microsoft-word-16.odt", "libreoffice-writer.odt"] {
            let path = fixture(name);
            let before = fs::read(&path).unwrap();
            let report = read_odt_path(&path).unwrap();
            assert!(report.read_only);
            assert!(report.source_preserved);
            assert_eq!(before, fs::read(path).unwrap());
        }
    }
}
