use crate::formats::docx::{parse_docx, DocxDocumentModel, MAX_DOCX_FILE_BYTES};
use crate::formats::docx_patch::{
    build_docx_document_patch_isolated, build_docx_image_alt_text_patch_isolated,
    build_docx_style_patch_isolated, build_docx_text_patch_isolated, docx_document_part_digest,
    inspect_docx_editable_image_targets, inspect_docx_editable_style_targets,
    inspect_docx_editable_text_targets, DocxEditableImageTarget, DocxEditableStyleTarget,
    DocxEditableTextTarget, DocxIsolatedPatchReport,
};
use crate::services::reliable_write::{write_bytes, write_new_bytes};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
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
    pub editable_style_targets: Vec<DocxEditableStyleTarget>,
    pub editable_image_targets: Vec<DocxEditableImageTarget>,
    pub read_only: bool,
    pub model: DocxDocumentModel,
    pub media: Vec<DocxMediaPreview>,
    pub media_warnings: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxSaveReadinessReport {
    pub status: String,
    pub source_signature: String,
    pub source_signature_current: bool,
    pub source_digest: String,
    pub isolated_output_digest: String,
    pub target_path: String,
    pub target_exists: bool,
    pub target_is_source: bool,
    pub producer_evidence: Vec<String>,
    pub missing_producer_evidence: Vec<String>,
    pub blockers: Vec<String>,
    pub write_attempted: bool,
    pub source_unchanged: bool,
    pub target_unchanged: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum DocxPatchOperation {
    #[serde(rename = "text")]
    Text {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedTextDigest")]
        expected_text_digest: String,
        #[serde(rename = "replacementText")]
        replacement_text: String,
    },
    #[serde(rename = "style")]
    Style {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedStyleDigest")]
        expected_style_digest: String,
        bold: bool,
        italic: bool,
        underline: bool,
    },
    #[serde(rename = "imageAltText")]
    ImageAltText {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedMetadataDigest")]
        expected_metadata_digest: String,
        #[serde(rename = "replacementAltText")]
        replacement_alt_text: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxSavedCopyReport {
    pub status: String,
    pub engine: String,
    pub target_path: String,
    pub target_signature: String,
    pub target_digest: String,
    pub source_signature: String,
    pub source_unchanged: bool,
    pub output_bytes: usize,
    pub changed_parts: Vec<String>,
    pub unchanged_parts_verified: bool,
    pub structural_reopen_verified: bool,
    pub semantic_reopen_verified: bool,
    pub producer_evidence: Vec<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocxSavedSourceReport {
    pub status: String,
    pub engine: String,
    pub path: String,
    pub signature: String,
    pub digest: String,
    pub output_bytes: usize,
    pub changed_parts: Vec<String>,
    pub unchanged_parts_verified: bool,
    pub structural_reopen_verified: bool,
    pub semantic_reopen_verified: bool,
    pub rollback_protected: bool,
    pub producer_evidence: Vec<String>,
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
    let editable_style_targets = inspect_docx_editable_style_targets(&source, &model)?;
    let editable_image_targets = inspect_docx_editable_image_targets(&source, &model)?;
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
        editable_style_targets,
        editable_image_targets,
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

fn preview_docx_style_patch_path(
    path: &Path,
    expected_signature: &str,
    target_id: &str,
    expected_style_digest: &str,
    bold: bool,
    italic: bool,
    underline: bool,
) -> Result<DocxIsolatedPatchReport, String> {
    preview_docx_isolated_path(path, expected_signature, |source| {
        build_docx_style_patch_isolated(
            source,
            target_id,
            expected_style_digest,
            bold,
            italic,
            underline,
        )
    })
}

fn preview_docx_image_alt_text_patch_path(
    path: &Path,
    expected_signature: &str,
    target_id: &str,
    expected_metadata_digest: &str,
    replacement_alt_text: &str,
) -> Result<DocxIsolatedPatchReport, String> {
    preview_docx_isolated_path(path, expected_signature, |source| {
        build_docx_image_alt_text_patch_isolated(
            source,
            target_id,
            expected_metadata_digest,
            replacement_alt_text,
        )
    })
}

fn validate_docx_copy_file_name(file_name: &str) -> Result<String, String> {
    let file_name = file_name.trim();
    if file_name.is_empty() || file_name.len() > 255 {
        return Err("DOCX 副本文件名不能为空或超过 255 个字符".into());
    }
    if file_name.chars().any(|value| {
        value.is_control() || matches!(value, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
    }) || file_name.ends_with(' ')
        || file_name.ends_with('.')
    {
        return Err("DOCX 副本文件名包含路径、控制字符或 Windows 不允许的字符".into());
    }
    let path = Path::new(file_name);
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("docx"))
        || path.file_stem().is_none_or(|value| value.is_empty())
    {
        return Err("DOCX 副本文件名必须以 .docx 结尾".into());
    }
    Ok(file_name.to_string())
}

fn read_optional_file_state(path: &Path) -> Result<Option<(u64, String)>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取拟另存目标元数据失败: {error}"))?;
    if !metadata.is_file() {
        return Err("拟另存目标必须是文件或尚不存在".into());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取拟另存目标失败: {error}"))?;
    Ok(Some((
        metadata.len(),
        format!("{:x}", Sha256::digest(&bytes)),
    )))
}

fn docx_producer_evidence() -> Result<(Vec<String>, Vec<String>), String> {
    let matrix: serde_json::Value =
        serde_json::from_str(include_str!("../../../fixtures/docx/producers/matrix.json"))
            .map_err(|error| format!("读取 DOCX 生产者矩阵失败: {error}"))?;
    let producers = matrix["producers"]
        .as_array()
        .ok_or("DOCX 生产者矩阵缺少 producers")?;
    let mut verified = Vec::new();
    let mut missing = Vec::new();
    for producer in producers {
        let id = producer["id"]
            .as_str()
            .ok_or("DOCX 生产者矩阵包含无效 id")?;
        match producer["status"].as_str() {
            Some("verified") => verified.push(id.to_string()),
            Some("pending") => missing.push(match id {
                "wps-writer" => "wps".into(),
                "libreoffice-writer" => "libreoffice".into(),
                value => value.to_string(),
            }),
            _ => return Err(format!("DOCX 生产者矩阵包含无效状态: {id}")),
        }
    }
    Ok((verified, missing))
}

fn build_docx_operation(
    source: &[u8],
    operation: &DocxPatchOperation,
) -> Result<(DocxIsolatedPatchReport, Vec<u8>), String> {
    match operation {
        DocxPatchOperation::Text {
            target_id,
            expected_text_digest,
            replacement_text,
        } => build_docx_text_patch_isolated(
            source,
            target_id,
            expected_text_digest,
            replacement_text,
        ),
        DocxPatchOperation::Style {
            target_id,
            expected_style_digest,
            bold,
            italic,
            underline,
        } => build_docx_style_patch_isolated(
            source,
            target_id,
            expected_style_digest,
            *bold,
            *italic,
            *underline,
        ),
        DocxPatchOperation::ImageAltText {
            target_id,
            expected_metadata_digest,
            replacement_alt_text,
        } => build_docx_image_alt_text_patch_isolated(
            source,
            target_id,
            expected_metadata_digest,
            replacement_alt_text,
        ),
    }
}

fn remove_created_docx_if_exact(path: &Path, expected: &[u8]) {
    if fs::read(path).is_ok_and(|bytes| bytes == expected) {
        let _ = fs::remove_file(path);
    }
}

fn save_docx_patch_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_signature: &str,
    expected_output_digest: &str,
    operation: &DocxPatchOperation,
) -> Result<DocxSavedCopyReport, String> {
    if target_path == source_path {
        return Err("可靠另存禁止覆盖源 DOCX".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠另存不会覆盖现有文件".into());
    }
    let (producer_evidence, missing_producer_evidence) = docx_producer_evidence()?;
    if !missing_producer_evidence.is_empty() {
        return Err(format!(
            "DOCX 生产者重开证据尚未齐全: {}",
            missing_producer_evidence.join(", ")
        ));
    }
    let metadata = source_path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 可靠另存上限".into());
    }
    let source_signature = file_signature(&metadata);
    if source_signature != expected_signature {
        return Err("DOCX 已被外部修改，请重新打开后再保存副本".into());
    }
    let source = fs::read(source_path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (patch_report, output) = build_docx_operation(&source, operation)?;
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if patch_report.output_digest != expected_output_digest {
        return Err("DOCX 编辑内容或隔离输出已变化，请重新验证后再另存".into());
    }
    if !patch_report.unchanged_parts_verified
        || !patch_report.structural_reparse_verified
        || !patch_report.semantic_reparse_verified
    {
        return Err("DOCX 隔离补丁未通过完整保真与语义复读".into());
    }

    let source_before_write =
        fs::read(source_path).map_err(|error| format!("保存前复核源 DOCX 失败: {error}"))?;
    let metadata_before_write = source_path
        .metadata()
        .map_err(|error| format!("保存前复核源 DOCX 元数据失败: {error}"))?;
    if source_before_write != source
        || file_signature(&metadata_before_write) != source_signature
        || format!("{:x}", Sha256::digest(&source_before_write)) != source_digest
    {
        return Err("DOCX 在隔离验证期间发生变化，请重新打开后再保存".into());
    }

    write_new_bytes(target_path, &output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(target_path)
            .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
        let target_digest = format!("{:x}", Sha256::digest(&saved));
        if saved != output || target_digest != patch_report.output_digest {
            return Err("目标落盘字节与隔离验证输出不一致".into());
        }
        parse_docx(&saved).map_err(|error| format!("目标 DOCX 结构复读失败: {error}"))?;
        let (_, semantic_output) = build_docx_operation(&source, operation)?;
        if semantic_output != saved {
            return Err("目标 DOCX 语义复读结果与已验证补丁不一致".into());
        }
        let source_after =
            fs::read(source_path).map_err(|error| format!("复核源 DOCX 失败: {error}"))?;
        let source_metadata_after = source_path
            .metadata()
            .map_err(|error| format!("复核源 DOCX 元数据失败: {error}"))?;
        if source_after != source
            || file_signature(&source_metadata_after) != source_signature
            || format!("{:x}", Sha256::digest(&source_after)) != source_digest
        {
            return Err("源 DOCX 在另存期间发生变化".into());
        }
        let target_metadata = target_path
            .metadata()
            .map_err(|error| format!("读取已保存 DOCX 元数据失败: {error}"))?;
        Ok((target_digest, file_signature(&target_metadata)))
    })();
    let (target_digest, target_signature) = match verification {
        Ok(value) => value,
        Err(error) => {
            remove_created_docx_if_exact(target_path, &output);
            return Err(format!("可靠另存验证失败，已清理未验收副本: {error}"));
        }
    };

    Ok(DocxSavedCopyReport {
        status: "saved_verified".into(),
        engine: patch_report.engine,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature,
        target_digest,
        source_signature,
        source_unchanged: true,
        output_bytes: output.len(),
        changed_parts: patch_report.changed_parts,
        unchanged_parts_verified: true,
        structural_reopen_verified: true,
        semantic_reopen_verified: true,
        producer_evidence,
    })
}

fn save_docx_patch_source_to_path(
    source_path: &Path,
    expected_signature: &str,
    expected_output_digest: &str,
    operation: &DocxPatchOperation,
) -> Result<DocxSavedSourceReport, String> {
    let (producer_evidence, missing_producer_evidence) = docx_producer_evidence()?;
    if !missing_producer_evidence.is_empty() {
        return Err(format!(
            "DOCX 生产者重开证据尚未齐全: {}",
            missing_producer_evidence.join(", ")
        ));
    }
    let metadata = source_path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 可靠保存上限".into());
    }
    let source_signature = file_signature(&metadata);
    if source_signature != expected_signature {
        return Err("DOCX 已被外部修改，请重新打开后再保存".into());
    }
    let source = fs::read(source_path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (patch_report, output) = build_docx_operation(&source, operation)?;
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if patch_report.output_digest != expected_output_digest {
        return Err("DOCX 编辑内容或隔离输出已变化，请重新验证后再保存".into());
    }
    if !patch_report.unchanged_parts_verified
        || !patch_report.structural_reparse_verified
        || !patch_report.semantic_reparse_verified
    {
        return Err("DOCX 隔离补丁未通过完整保真与语义复读".into());
    }

    let source_before_write =
        fs::read(source_path).map_err(|error| format!("保存前复核源 DOCX 失败: {error}"))?;
    let metadata_before_write = source_path
        .metadata()
        .map_err(|error| format!("保存前复核源 DOCX 元数据失败: {error}"))?;
    if source_before_write != source
        || file_signature(&metadata_before_write) != source_signature
        || format!("{:x}", Sha256::digest(&source_before_write)) != source_digest
    {
        return Err("DOCX 在隔离验证期间发生变化，请重新打开后再保存".into());
    }

    write_bytes(source_path, &output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(source_path)
            .map_err(|error| format!("源文件已替换，但无法复读保存字节: {error}"))?;
        let digest = format!("{:x}", Sha256::digest(&saved));
        if saved != output || digest != patch_report.output_digest {
            return Err("源文件落盘字节与隔离验证输出不一致".into());
        }
        parse_docx(&saved).map_err(|error| format!("源 DOCX 结构复读失败: {error}"))?;
        let (_, semantic_output) = build_docx_operation(&source, operation)?;
        if semantic_output != saved {
            return Err("源 DOCX 语义复读结果与已验证补丁不一致".into());
        }
        let saved_metadata = source_path
            .metadata()
            .map_err(|error| format!("读取已保存 DOCX 元数据失败: {error}"))?;
        Ok((digest, file_signature(&saved_metadata)))
    })();
    let (digest, signature) = match verification {
        Ok(value) => value,
        Err(error) => {
            write_bytes(source_path, &source).map_err(|rollback_error| {
                format!("保存复读失败且原文件恢复失败: {error}; {rollback_error}")
            })?;
            let restored = fs::read(source_path).map_err(|rollback_error| {
                format!("保存复读失败且无法确认原文件恢复: {error}; {rollback_error}")
            })?;
            if restored != source {
                return Err(format!("保存复读失败且原文件恢复内容不一致: {error}"));
            }
            return Err(format!("可靠保存验证失败，已恢复原文件: {error}"));
        }
    };

    Ok(DocxSavedSourceReport {
        status: "source_saved_verified".into(),
        engine: patch_report.engine,
        path: source_path.to_string_lossy().into_owned(),
        signature,
        digest,
        output_bytes: output.len(),
        changed_parts: patch_report.changed_parts,
        unchanged_parts_verified: true,
        structural_reopen_verified: true,
        semantic_reopen_verified: true,
        rollback_protected: true,
        producer_evidence,
    })
}

fn audit_docx_save_readiness_path(
    source_path: &Path,
    target_path: &Path,
    expected_signature: &str,
    expected_output_digest: &str,
) -> Result<DocxSaveReadinessReport, String> {
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if expected_output_digest.len() != 64
        || !expected_output_digest
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err("DOCX 隔离输出摘要无效，请重新验证补丁".into());
    }

    let source_metadata = source_path
        .metadata()
        .map_err(|error| format!("读取 DOCX 元数据失败: {error}"))?;
    if source_metadata.len() > MAX_DOCX_FILE_BYTES {
        return Err("DOCX 文件超过 64 MiB 保存准备审计上限".into());
    }
    let source_signature = file_signature(&source_metadata);
    let source = fs::read(source_path).map_err(|error| format!("读取 DOCX 失败: {error}"))?;
    parse_docx(&source).map_err(|error| format!("DOCX 保存准备结构复读失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let target_before = read_optional_file_state(target_path)?;
    let target_is_source = target_path == source_path;
    let source_signature_current = source_signature == expected_signature;
    let mut blockers = Vec::new();
    if !source_signature_current {
        blockers.push("source_signature_stale".into());
    }
    if target_is_source {
        blockers.push("source_overwrite_forbidden".into());
    }
    if target_before.is_some() {
        blockers.push("target_already_exists".into());
    }
    let (producer_evidence, missing_producer_evidence) = docx_producer_evidence()?;
    blockers.extend(
        missing_producer_evidence
            .iter()
            .map(|producer| format!("producer_evidence_missing:{producer}")),
    );
    let source_after =
        fs::read(source_path).map_err(|error| format!("复核源 DOCX 失败: {error}"))?;
    let source_metadata_after = source_path
        .metadata()
        .map_err(|error| format!("复核源 DOCX 元数据失败: {error}"))?;
    let source_unchanged = source_after == source
        && file_signature(&source_metadata_after) == source_signature
        && format!("{:x}", Sha256::digest(&source_after)) == source_digest;
    let target_after = read_optional_file_state(target_path)?;
    let target_unchanged = target_after == target_before;
    if !source_unchanged || !target_unchanged {
        return Err("DOCX 保存准备审计期间源文件或拟另存目标发生变化".into());
    }

    Ok(DocxSaveReadinessReport {
        status: if blockers.is_empty() {
            "ready_to_save_copy".into()
        } else {
            "blocked".into()
        },
        source_signature,
        source_signature_current,
        source_digest,
        isolated_output_digest: expected_output_digest,
        target_path: target_path.to_string_lossy().into_owned(),
        target_exists: target_before.is_some(),
        target_is_source,
        producer_evidence,
        missing_producer_evidence,
        blockers,
        write_attempted: false,
        source_unchanged,
        target_unchanged,
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

#[tauri::command]
pub async fn preview_docx_style_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_style_digest: String,
    bold: bool,
    italic: bool,
    underline: bool,
) -> Result<DocxIsolatedPatchReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_docx_style_patch_path(
            &document,
            &expected_signature,
            &target_id,
            &expected_style_digest,
            bold,
            italic,
            underline,
        )
    })
    .await
    .map_err(|error| format!("DOCX C2D 字符样式补丁任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_docx_image_alt_text_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_metadata_digest: String,
    replacement_alt_text: String,
) -> Result<DocxIsolatedPatchReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let document = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_docx_image_alt_text_patch_path(
            &document,
            &expected_signature,
            &target_id,
            &expected_metadata_digest,
            &replacement_alt_text,
        )
    })
    .await
    .map_err(|error| format!("DOCX C2D 图片替代文本补丁任务失败: {error}"))?
}

#[tauri::command]
pub async fn audit_docx_save_readiness(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
) -> Result<DocxSaveReadinessReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["docx"])?;
    let target_file_name = validate_docx_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        audit_docx_save_readiness_path(
            &source_path,
            &target_path,
            &expected_signature,
            &expected_output_digest,
        )
    })
    .await
    .map_err(|error| format!("DOCX C2E 保存准备审计任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_docx_patch_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
    operation: DocxPatchOperation,
) -> Result<DocxSavedCopyReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["docx"])?;
    let target_file_name = validate_docx_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_docx_patch_copy_to_path(
            &source_path,
            &target_path,
            &expected_signature,
            &expected_output_digest,
            &operation,
        )
    })
    .await
    .map_err(|error| format!("DOCX C2E 可靠另存任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_docx_patch_source(
    library_root: String,
    path: String,
    expected_signature: String,
    expected_output_digest: String,
    operation: DocxPatchOperation,
) -> Result<DocxSavedSourceReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["docx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_docx_patch_source_to_path(
            &source_path,
            &expected_signature,
            &expected_output_digest,
            &operation,
        )
    })
    .await
    .map_err(|error| format!("DOCX 源文件可靠保存任务失败: {error}"))?
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

        let style_target = inspect_docx_editable_style_targets(&source, &model)
            .unwrap()
            .into_iter()
            .find(|target| target.text == "Microsoft Word Producer Fixture")
            .unwrap();
        let style_report = preview_docx_style_patch_path(
            &path,
            &signature,
            &style_target.id,
            &style_target.expected_style_digest,
            true,
            true,
            false,
        )
        .unwrap();
        assert_eq!(
            style_report.engine,
            "LongEdit C2D isolated basic character style patch"
        );
        assert!(style_report.semantic_reparse_verified);
        assert!(style_report.temporary_copy_reopen_verified);
        assert!(style_report.source_unchanged);
        assert_eq!(fs::read(&path).unwrap(), source);

        let image_target = inspect_docx_editable_image_targets(&source, &model)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let image_report = preview_docx_image_alt_text_patch_path(
            &path,
            &signature,
            &image_target.id,
            &image_target.expected_metadata_digest,
            "Command boundary fixture",
        )
        .unwrap();
        assert_eq!(
            image_report.engine,
            "LongEdit C2D isolated inline image alt-text patch"
        );
        assert!(image_report.semantic_reparse_verified);
        assert!(image_report.temporary_copy_reopen_verified);
        assert!(image_report.source_unchanged);
        assert_eq!(fs::read(&path).unwrap(), source);

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn c2e_save_readiness_reports_conflicts_without_writing_files() {
        let base = std::env::temp_dir().join(format!(
            "longedit-docx-c2e-readiness-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let source_path = base.join("source.docx");
        let target_path = base.join("copy.docx");
        let occupied_path = base.join("occupied.docx");
        let source =
            include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx").to_vec();
        fs::write(&source_path, &source).unwrap();
        fs::write(&occupied_path, b"existing target").unwrap();
        let signature = file_signature(&source_path.metadata().unwrap());
        let output_digest = "a".repeat(64);

        let ready =
            audit_docx_save_readiness_path(&source_path, &target_path, &signature, &output_digest)
                .unwrap();
        assert_eq!(ready.status, "ready_to_save_copy");
        assert!(ready.source_signature_current);
        assert!(!ready.target_exists);
        assert!(!ready.target_is_source);
        assert!(!ready.write_attempted);
        assert!(ready.source_unchanged);
        assert!(ready.target_unchanged);
        assert_eq!(
            ready.producer_evidence,
            ["microsoft-word-16", "wps-writer", "libreoffice-writer"]
        );
        assert!(ready.missing_producer_evidence.is_empty());
        assert!(ready.blockers.is_empty());
        assert!(!target_path.exists());
        assert_eq!(fs::read(&source_path).unwrap(), source);

        let occupied = audit_docx_save_readiness_path(
            &source_path,
            &occupied_path,
            "stale-signature",
            &output_digest,
        )
        .unwrap();
        assert!(!occupied.source_signature_current);
        assert!(occupied.target_exists);
        assert!(occupied.blockers.contains(&"source_signature_stale".into()));
        assert!(occupied.blockers.contains(&"target_already_exists".into()));
        assert_eq!(fs::read(&occupied_path).unwrap(), b"existing target");

        let same =
            audit_docx_save_readiness_path(&source_path, &source_path, &signature, &output_digest)
                .unwrap();
        assert!(same.target_is_source);
        assert!(same.blockers.contains(&"source_overwrite_forbidden".into()));
        assert!(validate_docx_copy_file_name("../escape.docx").is_err());
        assert!(audit_docx_save_readiness_path(
            &source_path,
            &target_path,
            &signature,
            "invalid-digest",
        )
        .is_err());
        assert_eq!(fs::read(&source_path).unwrap(), source);

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn c2e_reliably_saves_and_reopens_all_three_producer_copies() {
        let fixtures: [(&str, &[u8]); 3] = [
            (
                "word",
                include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/docx/producers/wps-writer.docx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/docx/producers/libreoffice-writer.docx"),
            ),
        ];
        let base = std::env::temp_dir().join(format!(
            "longedit-docx-c2e-save-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();

        for (producer, source) in fixtures {
            let source_path = base.join(format!("{producer}-source.docx"));
            let target_path = base.join(format!("{producer}-copy.docx"));
            fs::write(&source_path, source).unwrap();
            let signature = file_signature(&source_path.metadata().unwrap());
            let model = parse_docx(source).unwrap();
            let target = inspect_docx_editable_text_targets(source, &model)
                .unwrap()
                .into_iter()
                .next()
                .expect("producer fixture must expose a safe text target");
            let replacement = format!("LongEdit C2E {producer} verified copy");
            let operation = DocxPatchOperation::Text {
                target_id: target.id,
                expected_text_digest: target.expected_text_digest,
                replacement_text: replacement.clone(),
            };
            let (preview, _) = build_docx_operation(source, &operation).unwrap();
            let saved = save_docx_patch_copy_to_path(
                &source_path,
                &target_path,
                &signature,
                &preview.output_digest,
                &operation,
            )
            .unwrap();

            assert_eq!(saved.status, "saved_verified");
            assert!(saved.source_unchanged);
            assert!(saved.unchanged_parts_verified);
            assert!(saved.structural_reopen_verified);
            assert!(saved.semantic_reopen_verified);
            assert_eq!(
                saved.producer_evidence,
                ["microsoft-word-16", "wps-writer", "libreoffice-writer"]
            );
            assert!(target_path.exists());
            assert_eq!(fs::read(&source_path).unwrap(), source);
            assert!(parse_docx(&fs::read(&target_path).unwrap())
                .unwrap()
                .plain_text
                .contains(&replacement));

            let occupied_error = save_docx_patch_copy_to_path(
                &source_path,
                &target_path,
                &signature,
                &preview.output_digest,
                &operation,
            )
            .unwrap_err();
            assert!(occupied_error.contains("不会覆盖"));
        }

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn c2e_rejects_stale_preview_and_source_overwrite_without_writing() {
        let base = std::env::temp_dir().join(format!(
            "longedit-docx-c2e-conflict-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let source_path = base.join("source.docx");
        let target_path = base.join("copy.docx");
        let source =
            include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx").to_vec();
        fs::write(&source_path, &source).unwrap();
        let signature = file_signature(&source_path.metadata().unwrap());
        let model = parse_docx(&source).unwrap();
        let target = inspect_docx_editable_text_targets(&source, &model)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let operation = DocxPatchOperation::Text {
            target_id: target.id,
            expected_text_digest: target.expected_text_digest,
            replacement_text: "LongEdit conflict gate".into(),
        };
        let (preview, _) = build_docx_operation(&source, &operation).unwrap();

        assert!(save_docx_patch_copy_to_path(
            &source_path,
            &target_path,
            &signature,
            &"0".repeat(64),
            &operation,
        )
        .unwrap_err()
        .contains("已变化"));
        assert!(!target_path.exists());
        assert!(save_docx_patch_copy_to_path(
            &source_path,
            &source_path,
            &signature,
            &preview.output_digest,
            &operation,
        )
        .unwrap_err()
        .contains("禁止覆盖"));
        assert_eq!(fs::read(&source_path).unwrap(), source);

        fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn ux33_saves_verified_patch_to_source_and_rejects_stale_inputs() {
        let base = std::env::temp_dir().join(format!(
            "longedit-docx-ux33-source-save-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&base).unwrap();
        let source_path = base.join("source.docx");
        let source =
            include_bytes!("../../../fixtures/docx/producers/microsoft-word-16.docx").to_vec();
        fs::write(&source_path, &source).unwrap();
        let signature = file_signature(&source_path.metadata().unwrap());
        let model = parse_docx(&source).unwrap();
        let target = inspect_docx_editable_text_targets(&source, &model)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let replacement = "LongEdit direct source save verified";
        let operation = DocxPatchOperation::Text {
            target_id: target.id,
            expected_text_digest: target.expected_text_digest,
            replacement_text: replacement.into(),
        };
        let (preview, _) = build_docx_operation(&source, &operation).unwrap();

        assert!(save_docx_patch_source_to_path(
            &source_path,
            &signature,
            &"0".repeat(64),
            &operation,
        )
        .unwrap_err()
        .contains("已变化"));
        assert_eq!(fs::read(&source_path).unwrap(), source);

        let saved = save_docx_patch_source_to_path(
            &source_path,
            &signature,
            &preview.output_digest,
            &operation,
        )
        .unwrap();
        assert_eq!(saved.status, "source_saved_verified");
        assert!(saved.rollback_protected);
        assert!(saved.unchanged_parts_verified);
        assert!(saved.structural_reopen_verified);
        assert!(saved.semantic_reopen_verified);
        assert_ne!(saved.signature, signature);
        assert!(parse_docx(&fs::read(&source_path).unwrap())
            .unwrap()
            .plain_text
            .contains(replacement));
        assert!(save_docx_patch_source_to_path(
            &source_path,
            &signature,
            &preview.output_digest,
            &operation,
        )
        .unwrap_err()
        .contains("外部修改"));

        fs::remove_dir_all(base).unwrap();
    }
}
