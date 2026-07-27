use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use crate::formats::docx_patch::{
    build_docx_document_patch_isolated, build_docx_text_patch_isolated, docx_document_part_digest,
    inspect_docx_editable_text_targets, DocxEditableTextTarget, DocxIsolatedPatchReport,
};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::{self, OpenOptions};
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
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
    pub document_part_digest: String,
    pub editable_text_targets: Vec<DocxEditableTextTarget>,
    pub read_only: bool,
    pub model: DocxDocumentModel,
    pub media: Vec<DocxMediaPreview>,
    pub media_warnings: Vec<String>,
}

struct TemporaryDocxCopy {
    path: PathBuf,
}

impl TemporaryDocxCopy {
    fn create(bytes: &[u8]) -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "longedit-docx-c2a-{}-{}.docx",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("创建 DOCX 临时副本时间戳失败: {error}"))?
                .as_nanos()
        ));
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)
            .map_err(|error| format!("创建 DOCX 临时副本失败: {error}"))?;
        file.write_all(bytes)
            .map_err(|error| format!("写入 DOCX 临时副本失败: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("同步 DOCX 临时副本失败: {error}"))?;
        Ok(Self { path })
    }
}

impl Drop for TemporaryDocxCopy {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
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
    let document_part_digest = docx_document_part_digest(&source)?;
    let editable_text_targets = inspect_docx_editable_text_targets(&source, &model)?;
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
        document_part_digest,
        editable_text_targets,
        read_only: true,
        model,
        media,
        media_warnings,
    })
}

fn preview_docx_isolated_path<F>(
    path: &Path,
    expected_signature: &str,
    build: F,
) -> Result<DocxIsolatedPatchReport, String>
where
    F: FnOnce(&[u8]) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String>,
{
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 隔离补丁上限".into());
    }
    let actual_signature = file_signature(&metadata);
    if actual_signature != expected_signature {
        return Err("DOCX 已被外部修改，请重新打开后再验证补丁".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (mut report, output) = build(&source)?;

    let temporary = TemporaryDocxCopy::create(&output)?;
    let reopened =
        fs::read(&temporary.path).map_err(|error| format!("复读 DOCX 临时副本失败: {error}"))?;
    if reopened != output || format!("{:x}", Sha256::digest(&reopened)) != report.output_digest {
        return Err("DOCX 临时副本复读字节与隔离输出不一致".into());
    }
    parse_docx(&reopened).map_err(|error| format!("DOCX 临时副本结构重开失败: {error}"))?;
    report.temporary_copy_reopen_verified = true;

    let source_after = fs::read(path).map_err(|error| format!("复核源 DOCX 失败: {error}"))?;
    let metadata_after = path
        .metadata()
        .map_err(|error| format!("复核源 DOCX 元数据失败: {error}"))?;
    report.source_unchanged = source_after == source
        && format!("{:x}", Sha256::digest(&source_after)) == source_digest
        && file_signature(&metadata_after) == actual_signature;
    if !report.source_unchanged {
        return Err("隔离补丁验证期间源 DOCX 发生变化，请重新打开".into());
    }
    Ok(report)
}

fn preview_docx_patch_path(
    path: &Path,
    expected_signature: &str,
    expected_part_digest: &str,
    replacement_xml: &str,
) -> Result<DocxIsolatedPatchReport, String> {
    preview_docx_isolated_path(path, expected_signature, |source| {
        build_docx_document_patch_isolated(source, expected_part_digest, replacement_xml)
    })
}

fn preview_docx_text_patch_path(
    path: &Path,
    expected_signature: &str,
    target_id: &str,
    expected_text_digest: &str,
    replacement_text: &str,
) -> Result<DocxIsolatedPatchReport, String> {
    preview_docx_isolated_path(path, expected_signature, |source| {
        build_docx_text_patch_isolated(source, target_id, expected_text_digest, replacement_text)
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

#[tauri::command]
pub async fn preview_docx_package_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    expected_part_digest: String,
    replacement_xml: String,
) -> Result<DocxIsolatedPatchReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_docx_patch_path(
            &document,
            &expected_signature,
            &expected_part_digest,
            &replacement_xml,
        )
    })
    .await
    .map_err(|error| format!("DOCX 隔离补丁任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_docx_text_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_text_digest: String,
    replacement_text: String,
) -> Result<DocxIsolatedPatchReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_docx_text_patch_path(
            &document,
            &expected_signature,
            &target_id,
            &expected_text_digest,
            &replacement_text,
        )
    })
    .await
    .map_err(|error| format!("DOCX C2B 文本补丁任务失败: {error}"))?
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

    #[test]
    fn previews_c2a_patch_through_temporary_copy_without_changing_source() {
        let base = std::env::temp_dir().join(format!(
            "longedit-docx-command-c2a-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let path = base.join("source.docx");
        let source =
            include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx").to_vec();
        fs::write(&path, &source).unwrap();

        let signature = file_signature(&path.metadata().unwrap());
        let part_digest = docx_document_part_digest(&source).unwrap();
        let mut archive = ZipArchive::new(Cursor::new(source.as_slice())).unwrap();
        let mut document_xml = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document_xml)
            .unwrap();
        assert_eq!(
            document_xml.matches("Before explicit page break.").count(),
            1
        );
        let replacement = document_xml.replacen(
            "Before explicit page break.",
            "Before isolated page break.",
            1,
        );

        let report =
            preview_docx_patch_path(&path, &signature, &part_digest, &replacement).unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.changed_parts, ["word/document.xml"]);
        assert!(report.unchanged_parts_verified);
        assert!(report.structural_reparse_verified);
        assert!(report.temporary_copy_reopen_verified);
        assert!(report.source_unchanged);
        assert_eq!(fs::read(&path).unwrap(), source);
        assert!(
            preview_docx_patch_path(&path, "stale", &part_digest, &replacement)
                .unwrap_err()
                .contains("外部修改")
        );

        let model = parse_docx(&source).unwrap();
        let targets = inspect_docx_editable_text_targets(&source, &model).unwrap();
        let target = targets
            .iter()
            .find(|target| target.text == "Microsoft Word Producer Fixture")
            .unwrap();
        let text_report = preview_docx_text_patch_path(
            &path,
            &signature,
            &target.id,
            &target.expected_text_digest,
            "Microsoft Word Isolated Text Fixture",
        )
        .unwrap();
        assert_eq!(
            text_report.engine,
            "LongEdit C2B isolated paragraph text patch"
        );
        assert!(text_report.semantic_reparse_verified);
        assert!(text_report.temporary_copy_reopen_verified);
        assert!(text_report.source_unchanged);
        assert_eq!(fs::read(&path).unwrap(), source);

        let table_target = targets
            .iter()
            .find(|target| target.kind == "table-cell" && target.text == "Available")
            .unwrap();
        let table_report = preview_docx_text_patch_path(
            &path,
            &signature,
            &table_target.id,
            &table_target.expected_text_digest,
            "Audited",
        )
        .unwrap();
        assert_eq!(
            table_report.engine,
            "LongEdit C2C isolated structured text patch"
        );
        assert_eq!(table_report.semantic_kind.as_deref(), Some("table-cell"));
        assert!(table_report.semantic_reparse_verified);
        assert!(table_report.temporary_copy_reopen_verified);
        assert!(table_report.source_unchanged);
        assert_eq!(fs::read(&path).unwrap(), source);

        fs::remove_dir_all(base).unwrap();
    }
}
