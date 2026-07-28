use crate::formats::pptx::{parse_pptx, PptxPresentationModel, MAX_PPTX_FILE_BYTES};
use crate::formats::pptx_edit::{
    build_pptx_alt_text_patch_isolated, build_pptx_edit_baseline, build_pptx_image_patch_isolated,
    build_pptx_shape_add_isolated, build_pptx_shape_delete_isolated,
    build_pptx_style_patch_isolated, build_pptx_text_patch_isolated, PptxEditBaselineReport,
    PptxIsolatedMetadataPatchReport, PptxIsolatedTextPatchReport,
};
use crate::services::reliable_write::write_new_bytes;
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::{Cursor, Read, Write};
use std::path::Path;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use zip::ZipArchive;

const MAX_PPTX_MEDIA_PREVIEWS: usize = 48;
const MAX_PPTX_MEDIA_BYTES: u64 = 6 * 1024 * 1024;
const MAX_PPTX_MEDIA_TOTAL_BYTES: u64 = 24 * 1024 * 1024;
const MAX_PPTX_REPLACEMENT_BASE64_CHARS: usize = 11_184_812;

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
    pub signature: String,
    pub read_only: bool,
    pub model: PptxPresentationModel,
    pub media: Vec<PptxMediaPreview>,
    pub media_warnings: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(tag = "kind")]
pub enum PptxPatchOperation {
    #[serde(rename = "text")]
    Text {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedTextDigest")]
        expected_text_digest: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
        #[serde(rename = "replacementText")]
        replacement_text: String,
    },
    #[serde(rename = "style")]
    Style {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedStyleDigest")]
        expected_style_digest: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
        #[serde(rename = "fontSizeHundredthPoints")]
        font_size_hundredth_points: u32,
        #[serde(rename = "fontFamily")]
        font_family: String,
        color: String,
        bold: bool,
        italic: bool,
        underline: bool,
        alignment: String,
    },
    #[serde(rename = "imageAltText")]
    ImageAltText {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedMetadataDigest")]
        expected_metadata_digest: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
        #[serde(rename = "altText")]
        alt_text: String,
    },
    #[serde(rename = "imageBinary")]
    ImageBinary {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedMediaDigest")]
        expected_media_digest: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
        #[serde(rename = "replacementMimeType")]
        replacement_mime_type: String,
        #[serde(rename = "replacementBase64")]
        replacement_base64: String,
    },
    #[serde(rename = "shapeAdd")]
    ShapeAdd {
        #[serde(rename = "slideTargetId")]
        slide_target_id: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
        #[serde(rename = "shapeType")]
        shape_type: String,
        x: i64,
        y: i64,
        width: i64,
        height: i64,
        #[serde(rename = "fillColor")]
        fill_color: String,
        #[serde(rename = "lineColor")]
        line_color: String,
        #[serde(rename = "lineWidth")]
        line_width: i64,
    },
    #[serde(rename = "shapeDelete")]
    ShapeDelete {
        #[serde(rename = "targetId")]
        target_id: String,
        #[serde(rename = "expectedShapeDigest")]
        expected_shape_digest: String,
        #[serde(rename = "expectedPartDigest")]
        expected_part_digest: String,
    },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PptxSavedCopyReport {
    pub status: String,
    pub engine: String,
    pub save_mode: String,
    pub operation_kind: String,
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
    pub producer_matrix_baseline: Vec<String>,
    pub external_producer_reopen_required: bool,
}

struct BuiltPptxOperation {
    engine: String,
    operation_kind: String,
    output_digest: String,
    changed_parts: Vec<String>,
    unchanged_parts_verified: bool,
    structural_reparse_verified: bool,
    semantic_reparse_verified: bool,
    output: Vec<u8>,
}

struct TemporaryPptxCopy {
    path: PathBuf,
}

impl TemporaryPptxCopy {
    fn create(bytes: &[u8]) -> Result<Self, String> {
        let path = std::env::temp_dir().join(format!(
            "longedit-pptx-c4a-{}-{}.pptx",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_err(|error| format!("创建 PPTX 临时副本时间戳失败: {error}"))?
                .as_nanos()
        ));
        let mut file = OpenOptions::new()
            .create_new(true)
            .write(true)
            .open(&path)
            .map_err(|error| format!("创建 PPTX 临时副本失败: {error}"))?;
        if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = fs::remove_file(&path);
            return Err(format!("写入 PPTX 临时副本失败: {error}"));
        }
        Ok(Self { path })
    }
}

impl Drop for TemporaryPptxCopy {
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

fn decode_pptx_replacement_image(value: &str) -> Result<Vec<u8>, String> {
    if value.is_empty() || value.len() > MAX_PPTX_REPLACEMENT_BASE64_CHARS {
        return Err("PPTX C5A 图片数据为空或超过 8 MiB 上限".into());
    }
    general_purpose::STANDARD
        .decode(value)
        .map_err(|_| "PPTX C5A 图片数据不是有效 Base64".into())
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
        signature: file_signature(&metadata),
        read_only: true,
        model,
        media,
        media_warnings,
    })
}

fn audit_pptx_edit_baseline_path(
    path: &Path,
    expected_signature: &str,
) -> Result<PptxEditBaselineReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 PPTX 元数据失败: {error}"))?;
    if metadata.len() > MAX_PPTX_FILE_BYTES {
        return Err("PPTX 文件超过 96 MiB C4A 审计上限".into());
    }
    let actual_signature = file_signature(&metadata);
    if actual_signature != expected_signature {
        return Err("PPTX 已被外部修改，请重新打开后再建立编辑基线".into());
    }

    let source = fs::read(path).map_err(|error| format!("读取 PPTX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (mut report, isolated) = build_pptx_edit_baseline(&source, actual_signature.clone())?;

    let temporary = TemporaryPptxCopy::create(&isolated)?;
    let reopened =
        fs::read(&temporary.path).map_err(|error| format!("复读 PPTX 临时副本失败: {error}"))?;
    if reopened != isolated
        || format!("{:x}", Sha256::digest(&reopened)) != report.isolated_package_digest
    {
        return Err("PPTX 临时副本复读字节与隔离输出不一致".into());
    }
    parse_pptx(&reopened).map_err(|error| format!("PPTX 临时副本结构重开失败: {error}"))?;
    report.temporary_copy_reopen_verified = true;

    let source_after = fs::read(path).map_err(|error| format!("复核源 PPTX 失败: {error}"))?;
    let metadata_after = path
        .metadata()
        .map_err(|error| format!("复核源 PPTX 元数据失败: {error}"))?;
    report.source_unchanged = source_after == source
        && format!("{:x}", Sha256::digest(&source_after)) == source_digest
        && file_signature(&metadata_after) == actual_signature;
    if !report.source_unchanged {
        return Err("C4A 隔离基线审计期间源 PPTX 发生变化".into());
    }
    Ok(report)
}

fn preview_pptx_text_patch_path(
    path: &Path,
    expected_signature: &str,
    target_id: &str,
    expected_text_digest: &str,
    expected_part_digest: &str,
    replacement_text: &str,
) -> Result<PptxIsolatedTextPatchReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 PPTX 元数据失败: {error}"))?;
    if metadata.len() > MAX_PPTX_FILE_BYTES {
        return Err("PPTX 文件超过 96 MiB C4B 隔离补丁上限".into());
    }
    let actual_signature = file_signature(&metadata);
    if actual_signature != expected_signature {
        return Err("PPTX 已被外部修改，请重新打开后再预览编辑".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 PPTX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (mut report, output) = build_pptx_text_patch_isolated(
        &source,
        target_id,
        expected_text_digest,
        expected_part_digest,
        replacement_text,
    )?;
    let temporary = TemporaryPptxCopy::create(&output)?;
    let reopened = fs::read(&temporary.path)
        .map_err(|error| format!("复读 PPTX C4B 临时副本失败: {error}"))?;
    if reopened != output || format!("{:x}", Sha256::digest(&reopened)) != report.output_digest {
        return Err("PPTX C4B 临时副本复读字节与隔离输出不一致".into());
    }
    parse_pptx(&reopened).map_err(|error| format!("PPTX C4B 临时副本结构重开失败: {error}"))?;
    report.temporary_copy_reopen_verified = true;

    let source_after = fs::read(path).map_err(|error| format!("复核源 PPTX 失败: {error}"))?;
    let metadata_after = path
        .metadata()
        .map_err(|error| format!("复核源 PPTX 元数据失败: {error}"))?;
    report.source_unchanged = source_after == source
        && format!("{:x}", Sha256::digest(&source_after)) == source_digest
        && file_signature(&metadata_after) == actual_signature;
    if !report.source_unchanged {
        return Err("C4B 隔离补丁预览期间源 PPTX 发生变化".into());
    }
    Ok(report)
}

fn preview_pptx_metadata_patch_path(
    path: &Path,
    expected_signature: &str,
    stage: &str,
    build: impl FnOnce(&[u8]) -> Result<(PptxIsolatedMetadataPatchReport, Vec<u8>), String>,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let metadata = path
        .metadata()
        .map_err(|error| format!("读取 PPTX 元数据失败: {error}"))?;
    if metadata.len() > MAX_PPTX_FILE_BYTES {
        return Err(format!("PPTX 文件超过 96 MiB {stage} 隔离补丁上限"));
    }
    let actual_signature = file_signature(&metadata);
    if actual_signature != expected_signature {
        return Err("PPTX 已被外部修改，请重新打开后再预览编辑".into());
    }
    let source = fs::read(path).map_err(|error| format!("读取 PPTX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let (mut report, output) = build(&source)?;
    let temporary = TemporaryPptxCopy::create(&output)?;
    let reopened = fs::read(&temporary.path)
        .map_err(|error| format!("复读 PPTX {stage} 临时副本失败: {error}"))?;
    if reopened != output || format!("{:x}", Sha256::digest(&reopened)) != report.output_digest {
        return Err(format!("PPTX {stage} 临时副本复读字节与隔离输出不一致"));
    }
    parse_pptx(&reopened).map_err(|error| format!("PPTX {stage} 临时副本结构重开失败: {error}"))?;
    report.temporary_copy_reopen_verified = true;

    let source_after = fs::read(path).map_err(|error| format!("复核源 PPTX 失败: {error}"))?;
    let metadata_after = path
        .metadata()
        .map_err(|error| format!("复核源 PPTX 元数据失败: {error}"))?;
    report.source_unchanged = source_after == source
        && format!("{:x}", Sha256::digest(&source_after)) == source_digest
        && file_signature(&metadata_after) == actual_signature;
    if !report.source_unchanged {
        return Err(format!("{stage} 隔离补丁预览期间源 PPTX 发生变化"));
    }
    Ok(report)
}

fn build_pptx_operation(
    source: &[u8],
    operation: &PptxPatchOperation,
) -> Result<BuiltPptxOperation, String> {
    match operation {
        PptxPatchOperation::Text {
            target_id,
            expected_text_digest,
            expected_part_digest,
            replacement_text,
        } => {
            let (report, output) = build_pptx_text_patch_isolated(
                source,
                target_id,
                expected_text_digest,
                expected_part_digest,
                replacement_text,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.target_kind,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
        PptxPatchOperation::Style {
            target_id,
            expected_style_digest,
            expected_part_digest,
            font_size_hundredth_points,
            font_family,
            color,
            bold,
            italic,
            underline,
            alignment,
        } => {
            let (report, output) = build_pptx_style_patch_isolated(
                source,
                target_id,
                expected_style_digest,
                expected_part_digest,
                *font_size_hundredth_points,
                font_family,
                color,
                *bold,
                *italic,
                *underline,
                alignment,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.target_kind,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
        PptxPatchOperation::ImageAltText {
            target_id,
            expected_metadata_digest,
            expected_part_digest,
            alt_text,
        } => {
            let (report, output) = build_pptx_alt_text_patch_isolated(
                source,
                target_id,
                expected_metadata_digest,
                expected_part_digest,
                alt_text,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.target_kind,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
        PptxPatchOperation::ImageBinary {
            target_id,
            expected_media_digest,
            expected_part_digest,
            replacement_mime_type,
            replacement_base64,
        } => {
            let replacement = decode_pptx_replacement_image(replacement_base64)?;
            let (report, output) = build_pptx_image_patch_isolated(
                source,
                target_id,
                expected_media_digest,
                expected_part_digest,
                replacement_mime_type,
                &replacement,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.target_kind,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
        PptxPatchOperation::ShapeAdd {
            slide_target_id,
            expected_part_digest,
            shape_type,
            x,
            y,
            width,
            height,
            fill_color,
            line_color,
            line_width,
        } => {
            let (report, output) = build_pptx_shape_add_isolated(
                source,
                slide_target_id,
                expected_part_digest,
                shape_type,
                *x,
                *y,
                *width,
                *height,
                fill_color,
                line_color,
                *line_width,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.operation,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
        PptxPatchOperation::ShapeDelete {
            target_id,
            expected_shape_digest,
            expected_part_digest,
        } => {
            let (report, output) = build_pptx_shape_delete_isolated(
                source,
                target_id,
                expected_shape_digest,
                expected_part_digest,
            )?;
            Ok(BuiltPptxOperation {
                engine: report.engine,
                operation_kind: report.operation,
                output_digest: report.output_digest,
                changed_parts: report.changed_parts,
                unchanged_parts_verified: report.unchanged_parts_verified,
                structural_reparse_verified: report.structural_reparse_verified,
                semantic_reparse_verified: report.semantic_reparse_verified,
                output,
            })
        }
    }
}

fn validate_pptx_copy_file_name(file_name: &str) -> Result<String, String> {
    let file_name = file_name.trim();
    if file_name.is_empty() || file_name.len() > 255 {
        return Err("PPTX 副本文件名不能为空或超过 255 个字符".into());
    }
    if file_name.chars().any(|value| {
        value.is_control() || matches!(value, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
    }) || file_name.ends_with(' ')
        || file_name.ends_with('.')
    {
        return Err("PPTX 副本文件名包含路径、控制字符或 Windows 不允许的字符".into());
    }
    let path = Path::new(file_name);
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pptx"))
        || path.file_stem().is_none_or(|value| value.is_empty())
    {
        return Err("PPTX 副本文件名必须以 .pptx 结尾".into());
    }
    Ok(file_name.to_string())
}

fn remove_created_pptx_if_exact(path: &Path, expected: &[u8]) {
    if fs::read(path).is_ok_and(|bytes| bytes == expected) {
        let _ = fs::remove_file(path);
    }
}

fn save_pptx_patch_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_signature: &str,
    expected_output_digest: &str,
    operation: &PptxPatchOperation,
) -> Result<PptxSavedCopyReport, String> {
    if target_path == source_path {
        return Err("可靠另存禁止覆盖源 PPTX".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠另存不会覆盖现有文件".into());
    }
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if expected_output_digest.len() != 64
        || !expected_output_digest
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit())
    {
        return Err("PPTX 隔离预览摘要无效".into());
    }

    let metadata = source_path
        .metadata()
        .map_err(|error| format!("读取 PPTX 元数据失败: {error}"))?;
    if metadata.len() > MAX_PPTX_FILE_BYTES {
        return Err("PPTX 文件超过 96 MiB 可靠另存上限".into());
    }
    let source_signature = file_signature(&metadata);
    if source_signature != expected_signature {
        return Err("PPTX 已被外部修改，请重新打开后再保存副本".into());
    }
    let source = fs::read(source_path).map_err(|error| format!("读取 PPTX 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let built = build_pptx_operation(&source, operation)?;
    if built.output_digest != expected_output_digest {
        return Err("PPTX 编辑内容或隔离输出已变化，请重新验证后再另存".into());
    }
    if !built.unchanged_parts_verified
        || !built.structural_reparse_verified
        || !built.semantic_reparse_verified
        || built.changed_parts.len() != 1
    {
        return Err("PPTX 隔离补丁未通过单部件保真与语义复读".into());
    }

    let source_before_write =
        fs::read(source_path).map_err(|error| format!("保存前复核源 PPTX 失败: {error}"))?;
    let metadata_before_write = source_path
        .metadata()
        .map_err(|error| format!("保存前复核源 PPTX 元数据失败: {error}"))?;
    if source_before_write != source
        || file_signature(&metadata_before_write) != source_signature
        || format!("{:x}", Sha256::digest(&source_before_write)) != source_digest
    {
        return Err("PPTX 在隔离验证期间发生变化，请重新打开后再保存".into());
    }

    write_new_bytes(target_path, &built.output)?;
    let verification = (|| -> Result<(String, String), String> {
        let saved = fs::read(target_path)
            .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
        let target_digest = format!("{:x}", Sha256::digest(&saved));
        if saved != built.output || target_digest != built.output_digest {
            return Err("目标落盘字节与隔离验证输出不一致".into());
        }
        parse_pptx(&saved).map_err(|error| format!("目标 PPTX 结构复读失败: {error}"))?;
        let semantic = build_pptx_operation(&source, operation)?;
        if semantic.output != saved
            || !semantic.semantic_reparse_verified
            || semantic.changed_parts != built.changed_parts
        {
            return Err("目标 PPTX 语义复读结果与已验证补丁不一致".into());
        }
        let source_after =
            fs::read(source_path).map_err(|error| format!("复核源 PPTX 失败: {error}"))?;
        let source_metadata_after = source_path
            .metadata()
            .map_err(|error| format!("复核源 PPTX 元数据失败: {error}"))?;
        if source_after != source
            || file_signature(&source_metadata_after) != source_signature
            || format!("{:x}", Sha256::digest(&source_after)) != source_digest
        {
            return Err("源 PPTX 在另存期间发生变化".into());
        }
        let target_metadata = target_path
            .metadata()
            .map_err(|error| format!("读取已保存 PPTX 元数据失败: {error}"))?;
        Ok((target_digest, file_signature(&target_metadata)))
    })();
    let (target_digest, target_signature) = match verification {
        Ok(value) => value,
        Err(error) => {
            remove_created_pptx_if_exact(target_path, &built.output);
            return Err(format!("可靠另存验证失败，已清理未验收副本: {error}"));
        }
    };

    Ok(PptxSavedCopyReport {
        status: "saved_verified".into(),
        engine: built.engine,
        save_mode: "copy".into(),
        operation_kind: built.operation_kind,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature,
        target_digest,
        source_signature,
        source_unchanged: true,
        output_bytes: built.output.len(),
        changed_parts: built.changed_parts,
        unchanged_parts_verified: true,
        structural_reopen_verified: true,
        semantic_reopen_verified: true,
        producer_matrix_baseline: vec![
            "microsoft-powerpoint-16".into(),
            "wps-presentation".into(),
            "libreoffice-impress".into(),
        ],
        external_producer_reopen_required: true,
    })
}

#[tauri::command]
pub async fn read_pptx_presentation(
    library_root: String,
    path: String,
) -> Result<PptxReadReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || read_pptx_path(&presentation))
        .await
        .map_err(|error| format!("PPTX 读取任务失败: {error}"))?
}

#[tauri::command]
pub async fn audit_pptx_edit_baseline(
    library_root: String,
    path: String,
    expected_signature: String,
) -> Result<PptxEditBaselineReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        audit_pptx_edit_baseline_path(&presentation, &expected_signature)
    })
    .await
    .map_err(|error| format!("PPTX C4A 编辑基线任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pptx_text_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_text_digest: String,
    expected_part_digest: String,
    replacement_text: String,
) -> Result<PptxIsolatedTextPatchReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_text_patch_path(
            &presentation,
            &expected_signature,
            &target_id,
            &expected_text_digest,
            &expected_part_digest,
            &replacement_text,
        )
    })
    .await
    .map_err(|error| format!("PPTX C4B 隔离文本补丁任务失败: {error}"))?
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn preview_pptx_style_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_style_digest: String,
    expected_part_digest: String,
    font_size_hundredth_points: u32,
    font_family: String,
    color: String,
    bold: bool,
    italic: bool,
    underline: bool,
    alignment: String,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_metadata_patch_path(&presentation, &expected_signature, "C4C", |source| {
            build_pptx_style_patch_isolated(
                source,
                &target_id,
                &expected_style_digest,
                &expected_part_digest,
                font_size_hundredth_points,
                &font_family,
                &color,
                bold,
                italic,
                underline,
                &alignment,
            )
        })
    })
    .await
    .map_err(|error| format!("PPTX C4C 隔离字符样式补丁任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pptx_alt_text_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_metadata_digest: String,
    expected_part_digest: String,
    alt_text: String,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_metadata_patch_path(&presentation, &expected_signature, "C4C", |source| {
            build_pptx_alt_text_patch_isolated(
                source,
                &target_id,
                &expected_metadata_digest,
                &expected_part_digest,
                &alt_text,
            )
        })
    })
    .await
    .map_err(|error| format!("PPTX C4C 隔离图片替代文本补丁任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pptx_image_patch_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_media_digest: String,
    expected_part_digest: String,
    replacement_mime_type: String,
    replacement_base64: String,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let replacement = decode_pptx_replacement_image(&replacement_base64)?;
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_metadata_patch_path(&presentation, &expected_signature, "C5A", |source| {
            build_pptx_image_patch_isolated(
                source,
                &target_id,
                &expected_media_digest,
                &expected_part_digest,
                &replacement_mime_type,
                &replacement,
            )
        })
    })
    .await
    .map_err(|error| format!("PPTX C5A 隔离图片替换任务失败: {error}"))?
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub async fn preview_pptx_shape_add_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    slide_target_id: String,
    expected_part_digest: String,
    shape_type: String,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    fill_color: String,
    line_color: String,
    line_width: i64,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_metadata_patch_path(&presentation, &expected_signature, "C5B", |source| {
            build_pptx_shape_add_isolated(
                source,
                &slide_target_id,
                &expected_part_digest,
                &shape_type,
                x,
                y,
                width,
                height,
                &fill_color,
                &line_color,
                line_width,
            )
        })
    })
    .await
    .map_err(|error| format!("PPTX C5B 隔离形状新增任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pptx_shape_delete_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    target_id: String,
    expected_shape_digest: String,
    expected_part_digest: String,
) -> Result<PptxIsolatedMetadataPatchReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let presentation = guard.resolve_existing_file(path, &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        preview_pptx_metadata_patch_path(&presentation, &expected_signature, "C5B", |source| {
            build_pptx_shape_delete_isolated(
                source,
                &target_id,
                &expected_shape_digest,
                &expected_part_digest,
            )
        })
    })
    .await
    .map_err(|error| format!("PPTX C5B 隔离形状删除任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_pptx_patch_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
    operation: PptxPatchOperation,
) -> Result<PptxSavedCopyReport, String> {
    let guard = WorkspaceGuard::new(&library_root)?;
    let source_path = guard.resolve_existing_file(path, &["pptx"])?;
    let target_file_name = validate_pptx_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["pptx"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_pptx_patch_copy_to_path(
            &source_path,
            &target_path,
            &expected_signature,
            &expected_output_digest,
            &operation,
        )
    })
    .await
    .map_err(|error| format!("PPTX C4D 可靠另存任务失败: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn read_test_zip_part(source: &[u8], part_name: &str) -> Vec<u8> {
        let mut archive = ZipArchive::new(Cursor::new(source)).unwrap();
        let mut part = archive.by_name(part_name).unwrap();
        let mut bytes = Vec::with_capacity(part.size() as usize);
        part.read_to_end(&mut bytes).unwrap();
        bytes
    }

    #[test]
    fn media_signature_allowlist_rejects_mismatches() {
        assert!(valid_media_signature(b"\x89PNG\r\n\x1a\nrest", "image/png"));
        assert!(!valid_media_signature(b"not png", "image/png"));
        assert_eq!(media_mime("ppt/media/image1.svg"), None);
    }

    #[test]
    fn per_request_workspace_guard_reads_pptx_without_managed_state() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-pptx-command-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let fixture =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx");
        let path = root.join("presentation.pptx");
        fs::write(&path, fixture).unwrap();

        let guard = WorkspaceGuard::new(&root).unwrap();
        let resolved = guard.resolve_existing_file(&path, &["pptx"]).unwrap();
        let report = read_pptx_path(&resolved).unwrap();
        assert_eq!(report.model.slides.len(), 3);
        assert_eq!(report.model.slides[0].title, "PowerPoint Producer Fixture");
        assert_eq!(fs::read(&path).unwrap(), fixture);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4a_command_verifies_temporary_copy_and_keeps_source_unchanged() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-pptx-c4a-command-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let fixture =
            include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx").to_vec();
        let path = root.join("presentation.pptx");
        fs::write(&path, &fixture).unwrap();
        let signature = file_signature(&path.metadata().unwrap());

        let report = audit_pptx_edit_baseline_path(&path, &signature).unwrap();
        assert_eq!(report.status, "isolated_baseline_verified");
        assert!(report.temporary_copy_reopen_verified);
        assert!(report.source_unchanged);
        assert!(report.changed_parts.is_empty());
        assert!(!report.editing_enabled);
        assert_eq!(fs::read(&path).unwrap(), fixture);
        assert!(audit_pptx_edit_baseline_path(&path, "stale-signature")
            .unwrap_err()
            .contains("外部修改"));

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4b_command_previews_text_patch_without_changing_source() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-pptx-c4b-command-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let fixture =
            include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx").to_vec();
        let path = root.join("presentation.pptx");
        fs::write(&path, &fixture).unwrap();
        let signature = file_signature(&path.metadata().unwrap());
        let (baseline, _) = build_pptx_edit_baseline(&fixture, signature.clone()).unwrap();
        let target = baseline.editable_text_targets.first().unwrap();

        let report = preview_pptx_text_patch_path(
            &path,
            &signature,
            &target.id,
            &target.expected_text_digest,
            &target.expected_part_digest,
            "LongEdit C4B isolated preview",
        )
        .unwrap();
        assert_eq!(report.status, "isolated_text_patch_verified");
        assert_eq!(report.changed_parts, [target.part_name.clone()]);
        assert!(report.temporary_copy_reopen_verified);
        assert!(report.semantic_reparse_verified);
        assert!(report.source_unchanged);
        assert!(!report.writes_user_file);
        assert_eq!(fs::read(&path).unwrap(), fixture);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4c_commands_preview_style_and_alt_text_without_changing_source() {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!("longedit-pptx-c4c-command-{nonce}"));
        fs::create_dir_all(&root).unwrap();
        let fixture =
            include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx").to_vec();
        let path = root.join("presentation.pptx");
        fs::write(&path, &fixture).unwrap();
        let signature = file_signature(&path.metadata().unwrap());
        let (baseline, _) = build_pptx_edit_baseline(&fixture, signature.clone()).unwrap();

        let style = baseline.editable_style_targets.first().unwrap();
        let style_report = preview_pptx_metadata_patch_path(&path, &signature, "C4C", |source| {
            build_pptx_style_patch_isolated(
                source,
                &style.id,
                &style.expected_style_digest,
                &style.expected_part_digest,
                2_400,
                "Aptos",
                "2F6FED",
                true,
                true,
                false,
                "center",
            )
        })
        .unwrap();
        assert_eq!(style_report.status, "isolated_style_patch_verified");
        assert!(style_report.temporary_copy_reopen_verified);
        assert!(style_report.semantic_reparse_verified);
        assert!(style_report.source_unchanged);
        assert!(!style_report.writes_user_file);

        let alt = baseline.editable_alt_text_targets.first().unwrap();
        let alt_report = preview_pptx_metadata_patch_path(&path, &signature, "C4C", |source| {
            build_pptx_alt_text_patch_isolated(
                source,
                &alt.id,
                &alt.expected_metadata_digest,
                &alt.expected_part_digest,
                "LongEdit C4C accessible picture",
            )
        })
        .unwrap();
        assert_eq!(alt_report.status, "isolated_alt_text_patch_verified");
        assert!(alt_report.temporary_copy_reopen_verified);
        assert!(alt_report.semantic_reparse_verified);
        assert!(alt_report.source_unchanged);
        assert!(!alt_report.writes_user_file);
        assert_eq!(fs::read(&path).unwrap(), fixture);

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4d_saves_text_copy_for_all_real_producers_without_overwrite() {
        let fixtures: [(&str, &[u8]); 3] = [
            (
                "powerpoint",
                include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx"),
            ),
            (
                "wps",
                include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx"),
            ),
            (
                "libreoffice",
                include_bytes!("../../../fixtures/pptx/producers/libreoffice-impress.pptx"),
            ),
        ];
        let root = std::env::temp_dir().join(format!(
            "longedit-pptx-c4d-producers-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();

        for (producer, source) in fixtures {
            let source_path = root.join(format!("{producer}-source.pptx"));
            let target_path = root.join(format!("{producer}-copy.pptx"));
            fs::write(&source_path, source).unwrap();
            let signature = file_signature(&source_path.metadata().unwrap());
            let (baseline, _) = build_pptx_edit_baseline(source, signature.clone()).unwrap();
            let target = baseline.editable_text_targets.first().unwrap();
            let replacement = format!("LongEdit C4D {producer} verified copy");
            let operation = PptxPatchOperation::Text {
                target_id: target.id.clone(),
                expected_text_digest: target.expected_text_digest.clone(),
                expected_part_digest: target.expected_part_digest.clone(),
                replacement_text: replacement.clone(),
            };
            let preview = build_pptx_operation(source, &operation).unwrap();
            let saved = save_pptx_patch_copy_to_path(
                &source_path,
                &target_path,
                &signature,
                &preview.output_digest,
                &operation,
            )
            .unwrap_or_else(|error| panic!("{producer}: {error}"));
            assert_eq!(saved.status, "saved_verified", "{producer}");
            assert_eq!(saved.save_mode, "copy", "{producer}");
            assert!(saved.source_unchanged, "{producer}");
            assert!(saved.unchanged_parts_verified, "{producer}");
            assert!(saved.structural_reopen_verified, "{producer}");
            assert!(saved.semantic_reopen_verified, "{producer}");
            assert!(saved.external_producer_reopen_required, "{producer}");
            assert_eq!(saved.producer_matrix_baseline.len(), 3, "{producer}");
            assert_eq!(fs::read(&source_path).unwrap(), source, "{producer}");
            assert!(parse_pptx(&fs::read(&target_path).unwrap())
                .unwrap()
                .plain_text
                .contains(&replacement));

            assert!(save_pptx_patch_copy_to_path(
                &source_path,
                &target_path,
                &signature,
                &preview.output_digest,
                &operation,
            )
            .unwrap_err()
            .contains("不会覆盖"));
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4d_saves_notes_style_and_alt_text_operations_with_semantic_reopen() {
        let root = std::env::temp_dir().join(format!(
            "longedit-pptx-c4d-operations-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let source =
            include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx").to_vec();
        let source_path = root.join("source.pptx");
        fs::write(&source_path, &source).unwrap();
        let signature = file_signature(&source_path.metadata().unwrap());
        let (baseline, _) = build_pptx_edit_baseline(&source, signature.clone()).unwrap();

        let notes = baseline.editable_notes_targets.first().unwrap();
        let style = baseline.editable_style_targets.first().unwrap();
        let alt = baseline.editable_alt_text_targets.first().unwrap();
        let image = baseline.editable_image_targets.first().unwrap();
        let mut replacement_image = read_test_zip_part(&source, &image.part_name);
        let replacement_index = replacement_image.len() / 2;
        replacement_image[replacement_index] ^= 0x01;
        let operations = vec![
            (
                "notes",
                PptxPatchOperation::Text {
                    target_id: notes.id.clone(),
                    expected_text_digest: notes.expected_text_digest.clone(),
                    expected_part_digest: notes.expected_part_digest.clone(),
                    replacement_text: "LongEdit C4D saved speaker notes".into(),
                },
            ),
            (
                "style",
                PptxPatchOperation::Style {
                    target_id: style.id.clone(),
                    expected_style_digest: style.expected_style_digest.clone(),
                    expected_part_digest: style.expected_part_digest.clone(),
                    font_size_hundredth_points: 2_400,
                    font_family: "Aptos".into(),
                    color: "2F6FED".into(),
                    bold: !style.bold,
                    italic: true,
                    underline: true,
                    alignment: "center".into(),
                },
            ),
            (
                "alt",
                PptxPatchOperation::ImageAltText {
                    target_id: alt.id.clone(),
                    expected_metadata_digest: alt.expected_metadata_digest.clone(),
                    expected_part_digest: alt.expected_part_digest.clone(),
                    alt_text: "LongEdit C4D saved accessible picture".into(),
                },
            ),
            (
                "image",
                PptxPatchOperation::ImageBinary {
                    target_id: image.id.clone(),
                    expected_media_digest: image.expected_media_digest.clone(),
                    expected_part_digest: image.expected_part_digest.clone(),
                    replacement_mime_type: image.mime_type.clone(),
                    replacement_base64: general_purpose::STANDARD.encode(&replacement_image),
                },
            ),
        ];
        for (name, operation) in operations {
            let target_path = root.join(format!("{name}-copy.pptx"));
            let preview = build_pptx_operation(&source, &operation).unwrap();
            let saved = save_pptx_patch_copy_to_path(
                &source_path,
                &target_path,
                &signature,
                &preview.output_digest,
                &operation,
            )
            .unwrap_or_else(|error| panic!("{name}: {error}"));
            assert!(saved.semantic_reopen_verified, "{name}");
            assert_eq!(saved.changed_parts.len(), 1, "{name}");
            assert!(target_path.exists(), "{name}");
            assert_eq!(fs::read(&source_path).unwrap(), source, "{name}");
        }
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c5b_saves_shape_add_and_delete_copies_with_semantic_reopen() {
        let root = std::env::temp_dir().join(format!(
            "longedit-pptx-c5b-shapes-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let source =
            include_bytes!("../../../fixtures/pptx/producers/wps-presentation.pptx").to_vec();
        let source_path = root.join("source.pptx");
        let added_path = root.join("shape-add-copy.pptx");
        let deleted_path = root.join("shape-delete-copy.pptx");
        fs::write(&source_path, &source).unwrap();
        let source_signature = file_signature(&source_path.metadata().unwrap());
        let (baseline, _) = build_pptx_edit_baseline(&source, source_signature.clone()).unwrap();
        let slide = baseline.editable_shape_slides.first().unwrap();
        let add_operation = PptxPatchOperation::ShapeAdd {
            slide_target_id: slide.id.clone(),
            expected_part_digest: slide.expected_part_digest.clone(),
            shape_type: "rectangle".into(),
            x: 914_400,
            y: 914_400,
            width: 2_743_200,
            height: 1_371_600,
            fill_color: "DDEEFF".into(),
            line_color: "2255AA".into(),
            line_width: 25_400,
        };
        let add_preview = build_pptx_operation(&source, &add_operation).unwrap();
        let add_saved = save_pptx_patch_copy_to_path(
            &source_path,
            &added_path,
            &source_signature,
            &add_preview.output_digest,
            &add_operation,
        )
        .unwrap();
        assert_eq!(add_saved.operation_kind, "basic-shape-add");
        assert!(add_saved.semantic_reopen_verified);
        assert_eq!(fs::read(&source_path).unwrap(), source);

        let added = fs::read(&added_path).unwrap();
        let added_signature = file_signature(&added_path.metadata().unwrap());
        let (added_baseline, _) =
            build_pptx_edit_baseline(&added, added_signature.clone()).unwrap();
        let shape = added_baseline
            .editable_shape_targets
            .iter()
            .find(|target| target.object_name.starts_with("LongEdit Rectangle"))
            .unwrap();
        let delete_operation = PptxPatchOperation::ShapeDelete {
            target_id: shape.id.clone(),
            expected_shape_digest: shape.expected_shape_digest.clone(),
            expected_part_digest: shape.expected_part_digest.clone(),
        };
        let delete_preview = build_pptx_operation(&added, &delete_operation).unwrap();
        let delete_saved = save_pptx_patch_copy_to_path(
            &added_path,
            &deleted_path,
            &added_signature,
            &delete_preview.output_digest,
            &delete_operation,
        )
        .unwrap();
        assert_eq!(delete_saved.operation_kind, "basic-shape-delete");
        assert!(delete_saved.semantic_reopen_verified);
        assert_eq!(fs::read(&added_path).unwrap(), added);
        assert_eq!(
            parse_pptx(&fs::read(&deleted_path).unwrap())
                .unwrap()
                .slides[0]
                .objects
                .iter()
                .filter(|object| object.name.starts_with("LongEdit Rectangle"))
                .count(),
            0
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn c4d_rejects_stale_preview_source_overwrite_and_unsafe_name() {
        let root = std::env::temp_dir().join(format!(
            "longedit-pptx-c4d-conflicts-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        let source =
            include_bytes!("../../../fixtures/pptx/producers/microsoft-powerpoint-16.pptx")
                .to_vec();
        let source_path = root.join("source.pptx");
        let target_path = root.join("copy.pptx");
        fs::write(&source_path, &source).unwrap();
        let signature = file_signature(&source_path.metadata().unwrap());
        let (baseline, _) = build_pptx_edit_baseline(&source, signature.clone()).unwrap();
        let target = baseline.editable_text_targets.first().unwrap();
        let operation = PptxPatchOperation::Text {
            target_id: target.id.clone(),
            expected_text_digest: target.expected_text_digest.clone(),
            expected_part_digest: target.expected_part_digest.clone(),
            replacement_text: "LongEdit C4D conflict gate".into(),
        };
        let preview = build_pptx_operation(&source, &operation).unwrap();

        assert!(save_pptx_patch_copy_to_path(
            &source_path,
            &target_path,
            &signature,
            &"0".repeat(64),
            &operation,
        )
        .unwrap_err()
        .contains("已变化"));
        assert!(!target_path.exists());
        assert!(save_pptx_patch_copy_to_path(
            &source_path,
            &source_path,
            &signature,
            &preview.output_digest,
            &operation,
        )
        .unwrap_err()
        .contains("禁止覆盖"));
        assert!(save_pptx_patch_copy_to_path(
            &source_path,
            &target_path,
            "stale-signature",
            &preview.output_digest,
            &operation,
        )
        .unwrap_err()
        .contains("外部修改"));
        assert!(validate_pptx_copy_file_name("../escape.pptx").is_err());
        assert_eq!(fs::read(&source_path).unwrap(), source);
        fs::remove_dir_all(root).unwrap();
    }
}
