use crate::formats::pptx::{parse_pptx, PptxPresentationModel, MAX_PPTX_FILE_BYTES};
use crate::formats::pptx_edit::{
    build_pptx_alt_text_patch_isolated, build_pptx_edit_baseline, build_pptx_style_patch_isolated,
    build_pptx_text_patch_isolated, PptxEditBaselineReport, PptxIsolatedMetadataPatchReport,
    PptxIsolatedTextPatchReport,
};
use crate::services::workspace_guard::WorkspaceGuard;
use base64::{engine::general_purpose, Engine as _};
use serde::Serialize;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

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
}
