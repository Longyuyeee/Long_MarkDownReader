use crate::formats::pdf_annotations::{
    validate_pdf_annotations, PdfAnnotationDocument, PdfAnnotationKind, PdfAnnotationSource,
    MAX_ANNOTATION_FILE_BYTES,
};
use crate::formats::pdf_forms::{
    inspect_pdf_forms, PdfFormInspectionReport, MAX_PDF_FORM_INPUT_BYTES,
};
use crate::formats::pdf_ocr::{
    validate_pdf_ocr, PdfOcrDocument, PdfOcrSource, MAX_OCR_SIDECAR_BYTES,
};
use crate::services::external_file_access::ExternalFileAccess;
use crate::services::reliable_write::{recover_interrupted_write, write_new_bytes, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use lopdf::xref::{XrefEntry, XrefType};
use lopdf::{dictionary, Dictionary, Document, Object, ObjectId};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tauri::State;

pub const MAX_PDF_DOCUMENT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_PDF_FULL_READ_BYTES: u64 = 4 * 1024 * 1024;
pub const PDF_INITIAL_BYTES: u64 = 256 * 1024;
pub const PDF_RANGE_CHUNK_BYTES: u64 = 256 * 1024;
pub const MAX_PDF_RANGE_BYTES: u64 = 1024 * 1024;
pub const MAX_PDF_ISOLATED_INPUT_BYTES: u64 = 128 * 1024 * 1024;
pub const MAX_PDF_ISOLATED_OUTPUT_BYTES: usize = 256 * 1024 * 1024;
pub const MAX_PDF_PAGE_PLAN_ITEMS: usize = 20_000;
pub const MAX_PDF_MERGE_INPUTS: usize = 16;

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfReadDescriptor {
    pub length: u64,
    pub signature: String,
    pub initial_data: Vec<u8>,
    pub full_data: Option<Vec<u8>>,
    pub range_chunk_size: u64,
}

fn pdf_signature(metadata: &fs::Metadata) -> String {
    let modified = metadata
        .modified()
        .ok()
        .and_then(|value| value.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_nanos())
        .unwrap_or(0);
    format!("{}:{}", metadata.len(), modified)
}

fn validate_pdf_size(size: u64) -> Result<(), String> {
    if size == 0 {
        return Err("PDF 文件为空".into());
    }
    if size > MAX_PDF_DOCUMENT_BYTES {
        return Err(format!(
            "PDF 超过当前渐进阅读器的 2 GB 安全上限（当前 {:.1} MB）",
            size as f64 / 1024.0 / 1024.0
        ));
    }
    Ok(())
}

fn read_exact_range(path: &Path, begin: u64, end: u64) -> Result<Vec<u8>, String> {
    let length = end.saturating_sub(begin);
    let mut file = File::open(path).map_err(|error| format!("打开 PDF 失败: {}", error))?;
    file.seek(SeekFrom::Start(begin))
        .map_err(|error| format!("定位 PDF 范围失败: {}", error))?;
    let mut bytes = vec![0; length as usize];
    file.read_exact(&mut bytes)
        .map_err(|error| format!("读取 PDF 范围失败: {}", error))?;
    Ok(bytes)
}

#[tauri::command]
pub async fn read_pdf_info(
    library_root: String,
    path: String,
) -> Result<PdfReadDescriptor, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file_path = guard.resolve_existing_file(path, &["pdf"])?;
    read_pdf_info_from_path(file_path).await
}

#[tauri::command]
pub async fn read_external_pdf_info(
    access: State<'_, ExternalFileAccess>,
    path: String,
) -> Result<PdfReadDescriptor, String> {
    let file_path = access.resolve_preview(path)?;
    ensure_pdf_format(&file_path)?;
    read_pdf_info_from_path(file_path).await
}

async fn read_pdf_info_from_path(file_path: PathBuf) -> Result<PdfReadDescriptor, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let metadata = file_path
            .metadata()
            .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?;
        let length = metadata.len();
        validate_pdf_size(length)?;
        let signature = pdf_signature(&metadata);
        if length <= MAX_PDF_FULL_READ_BYTES {
            let full_data =
                fs::read(&file_path).map_err(|error| format!("读取 PDF 失败: {}", error))?;
            return Ok(PdfReadDescriptor {
                length,
                signature,
                initial_data: Vec::new(),
                full_data: Some(full_data),
                range_chunk_size: PDF_RANGE_CHUNK_BYTES,
            });
        }
        let initial_end = length.min(PDF_INITIAL_BYTES);
        Ok(PdfReadDescriptor {
            length,
            signature,
            initial_data: read_exact_range(&file_path, 0, initial_end)?,
            full_data: None,
            range_chunk_size: PDF_RANGE_CHUNK_BYTES,
        })
    })
    .await
    .map_err(|error| format!("PDF 元数据任务失败: {}", error))?
}

#[tauri::command]
pub async fn read_pdf_range(
    library_root: String,
    path: String,
    begin: u64,
    end: u64,
    expected_signature: String,
) -> Result<Vec<u8>, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file_path = guard.resolve_existing_file(path, &["pdf"])?;
    read_pdf_range_from_path(file_path, begin, end, expected_signature).await
}

#[tauri::command]
pub async fn read_external_pdf_range(
    access: State<'_, ExternalFileAccess>,
    path: String,
    begin: u64,
    end: u64,
    expected_signature: String,
) -> Result<Vec<u8>, String> {
    let file_path = access.resolve_preview(path)?;
    ensure_pdf_format(&file_path)?;
    read_pdf_range_from_path(file_path, begin, end, expected_signature).await
}

async fn read_pdf_range_from_path(
    file_path: PathBuf,
    begin: u64,
    end: u64,
    expected_signature: String,
) -> Result<Vec<u8>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let before = file_path
            .metadata()
            .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?;
        validate_pdf_size(before.len())?;
        if pdf_signature(&before) != expected_signature {
            return Err("PDF 在阅读期间发生变化，请重新打开文件".into());
        }
        if begin >= end || end > before.len() {
            return Err("PDF 范围参数无效".into());
        }
        if end - begin > MAX_PDF_RANGE_BYTES {
            return Err("PDF 单次范围读取超过 1 MB 上限".into());
        }
        let bytes = read_exact_range(&file_path, begin, end)?;
        let after = file_path
            .metadata()
            .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?;
        if pdf_signature(&after) != expected_signature {
            return Err("PDF 在范围读取期间发生变化，请重新打开文件".into());
        }
        Ok(bytes)
    })
    .await
    .map_err(|error| format!("PDF 范围读取任务失败: {}", error))?
}

fn ensure_pdf_format(path: &Path) -> Result<(), String> {
    if crate::formats::file_registry::file_format_for_path(path)?.id != "pdf" {
        return Err("外部 PDF 命令只接受已授权的 .pdf 文件".into());
    }
    Ok(())
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfAnnotationReference {
    pub uri: String,
    pub markdown: String,
    pub label: String,
}

fn encode_uri_component(value: &str) -> String {
    let mut encoded = String::with_capacity(value.len());
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b'~') {
            encoded.push(byte as char);
        } else {
            encoded.push_str(&format!("%{:02X}", byte));
        }
    }
    encoded
}

fn markdown_label(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('[', "\\[")
        .replace(']', "\\]")
}

fn reference_excerpt(value: &str) -> String {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let mut excerpt = collapsed.chars().take(1_200).collect::<String>();
    if collapsed.chars().count() > 1_200 {
        excerpt.push('…');
    }
    excerpt
}

#[tauri::command]
pub async fn read_pdf_file(library_root: String, path: String) -> Result<Vec<u8>, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file_path = guard.resolve_existing_file(path, &["pdf"])?;
    let size = file_path
        .metadata()
        .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?
        .len();
    if size > MAX_PDF_FULL_READ_BYTES {
        return Err(format!(
            "PDF 超过整文件读取的 4 MB 上限（当前 {:.1} MB），请使用渐进读取接口",
            size as f64 / 1024.0 / 1024.0
        ));
    }
    fs::read(file_path).map_err(|error| format!("读取 PDF 失败: {}", error))
}

#[tauri::command]
pub async fn inspect_pdf_form_structure(
    library_root: String,
    path: String,
) -> Result<PdfFormInspectionReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let file_path = guard.resolve_existing_file(path, &["pdf"])?;
    let size = file_path
        .metadata()
        .map_err(|error| format!("读取 PDF 表单元数据失败: {error}"))?
        .len();
    if size > MAX_PDF_FORM_INPUT_BYTES as u64 {
        return Err("PDF 超过表单检查的 128 MiB 安全上限".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let source =
            fs::read(file_path).map_err(|error| format!("读取 PDF 表单结构失败: {error}"))?;
        inspect_pdf_forms(&source)
    })
    .await
    .map_err(|error| format!("PDF 表单检查任务失败: {error}"))?
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPagePlanItem {
    pub source_page: u32,
    pub rotation: i16,
    pub removed: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfIsolatedPageMapping {
    pub output_page: u32,
    pub source_page: u32,
    pub rotation: i16,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPagePlanCompatibilityProfile {
    pub pdf_version: String,
    pub producer: Option<String>,
    pub xref_kind: String,
    pub compressed_objects: usize,
    pub inherited_page_values: usize,
    pub textless_pages: Option<usize>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfIsolatedPagePlanReport {
    pub status: String,
    pub engine: String,
    pub source_signature: String,
    pub source_pages: usize,
    pub output_pages: usize,
    pub rotated_pages: usize,
    pub reordered: bool,
    pub removed_pages: usize,
    pub blockers: Vec<String>,
    pub source_digest: String,
    pub output_digest: Option<String>,
    pub output_bytes: usize,
    pub structural_reparse_verified: bool,
    pub text_order_verified: bool,
    pub source_unchanged: bool,
    pub page_mapping: Vec<PdfIsolatedPageMapping>,
    pub compatibility: PdfPagePlanCompatibilityProfile,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSavedPagePlanReport {
    pub status: String,
    pub engine: String,
    pub target_path: String,
    pub target_signature: String,
    pub target_digest: String,
    pub source_signature: String,
    pub source_unchanged: bool,
    pub output_pages: usize,
    pub output_bytes: usize,
    pub structural_reopen_verified: bool,
    pub text_reopen_verified: bool,
}

#[derive(Clone, Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMergeInputRequest {
    pub path: String,
    pub expected_signature: String,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMergeInputSummary {
    pub path: String,
    pub file_name: String,
    pub signature: String,
    pub digest: String,
    pub pages: usize,
    pub bytes: usize,
    pub blockers: Vec<String>,
    pub compatibility: PdfPagePlanCompatibilityProfile,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfMergePageMapping {
    pub output_page: u32,
    pub input_index: usize,
    pub source_page: u32,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfIsolatedMergeReport {
    pub status: String,
    pub engine: String,
    pub inputs: Vec<PdfMergeInputSummary>,
    pub output_pages: usize,
    pub blockers: Vec<String>,
    pub output_digest: Option<String>,
    pub output_bytes: usize,
    pub structural_reparse_verified: bool,
    pub text_order_verified: bool,
    pub page_geometry_verified: bool,
    pub sources_unchanged: bool,
    pub page_mapping: Vec<PdfMergePageMapping>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSavedMergeReport {
    pub status: String,
    pub engine: String,
    pub target_path: String,
    pub target_signature: String,
    pub target_digest: String,
    pub sources_unchanged: bool,
    pub input_count: usize,
    pub output_pages: usize,
    pub output_bytes: usize,
    pub structural_reopen_verified: bool,
    pub text_reopen_verified: bool,
    pub page_geometry_verified: bool,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfInsertPageMapping {
    pub output_page: u32,
    pub source_kind: String,
    pub source_page: u32,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfIsolatedInsertReport {
    pub status: String,
    pub engine: String,
    pub base: PdfMergeInputSummary,
    pub source: PdfMergeInputSummary,
    pub source_pages: Vec<u32>,
    pub insert_after_page: u32,
    pub output_pages: usize,
    pub blockers: Vec<String>,
    pub output_digest: Option<String>,
    pub output_bytes: usize,
    pub structural_reparse_verified: bool,
    pub text_order_verified: bool,
    pub page_geometry_verified: bool,
    pub sources_unchanged: bool,
    pub page_mapping: Vec<PdfInsertPageMapping>,
}

#[derive(Clone, Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfSavedInsertReport {
    pub status: String,
    pub engine: String,
    pub target_path: String,
    pub target_signature: String,
    pub target_digest: String,
    pub sources_unchanged: bool,
    pub inserted_pages: usize,
    pub insert_after_page: u32,
    pub output_pages: usize,
    pub output_bytes: usize,
    pub structural_reopen_verified: bool,
    pub text_reopen_verified: bool,
    pub page_geometry_verified: bool,
}

#[derive(Clone, Debug, PartialEq)]
struct PdfPageGeometry {
    media_box: Option<[f32; 4]>,
    crop_box: Option<[f32; 4]>,
    rotation: i16,
}

fn object_dictionary(object: &Object) -> Option<&Dictionary> {
    match object {
        Object::Dictionary(dictionary) => Some(dictionary),
        Object::Stream(stream) => Some(&stream.dict),
        _ => None,
    }
}

fn named_dictionary<'a>(document: &'a Document, key: &[u8]) -> Option<&'a Dictionary> {
    let catalog = document.catalog().ok()?;
    let value = catalog.get(key).ok()?;
    document.dereference(value).ok()?.1.as_dict().ok()
}

fn pdf_plan_blockers(document: &Document, structural_change: bool) -> Vec<String> {
    let mut blockers = Vec::new();
    if document.is_encrypted() {
        blockers.push("encrypted_pdf_unverified".into());
    }
    let signature = document.objects.values().any(|object| {
        object_dictionary(object).is_some_and(|dictionary| {
            dictionary
                .get(b"Type")
                .and_then(Object::as_name)
                .is_ok_and(|value| value == b"Sig")
                || dictionary
                    .get(b"FT")
                    .and_then(Object::as_name)
                    .is_ok_and(|value| value == b"Sig")
        })
    });
    if signature
        || document
            .catalog()
            .is_ok_and(|catalog| catalog.has(b"Perms"))
    {
        blockers.push("digital_signature_unverified".into());
    }
    if document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"AcroForm"))
    {
        blockers.push("acroform_unverified".into());
    }
    if document
        .catalog()
        .is_ok_and(|catalog| catalog.has(b"Collection"))
    {
        blockers.push("pdf_portfolio_unverified".into());
    }
    if named_dictionary(document, b"Names").is_some_and(|names| names.has(b"EmbeddedFiles")) {
        blockers.push("embedded_files_unverified".into());
    }
    if structural_change {
        if document
            .catalog()
            .is_ok_and(|catalog| catalog.has(b"Outlines"))
        {
            blockers.push("outline_migration_unverified".into());
        }
        if document
            .catalog()
            .is_ok_and(|catalog| catalog.has(b"PageLabels"))
        {
            blockers.push("page_labels_migration_unverified".into());
        }
        if document
            .catalog()
            .is_ok_and(|catalog| catalog.has(b"StructTreeRoot"))
        {
            blockers.push("tagged_structure_migration_unverified".into());
        }
        if named_dictionary(document, b"Names").is_some_and(|names| names.has(b"Dests")) {
            blockers.push("named_destinations_migration_unverified".into());
        }
    }
    blockers.sort();
    blockers.dedup();
    blockers
}

fn inherited_page_value(document: &Document, page_id: ObjectId, key: &[u8]) -> Option<Object> {
    let mut current = page_id;
    let mut visited = HashSet::new();
    while visited.insert(current) {
        let dictionary = document.get_dictionary(current).ok()?;
        if let Ok(value) = dictionary.get(key) {
            return Some(value.clone());
        }
        current = dictionary
            .get(b"Parent")
            .and_then(Object::as_reference)
            .ok()?;
    }
    None
}

fn pdf_producer(document: &Document) -> Option<String> {
    let info = document.trailer.get(b"Info").ok()?;
    let dictionary = document.dereference(info).ok()?.1.as_dict().ok()?;
    let producer = dictionary.get(b"Producer").ok()?.as_str().ok()?;
    Some(String::from_utf8_lossy(producer).into_owned())
}

fn pdf_compatibility_profile(document: &Document) -> PdfPagePlanCompatibilityProfile {
    let inherited_page_values = document
        .get_pages()
        .values()
        .filter_map(|page_id| {
            let page = document.get_dictionary(*page_id).ok()?;
            Some(
                [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"]
                    .into_iter()
                    .filter(|key| {
                        !page.has(key) && inherited_page_value(document, *page_id, key).is_some()
                    })
                    .count(),
            )
        })
        .sum();
    PdfPagePlanCompatibilityProfile {
        pdf_version: document.version.clone(),
        producer: pdf_producer(document),
        xref_kind: match document.reference_table.cross_reference_type {
            XrefType::CrossReferenceStream => "stream",
            XrefType::CrossReferenceTable => "table",
        }
        .into(),
        compressed_objects: document
            .reference_table
            .entries
            .values()
            .filter(|entry| matches!(entry, XrefEntry::Compressed { .. }))
            .count(),
        inherited_page_values,
        textless_pages: None,
    }
}

fn normalized_pdf_page_text(mut pages: Vec<String>, page_count: usize) -> Vec<String> {
    pages.resize(page_count, String::new());
    pages.truncate(page_count);
    pages
}

fn normalized_rotation(value: i64) -> i16 {
    (((value % 360) + 360) % 360) as i16
}

fn object_number(value: &Object) -> Option<f32> {
    match value {
        Object::Integer(value) => Some(*value as f32),
        Object::Real(value) => Some(*value),
        _ => None,
    }
}

fn resolved_page_box(document: &Document, page_id: ObjectId, key: &[u8]) -> Option<[f32; 4]> {
    let value = inherited_page_value(document, page_id, key)?;
    let value = document.dereference(&value).ok()?.1;
    let values = value.as_array().ok()?;
    if values.len() != 4 {
        return None;
    }
    Some([
        object_number(&values[0])?,
        object_number(&values[1])?,
        object_number(&values[2])?,
        object_number(&values[3])?,
    ])
}

fn pdf_page_geometry(document: &Document, page_id: ObjectId) -> PdfPageGeometry {
    PdfPageGeometry {
        media_box: resolved_page_box(document, page_id, b"MediaBox"),
        crop_box: resolved_page_box(document, page_id, b"CropBox"),
        rotation: inherited_page_value(document, page_id, b"Rotate")
            .and_then(|value| value.as_i64().ok())
            .map(normalized_rotation)
            .unwrap_or(0),
    }
}

fn materialize_pdf_page_inheritance(
    document: &mut Document,
    page_id: ObjectId,
) -> Result<(), String> {
    let inherited = [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"]
        .into_iter()
        .filter_map(|key| {
            (!document
                .get_dictionary(page_id)
                .is_ok_and(|page| page.has(key)))
            .then(|| inherited_page_value(document, page_id, key).map(|value| (key, value)))
            .flatten()
        })
        .collect::<Vec<_>>();
    let page = document
        .get_dictionary_mut(page_id)
        .map_err(|error| format!("PDF 页面对象无效: {error}"))?;
    for (key, value) in inherited {
        page.set(key, value);
    }
    Ok(())
}

fn validate_pdf_page_plan(plan: &[PdfPagePlanItem], source_pages: usize) -> Result<(), String> {
    if source_pages == 0 || source_pages > MAX_PDF_PAGE_PLAN_ITEMS {
        return Err(format!(
            "PDF 页数必须在 1～{} 之间",
            MAX_PDF_PAGE_PLAN_ITEMS
        ));
    }
    if plan.len() != source_pages {
        return Err("页面计划必须精确包含每个源页面一次".into());
    }
    let mut seen = HashSet::new();
    for item in plan {
        if item.source_page == 0
            || item.source_page as usize > source_pages
            || !seen.insert(item.source_page)
        {
            return Err("页面计划包含重复或越界的源页码".into());
        }
        if !matches!(item.rotation, 0 | 90 | 180 | 270) {
            return Err("页面旋转必须为 0、90、180 或 270 度".into());
        }
    }
    if plan.iter().all(|item| item.removed) {
        return Err("页面计划必须至少保留一页".into());
    }
    Ok(())
}

fn pdf_page_range_plan(
    source_pages: usize,
    selected_pages: &[u32],
) -> Result<Vec<PdfPagePlanItem>, String> {
    if source_pages < 2 || source_pages > MAX_PDF_PAGE_PLAN_ITEMS {
        return Err(format!(
            "PDF 页数必须在 2～{} 之间才能提取",
            MAX_PDF_PAGE_PLAN_ITEMS
        ));
    }
    if selected_pages.is_empty() {
        return Err("提取范围必须至少包含一页".into());
    }
    let mut seen = HashSet::new();
    for page in selected_pages {
        if *page == 0 || *page as usize > source_pages {
            return Err(format!("提取页码必须在 1～{} 之间", source_pages));
        }
        if !seen.insert(*page) {
            return Err(format!("提取范围包含重复页码 {}", page));
        }
    }
    if selected_pages.len() == source_pages
        && selected_pages
            .iter()
            .enumerate()
            .all(|(index, page)| *page as usize == index + 1)
    {
        return Err("提取范围必须排除至少一页，完整复制请使用页面整理".into());
    }

    Ok(selected_pages
        .iter()
        .copied()
        .map(|source_page| PdfPagePlanItem {
            source_page,
            rotation: 0,
            removed: false,
        })
        .chain(
            (1..=source_pages as u32)
                .filter(|page| !seen.contains(page))
                .map(|source_page| PdfPagePlanItem {
                    source_page,
                    rotation: 0,
                    removed: true,
                }),
        )
        .collect())
}

fn pdf_page_range_plan_for_path(
    pdf_path: &Path,
    expected_signature: &str,
    selected_pages: &[u32],
) -> Result<Vec<PdfPagePlanItem>, String> {
    let metadata = pdf_path
        .metadata()
        .map_err(|error| format!("读取 PDF 元数据失败: {error}"))?;
    validate_pdf_size(metadata.len())?;
    if metadata.len() > MAX_PDF_ISOLATED_INPUT_BYTES {
        return Err("页面提取目前只支持不超过 128 MB 的 PDF".into());
    }
    if pdf_signature(&metadata) != expected_signature {
        return Err("PDF 已被外部修改，请重新打开后再提取页面".into());
    }
    let source = fs::read(pdf_path).map_err(|error| format!("读取 PDF 失败: {error}"))?;
    let document =
        Document::load_mem(&source).map_err(|error| format!("PDF 结构解析失败: {error}"))?;
    if document.is_encrypted() {
        return Ok(Vec::new());
    }
    pdf_page_range_plan(document.get_pages().len(), selected_pages)
}

fn build_pdf_page_range_extract_isolated(
    pdf_path: &Path,
    expected_signature: &str,
    selected_pages: Vec<u32>,
) -> Result<(PdfIsolatedPagePlanReport, Option<Vec<u8>>), String> {
    let plan = pdf_page_range_plan_for_path(pdf_path, expected_signature, &selected_pages)?;
    build_pdf_page_plan_isolated(pdf_path, expected_signature, plan)
}

fn resolve_pdf_merge_inputs(
    guard: &WorkspaceGuard,
    inputs: Vec<PdfMergeInputRequest>,
) -> Result<Vec<(PathBuf, String)>, String> {
    if !(2..=MAX_PDF_MERGE_INPUTS).contains(&inputs.len()) {
        return Err(format!(
            "PDF 合并必须选择 2～{} 个输入文件",
            MAX_PDF_MERGE_INPUTS
        ));
    }
    let mut seen = HashSet::new();
    inputs
        .into_iter()
        .map(|input| {
            let path = guard.resolve_existing_file(input.path, &["pdf"])?;
            if !seen.insert(path.clone()) {
                return Err("PDF 合并输入不能重复".into());
            }
            if input.expected_signature.trim().is_empty() {
                return Err("PDF 合并输入缺少内容签名，请重新添加".into());
            }
            Ok((path, input.expected_signature))
        })
        .collect()
}

fn merge_pdf_documents(
    documents: &mut [Document],
) -> Result<(Document, Vec<PdfMergePageMapping>, Vec<PdfPageGeometry>), String> {
    let mut sequence = Vec::new();
    for (input_index, document) in documents.iter().enumerate() {
        sequence.extend(
            document
                .get_pages()
                .keys()
                .copied()
                .map(|source_page| (input_index, source_page)),
        );
    }
    compose_pdf_documents(documents, &sequence)
}

fn compose_pdf_documents(
    documents: &mut [Document],
    sequence: &[(usize, u32)],
) -> Result<(Document, Vec<PdfMergePageMapping>, Vec<PdfPageGeometry>), String> {
    if sequence.is_empty() || sequence.len() > MAX_PDF_PAGE_PLAN_ITEMS {
        return Err(format!(
            "PDF 页面组合必须在 1～{} 页之间",
            MAX_PDF_PAGE_PLAN_ITEMS
        ));
    }
    let version = documents
        .iter()
        .map(|document| document.version.as_str())
        .max()
        .unwrap_or("1.5")
        .to_string();
    let mut output = Document::with_version(version);
    let pages_id = output.new_object_id();
    let catalog_id = output.new_object_id();
    let mut next_object_id = output.max_id + 1;
    let requested = sequence.iter().copied().collect::<HashSet<_>>();
    if requested.len() != sequence.len() {
        return Err("PDF 页面组合不能重复引用同一来源页".into());
    }
    let mut available_pages = std::collections::HashMap::new();

    for (input_index, document) in documents.iter_mut().enumerate() {
        document.renumber_objects_with(next_object_id);
        next_object_id = document.max_id.saturating_add(1);
        let pages = document.get_pages();
        for (source_page, page_id) in pages {
            if !requested.contains(&(input_index, source_page)) {
                continue;
            }
            materialize_pdf_page_inheritance(document, page_id)?;
            let geometry = pdf_page_geometry(document, page_id);
            let mut page = document
                .get_dictionary(page_id)
                .map_err(|error| format!("PDF 页面对象无效: {error}"))?
                .clone();
            page.set("Parent", Object::Reference(pages_id));
            available_pages.insert(
                (input_index, source_page),
                (page_id, Object::Dictionary(page), geometry),
            );
        }
        for (object_id, object) in std::mem::take(&mut document.objects) {
            match object.type_name().unwrap_or(b"") {
                b"Catalog" | b"Pages" | b"Page" | b"Outlines" | b"Outline" => {}
                _ => {
                    output.objects.insert(object_id, object);
                }
            }
        }
    }

    let mut page_objects = Vec::with_capacity(sequence.len());
    let mut mapping = Vec::with_capacity(sequence.len());
    let mut expected_geometry = Vec::with_capacity(sequence.len());
    for (input_index, source_page) in sequence {
        let (page_id, page, geometry) = available_pages
            .remove(&(*input_index, *source_page))
            .ok_or_else(|| {
                format!(
                    "PDF 页面组合引用不存在：输入 {} 第 {} 页",
                    input_index + 1,
                    source_page
                )
            })?;
        page_objects.push((page_id, page));
        expected_geometry.push(geometry);
        mapping.push(PdfMergePageMapping {
            output_page: mapping.len() as u32 + 1,
            input_index: input_index + 1,
            source_page: *source_page,
        });
    }
    for (object_id, page) in &page_objects {
        output.objects.insert(*object_id, page.clone());
    }
    output.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => page_objects
                .iter()
                .map(|(object_id, _)| Object::Reference(*object_id))
                .collect::<Vec<_>>(),
            "Count" => page_objects.len() as i64,
        }),
    );
    output.objects.insert(
        catalog_id,
        Object::Dictionary(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        }),
    );
    output.trailer.set("Root", Object::Reference(catalog_id));
    output.max_id = output
        .objects
        .keys()
        .map(|(object_id, _)| *object_id)
        .max()
        .unwrap_or(output.max_id);
    output.prune_objects();
    Ok((output, mapping, expected_geometry))
}

fn build_pdf_merge_isolated(
    resolved_inputs: Vec<(PathBuf, String)>,
) -> Result<(PdfIsolatedMergeReport, Option<Vec<u8>>), String> {
    let mut documents = Vec::with_capacity(resolved_inputs.len());
    let mut source_bytes = Vec::with_capacity(resolved_inputs.len());
    let mut summaries = Vec::with_capacity(resolved_inputs.len());
    let mut expected_text = Vec::new();
    let mut total_input_bytes = 0u64;
    let mut total_pages = 0usize;

    for (path, expected_signature) in &resolved_inputs {
        let metadata = path
            .metadata()
            .map_err(|error| format!("读取合并输入元数据失败: {error}"))?;
        validate_pdf_size(metadata.len())?;
        total_input_bytes = total_input_bytes
            .checked_add(metadata.len())
            .ok_or("PDF 合并输入大小溢出")?;
        if total_input_bytes > MAX_PDF_ISOLATED_INPUT_BYTES {
            return Err("PDF 合并输入总大小不能超过 128 MB".into());
        }
        let signature = pdf_signature(&metadata);
        if signature != *expected_signature {
            return Err(format!(
                "PDF 合并输入已被外部修改：{}",
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("未知文件")
            ));
        }
        let bytes = fs::read(path).map_err(|error| format!("读取合并输入失败: {error}"))?;
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let document = Document::load_mem(&bytes)
            .map_err(|error| format!("PDF 合并输入结构解析失败: {error}"))?;
        let pages = document.get_pages().len();
        let blockers = pdf_plan_blockers(&document, true);
        if pages == 0 && blockers.is_empty() {
            return Err("PDF 合并输入没有可读取页面".into());
        }
        total_pages = total_pages.checked_add(pages).ok_or("PDF 合并页数溢出")?;
        if total_pages > MAX_PDF_PAGE_PLAN_ITEMS {
            return Err(format!(
                "PDF 合并总页数必须在 1～{} 之间",
                MAX_PDF_PAGE_PLAN_ITEMS
            ));
        }
        let mut compatibility = pdf_compatibility_profile(&document);
        if blockers.is_empty() {
            let text = normalized_pdf_page_text(
                pdf_extract::extract_text_from_mem_by_pages(&bytes)
                    .map_err(|error| format!("PDF 合并输入文本复读失败: {error}"))?,
                pages,
            );
            compatibility.textless_pages =
                Some(text.iter().filter(|page| page.trim().is_empty()).count());
            expected_text.extend(text);
        }
        summaries.push(PdfMergeInputSummary {
            path: path.to_string_lossy().into_owned(),
            file_name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("PDF")
                .to_string(),
            signature,
            digest,
            pages,
            bytes: bytes.len(),
            blockers,
            compatibility,
        });
        source_bytes.push(bytes);
        documents.push(document);
    }

    let blockers = summaries
        .iter()
        .enumerate()
        .flat_map(|(index, input)| {
            input
                .blockers
                .iter()
                .map(move |blocker| format!("input_{}:{blocker}", index + 1))
        })
        .collect::<Vec<_>>();
    let sources_unchanged =
        resolved_inputs
            .iter()
            .zip(&source_bytes)
            .all(|((path, signature), before)| {
                path.metadata().is_ok_and(|metadata| {
                    pdf_signature(&metadata) == *signature
                        && fs::read(path).is_ok_and(|after| after == *before)
                })
            });
    if !sources_unchanged {
        return Err("PDF 合并验证期间有输入文件发生变化".into());
    }
    if !blockers.is_empty() {
        return Ok((
            PdfIsolatedMergeReport {
                status: "blocked".into(),
                engine: "lopdf 0.42.0 (MIT)".into(),
                inputs: summaries,
                output_pages: total_pages,
                blockers,
                output_digest: None,
                output_bytes: 0,
                structural_reparse_verified: false,
                text_order_verified: false,
                page_geometry_verified: false,
                sources_unchanged,
                page_mapping: Vec::new(),
            },
            None,
        ));
    }

    let (mut merged, mapping, expected_geometry) = merge_pdf_documents(&mut documents)?;
    let mut output = Vec::new();
    merged
        .save_to(&mut output)
        .map_err(|error| format!("隔离 PDF 合并生成失败: {error}"))?;
    if output.len() > MAX_PDF_ISOLATED_OUTPUT_BYTES {
        return Err("合并 PDF 超过 256 MB 输出上限".into());
    }
    let verified =
        Document::load_mem(&output).map_err(|error| format!("合并 PDF 结构复读失败: {error}"))?;
    let verified_pages = verified.get_pages();
    let structural_reparse_verified = verified_pages.len() == total_pages;
    if !structural_reparse_verified {
        return Err("合并 PDF 复读页数与输入总页数不一致".into());
    }
    let output_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("合并 PDF 文本复读失败: {error}"))?,
        total_pages,
    );
    let text_order_verified = output_text == expected_text;
    if !text_order_verified {
        return Err("合并 PDF 文本页序与输入顺序不一致".into());
    }
    let actual_geometry = verified_pages
        .values()
        .map(|page_id| pdf_page_geometry(&verified, *page_id))
        .collect::<Vec<_>>();
    let page_geometry_verified = actual_geometry == expected_geometry;
    if !page_geometry_verified {
        return Err("合并 PDF 页面尺寸或旋转复读不一致".into());
    }
    Ok((
        PdfIsolatedMergeReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 (MIT)".into(),
            inputs: summaries,
            output_pages: total_pages,
            blockers: Vec::new(),
            output_digest: Some(format!("{:x}", Sha256::digest(&output))),
            output_bytes: output.len(),
            structural_reparse_verified,
            text_order_verified,
            page_geometry_verified,
            sources_unchanged,
            page_mapping: mapping,
        },
        Some(output),
    ))
}

fn validate_pdf_insert_plan(
    base_pages: usize,
    source_page_count: usize,
    source_pages: &[u32],
    insert_after_page: u32,
) -> Result<(), String> {
    if source_pages.is_empty() {
        return Err("请选择至少一个要插入的来源页".into());
    }
    if insert_after_page as usize > base_pages {
        return Err(format!("插入位置必须在 0～{} 之间", base_pages));
    }
    let mut seen = HashSet::new();
    for page in source_pages {
        if *page == 0 || *page as usize > source_page_count {
            return Err(format!("来源页码必须在 1～{} 之间", source_page_count));
        }
        if !seen.insert(*page) {
            return Err(format!("插入范围包含重复页码 {}", page));
        }
    }
    if base_pages
        .checked_add(source_pages.len())
        .is_none_or(|pages| pages > MAX_PDF_PAGE_PLAN_ITEMS)
    {
        return Err(format!("插入后总页数不能超过 {}", MAX_PDF_PAGE_PLAN_ITEMS));
    }
    Ok(())
}

fn build_pdf_insert_isolated(
    resolved_inputs: Vec<(PathBuf, String)>,
    source_pages: Vec<u32>,
    insert_after_page: u32,
) -> Result<(PdfIsolatedInsertReport, Option<Vec<u8>>), String> {
    if resolved_inputs.len() != 2 {
        return Err("PDF 插页必须包含当前文件和一个来源文件".into());
    }
    let mut documents = Vec::with_capacity(2);
    let mut source_bytes = Vec::with_capacity(2);
    let mut summaries = Vec::with_capacity(2);
    let mut page_text = Vec::with_capacity(2);
    let mut total_input_bytes = 0u64;
    let mut total_input_pages = 0usize;

    for (path, expected_signature) in &resolved_inputs {
        let metadata = path
            .metadata()
            .map_err(|error| format!("读取插页输入元数据失败: {error}"))?;
        validate_pdf_size(metadata.len())?;
        total_input_bytes = total_input_bytes
            .checked_add(metadata.len())
            .ok_or("PDF 插页输入大小溢出")?;
        if total_input_bytes > MAX_PDF_ISOLATED_INPUT_BYTES {
            return Err("PDF 插页输入总大小不能超过 128 MB".into());
        }
        let signature = pdf_signature(&metadata);
        if signature != *expected_signature {
            return Err(format!(
                "PDF 插页输入已被外部修改：{}",
                path.file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("未知文件")
            ));
        }
        let bytes = fs::read(path).map_err(|error| format!("读取插页输入失败: {error}"))?;
        let digest = format!("{:x}", Sha256::digest(&bytes));
        let document = Document::load_mem(&bytes)
            .map_err(|error| format!("PDF 插页输入结构解析失败: {error}"))?;
        let pages = document.get_pages().len();
        let blockers = pdf_plan_blockers(&document, true);
        if pages == 0 && blockers.is_empty() {
            return Err("PDF 插页输入没有可读取页面".into());
        }
        total_input_pages = total_input_pages
            .checked_add(pages)
            .ok_or("PDF 插页输入页数溢出")?;
        if total_input_pages > MAX_PDF_PAGE_PLAN_ITEMS {
            return Err(format!(
                "PDF 插页输入总页数必须在 1～{} 之间",
                MAX_PDF_PAGE_PLAN_ITEMS
            ));
        }
        let mut compatibility = pdf_compatibility_profile(&document);
        let text = if blockers.is_empty() {
            let text = normalized_pdf_page_text(
                pdf_extract::extract_text_from_mem_by_pages(&bytes)
                    .map_err(|error| format!("PDF 插页输入文本复读失败: {error}"))?,
                pages,
            );
            compatibility.textless_pages =
                Some(text.iter().filter(|page| page.trim().is_empty()).count());
            text
        } else {
            Vec::new()
        };
        summaries.push(PdfMergeInputSummary {
            path: path.to_string_lossy().into_owned(),
            file_name: path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("PDF")
                .to_string(),
            signature,
            digest,
            pages,
            bytes: bytes.len(),
            blockers,
            compatibility,
        });
        page_text.push(text);
        source_bytes.push(bytes);
        documents.push(document);
    }

    let blockers = summaries
        .iter()
        .enumerate()
        .flat_map(|(index, input)| {
            let kind = if index == 0 { "base" } else { "source" };
            input
                .blockers
                .iter()
                .map(move |blocker| format!("{kind}:{blocker}"))
        })
        .collect::<Vec<_>>();
    let sources_unchanged =
        resolved_inputs
            .iter()
            .zip(&source_bytes)
            .all(|((path, signature), before)| {
                path.metadata().is_ok_and(|metadata| {
                    pdf_signature(&metadata) == *signature
                        && fs::read(path).is_ok_and(|after| after == *before)
                })
            });
    if !sources_unchanged {
        return Err("PDF 插页验证期间有输入文件发生变化".into());
    }
    if !blockers.is_empty() {
        return Ok((
            PdfIsolatedInsertReport {
                status: "blocked".into(),
                engine: "lopdf 0.42.0 (MIT)".into(),
                base: summaries[0].clone(),
                source: summaries[1].clone(),
                source_pages,
                insert_after_page,
                output_pages: 0,
                blockers,
                output_digest: None,
                output_bytes: 0,
                structural_reparse_verified: false,
                text_order_verified: false,
                page_geometry_verified: false,
                sources_unchanged,
                page_mapping: Vec::new(),
            },
            None,
        ));
    }

    let base_pages = summaries[0].pages;
    let source_page_count = summaries[1].pages;
    validate_pdf_insert_plan(
        base_pages,
        source_page_count,
        &source_pages,
        insert_after_page,
    )?;
    let boundary = insert_after_page as usize;
    let mut sequence = Vec::with_capacity(base_pages + source_pages.len());
    sequence.extend((1..=boundary).map(|page| (0, page as u32)));
    sequence.extend(source_pages.iter().copied().map(|page| (1, page)));
    sequence.extend(((boundary + 1)..=base_pages).map(|page| (0, page as u32)));

    let expected_text = sequence
        .iter()
        .map(|(input_index, source_page)| {
            page_text[*input_index]
                .get(source_page.saturating_sub(1) as usize)
                .cloned()
                .unwrap_or_default()
        })
        .collect::<Vec<_>>();
    let (mut output_document, mapping, expected_geometry) =
        compose_pdf_documents(&mut documents, &sequence)?;
    let mut output = Vec::new();
    output_document
        .save_to(&mut output)
        .map_err(|error| format!("隔离 PDF 插页生成失败: {error}"))?;
    if output.len() > MAX_PDF_ISOLATED_OUTPUT_BYTES {
        return Err("插页 PDF 超过 256 MB 输出上限".into());
    }
    let verified =
        Document::load_mem(&output).map_err(|error| format!("插页 PDF 结构复读失败: {error}"))?;
    let verified_pages = verified.get_pages();
    let structural_reparse_verified = verified_pages.len() == sequence.len();
    if !structural_reparse_verified {
        return Err("插页 PDF 复读页数与计划不一致".into());
    }
    let output_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("插页 PDF 文本复读失败: {error}"))?,
        sequence.len(),
    );
    let text_order_verified = output_text == expected_text;
    if !text_order_verified {
        return Err("插页 PDF 文本页序与计划不一致".into());
    }
    let actual_geometry = verified_pages
        .values()
        .map(|page_id| pdf_page_geometry(&verified, *page_id))
        .collect::<Vec<_>>();
    let page_geometry_verified = actual_geometry == expected_geometry;
    if !page_geometry_verified {
        return Err("插页 PDF 页面尺寸或旋转复读不一致".into());
    }
    let page_mapping = mapping
        .into_iter()
        .map(|item| PdfInsertPageMapping {
            output_page: item.output_page,
            source_kind: if item.input_index == 1 {
                "base".into()
            } else {
                "insert".into()
            },
            source_page: item.source_page,
        })
        .collect();
    Ok((
        PdfIsolatedInsertReport {
            status: "isolated_verified".into(),
            engine: "lopdf 0.42.0 (MIT)".into(),
            base: summaries[0].clone(),
            source: summaries[1].clone(),
            source_pages,
            insert_after_page,
            output_pages: sequence.len(),
            blockers: Vec::new(),
            output_digest: Some(format!("{:x}", Sha256::digest(&output))),
            output_bytes: output.len(),
            structural_reparse_verified,
            text_order_verified,
            page_geometry_verified,
            sources_unchanged,
            page_mapping,
        },
        Some(output),
    ))
}

fn apply_pdf_page_plan(
    document: &mut Document,
    plan: &[PdfPagePlanItem],
) -> Result<Vec<PdfIsolatedPageMapping>, String> {
    let source_pages = document.get_pages();
    let desired: Vec<(PdfPagePlanItem, ObjectId, Vec<(&'static [u8], Object)>)> = plan
        .iter()
        .filter(|item| !item.removed)
        .map(|item| {
            let page_id = source_pages
                .get(&item.source_page)
                .copied()
                .ok_or_else(|| format!("源第 {} 页不存在", item.source_page))?;
            let inherited = [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"]
                .into_iter()
                .filter_map(|key| {
                    inherited_page_value(document, page_id, key).map(|value| (key, value))
                })
                .collect();
            Ok((item.clone(), page_id, inherited))
        })
        .collect::<Result<_, String>>()?;
    let pages_id = document.new_object_id();
    for (item, page_id, inherited) in &desired {
        let original_rotation = inherited
            .iter()
            .find(|(key, _)| *key == b"Rotate")
            .and_then(|(_, value)| value.as_i64().ok())
            .unwrap_or(0);
        let page = document
            .get_dictionary_mut(*page_id)
            .map_err(|error| format!("读取源第 {} 页失败: {error}", item.source_page))?;
        for (key, value) in inherited {
            if !page.has(key) {
                page.set(*key, value.clone());
            }
        }
        page.set("Parent", Object::Reference(pages_id));
        page.set(
            "Rotate",
            Object::Integer(normalized_rotation(original_rotation + item.rotation as i64) as i64),
        );
    }
    let kids: Vec<Object> = desired
        .iter()
        .map(|(_, page_id, _)| Object::Reference(*page_id))
        .collect();
    document.objects.insert(
        pages_id,
        Object::Dictionary(dictionary! {
            "Type" => "Pages",
            "Kids" => kids,
            "Count" => desired.len() as i64,
        }),
    );
    document
        .catalog_mut()
        .map_err(|error| format!("PDF Catalog 无效: {error}"))?
        .set("Pages", Object::Reference(pages_id));
    document.prune_objects();
    Ok(desired
        .iter()
        .enumerate()
        .map(|(index, (item, _, _))| PdfIsolatedPageMapping {
            output_page: index as u32 + 1,
            source_page: item.source_page,
            rotation: item.rotation,
        })
        .collect())
}

fn build_pdf_page_plan_isolated(
    pdf_path: &Path,
    expected_signature: &str,
    plan: Vec<PdfPagePlanItem>,
) -> Result<(PdfIsolatedPagePlanReport, Option<Vec<u8>>), String> {
    let metadata = pdf_path
        .metadata()
        .map_err(|error| format!("读取 PDF 元数据失败: {error}"))?;
    validate_pdf_size(metadata.len())?;
    if metadata.len() > MAX_PDF_ISOLATED_INPUT_BYTES {
        return Err("隔离页面操作目前只支持不超过 128 MB 的 PDF".into());
    }
    let actual_signature = pdf_signature(&metadata);
    if actual_signature != expected_signature {
        return Err("PDF 已被外部修改，请重新打开后再验证页面计划".into());
    }
    let source = fs::read(pdf_path).map_err(|error| format!("读取 PDF 失败: {error}"))?;
    let source_digest = format!("{:x}", Sha256::digest(&source));
    let mut document =
        Document::load_mem(&source).map_err(|error| format!("PDF 结构解析失败: {error}"))?;
    let source_pages = document.get_pages().len();
    let compatibility = pdf_compatibility_profile(&document);
    if document.is_encrypted() {
        return Ok((
            PdfIsolatedPagePlanReport {
                status: "blocked".into(),
                engine: "lopdf 0.42.0 (MIT)".into(),
                source_signature: actual_signature,
                source_pages,
                output_pages: 0,
                rotated_pages: 0,
                reordered: false,
                removed_pages: 0,
                blockers: vec!["encrypted_pdf_unverified".into()],
                source_digest,
                output_digest: None,
                output_bytes: 0,
                structural_reparse_verified: false,
                text_order_verified: false,
                source_unchanged: true,
                page_mapping: Vec::new(),
                compatibility,
            },
            None,
        ));
    }
    validate_pdf_page_plan(&plan, source_pages)?;
    let mut compatibility = compatibility;
    let desired_source_pages: Vec<u32> = plan
        .iter()
        .filter(|item| !item.removed)
        .map(|item| item.source_page)
        .collect();
    let reordered = desired_source_pages != (1..=source_pages as u32).collect::<Vec<_>>();
    let removed_pages = plan.iter().filter(|item| item.removed).count();
    let rotated_pages = plan
        .iter()
        .filter(|item| !item.removed && item.rotation != 0)
        .count();
    let structural_change = reordered || removed_pages > 0;
    let blockers = pdf_plan_blockers(&document, structural_change);
    let blocked_report = |blockers: Vec<String>| PdfIsolatedPagePlanReport {
        status: "blocked".into(),
        engine: "lopdf 0.42.0 (MIT)".into(),
        source_signature: actual_signature.clone(),
        source_pages,
        output_pages: desired_source_pages.len(),
        rotated_pages,
        reordered,
        removed_pages,
        blockers,
        source_digest: source_digest.clone(),
        output_digest: None,
        output_bytes: 0,
        structural_reparse_verified: false,
        text_order_verified: false,
        source_unchanged: true,
        page_mapping: Vec::new(),
        compatibility: compatibility.clone(),
    };
    if !blockers.is_empty() {
        return Ok((blocked_report(blockers), None));
    }
    let source_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&source)
            .map_err(|error| format!("源 PDF 文本复读失败: {error}"))?,
        source_pages,
    );
    compatibility.textless_pages = Some(
        source_text
            .iter()
            .filter(|page| page.trim().is_empty())
            .count(),
    );
    let mapping = apply_pdf_page_plan(&mut document, &plan)?;
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|error| format!("隔离 PDF 生成失败: {error}"))?;
    if output.len() > MAX_PDF_ISOLATED_OUTPUT_BYTES {
        return Err("隔离 PDF 超过 256 MB 输出上限".into());
    }
    let verified =
        Document::load_mem(&output).map_err(|error| format!("隔离 PDF 结构复读失败: {error}"))?;
    if verified.get_pages().len() != mapping.len() {
        return Err("隔离 PDF 复读页数与页面计划不一致".into());
    }
    let source_verified =
        Document::load_mem(&source).map_err(|error| format!("源 PDF 结构复读失败: {error}"))?;
    let source_verified_pages = source_verified.get_pages();
    let verified_pages = verified.get_pages();
    for mapping_item in &mapping {
        let page_id = verified_pages
            .get(&mapping_item.output_page)
            .copied()
            .ok_or("隔离 PDF 输出页缺失")?;
        let rotation = inherited_page_value(&verified, page_id, b"Rotate")
            .and_then(|value| value.as_i64().ok())
            .map(normalized_rotation)
            .unwrap_or(0);
        let source_page_id = source_verified_pages
            .get(&mapping_item.source_page)
            .copied()
            .ok_or("源 PDF 复读页缺失")?;
        let source_rotation = inherited_page_value(&source_verified, source_page_id, b"Rotate")
            .and_then(|value| value.as_i64().ok())
            .map(normalized_rotation)
            .unwrap_or(0);
        if rotation != normalized_rotation(source_rotation as i64 + mapping_item.rotation as i64) {
            return Err(format!(
                "隔离 PDF 第 {} 页旋转复读不一致",
                mapping_item.output_page
            ));
        }
    }
    let output_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("隔离 PDF 文本复读失败: {error}"))?,
        mapping.len(),
    );
    let expected_text: Vec<String> = mapping
        .iter()
        .map(|item| {
            source_text
                .get(item.source_page.saturating_sub(1) as usize)
                .cloned()
                .unwrap_or_default()
        })
        .collect();
    let text_order_verified = output_text == expected_text;
    if !text_order_verified {
        return Err("隔离 PDF 文本页顺序与页面计划不一致".into());
    }
    let source_after = fs::read(pdf_path).map_err(|error| format!("复核源 PDF 失败: {error}"))?;
    let source_unchanged = source_after == source
        && pdf_signature(&pdf_path.metadata().map_err(|e| e.to_string())?) == actual_signature;
    if !source_unchanged {
        return Err("隔离页面操作意外改变了源 PDF".into());
    }
    let report = PdfIsolatedPagePlanReport {
        status: "isolated_verified".into(),
        engine: "lopdf 0.42.0 (MIT)".into(),
        source_signature: actual_signature,
        source_pages,
        output_pages: mapping.len(),
        rotated_pages,
        reordered,
        removed_pages,
        blockers: Vec::new(),
        source_digest,
        output_digest: Some(format!("{:x}", Sha256::digest(&output))),
        output_bytes: output.len(),
        structural_reparse_verified: true,
        text_order_verified,
        source_unchanged,
        page_mapping: mapping,
        compatibility,
    };
    Ok((report, Some(output)))
}

fn validate_pdf_copy_file_name(file_name: &str) -> Result<String, String> {
    let file_name = file_name.trim();
    if file_name.is_empty() || file_name.chars().count() > 180 {
        return Err("副本文件名必须为 1～180 个字符".into());
    }
    if file_name.chars().any(|value| {
        value.is_control() || matches!(value, '/' | '\\' | '<' | '>' | ':' | '"' | '|' | '?' | '*')
    }) || file_name.ends_with(' ')
        || file_name.ends_with('.')
    {
        return Err("副本文件名包含路径、控制字符或 Windows 不允许的字符".into());
    }
    let path = Path::new(file_name);
    if !path
        .extension()
        .and_then(|value| value.to_str())
        .is_some_and(|value| value.eq_ignore_ascii_case("pdf"))
        || path.file_stem().is_none_or(|value| value.is_empty())
    {
        return Err("副本文件名必须以 .pdf 结尾".into());
    }
    Ok(file_name.to_string())
}

fn save_pdf_page_plan_copy_to_path(
    source_path: &Path,
    target_path: &Path,
    expected_signature: &str,
    expected_output_digest: &str,
    plan: Vec<PdfPagePlanItem>,
) -> Result<PdfSavedPagePlanReport, String> {
    if target_path == source_path {
        return Err("可靠另存禁止覆盖源 PDF".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠另存不会覆盖现有文件".into());
    }
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if expected_output_digest.len() != 64
        || !expected_output_digest
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err("隔离验证摘要无效，请重新验证页面计划".into());
    }
    let (isolated_report, output) =
        build_pdf_page_plan_isolated(source_path, expected_signature, plan)?;
    if isolated_report.status != "isolated_verified" {
        return Err(format!(
            "页面计划包含尚未验证的 PDF 特性：{}",
            isolated_report.blockers.join(", ")
        ));
    }
    let output = output.ok_or("隔离验证未生成可保存字节")?;
    let actual_output_digest = isolated_report
        .output_digest
        .as_deref()
        .ok_or("隔离验证缺少输出摘要")?;
    if actual_output_digest != expected_output_digest {
        return Err("页面计划或隔离输出已变化，请重新验证后再另存".into());
    }
    let expected_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("保存前文本复读失败: {error}"))?,
        isolated_report.output_pages,
    );
    write_new_bytes(target_path, &output)?;

    let saved = fs::read(target_path)
        .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
    let target_digest = format!("{:x}", Sha256::digest(&saved));
    if saved != output || target_digest != expected_output_digest {
        return Err("目标已创建，但落盘字节与验证副本不一致；请保留文件并人工检查".into());
    }
    let saved_document = Document::load_mem(&saved)
        .map_err(|error| format!("目标已创建，但 PDF 结构复读失败: {error}"))?;
    let structural_reopen_verified =
        saved_document.get_pages().len() == isolated_report.output_pages;
    if !structural_reopen_verified {
        return Err("目标已创建，但重开页数与页面计划不一致".into());
    }
    let saved_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&saved)
            .map_err(|error| format!("目标已创建，但文本复读失败: {error}"))?,
        isolated_report.output_pages,
    );
    let text_reopen_verified = saved_text == expected_text;
    if !text_reopen_verified {
        return Err("目标已创建，但重开文本页序与页面计划不一致".into());
    }
    let source_metadata = source_path
        .metadata()
        .map_err(|error| format!("目标已创建，但源 PDF 元数据复核失败: {error}"))?;
    let source_after =
        fs::read(source_path).map_err(|error| format!("目标已创建，但源 PDF 复核失败: {error}"))?;
    let source_unchanged = pdf_signature(&source_metadata) == expected_signature
        && format!("{:x}", Sha256::digest(&source_after)) == isolated_report.source_digest;
    if !source_unchanged {
        return Err("目标已创建，但检测到源 PDF 同时发生变化；请重新打开源文件".into());
    }
    let target_metadata = target_path
        .metadata()
        .map_err(|error| format!("读取已保存 PDF 元数据失败: {error}"))?;
    Ok(PdfSavedPagePlanReport {
        status: "saved_verified".into(),
        engine: isolated_report.engine,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature: pdf_signature(&target_metadata),
        target_digest,
        source_signature: isolated_report.source_signature,
        source_unchanged,
        output_pages: isolated_report.output_pages,
        output_bytes: saved.len(),
        structural_reopen_verified,
        text_reopen_verified,
    })
}

#[tauri::command]
pub async fn preview_pdf_page_plan_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    plan: Vec<PdfPagePlanItem>,
) -> Result<PdfIsolatedPagePlanReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf_path = guard.resolve_existing_file(path, &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        build_pdf_page_plan_isolated(&pdf_path, &expected_signature, plan).map(|(report, _)| report)
    })
    .await
    .map_err(|error| format!("PDF 隔离页面计划任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pdf_page_range_extract_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    pages: Vec<u32>,
) -> Result<PdfIsolatedPagePlanReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf_path = guard.resolve_existing_file(path, &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        build_pdf_page_range_extract_isolated(&pdf_path, &expected_signature, pages)
            .map(|(report, _)| report)
    })
    .await
    .map_err(|error| format!("PDF 页面提取预览任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_pdf_page_plan_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
    plan: Vec<PdfPagePlanItem>,
) -> Result<PdfSavedPagePlanReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["pdf"])?;
    let target_file_name = validate_pdf_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_pdf_page_plan_copy_to_path(
            &source_path,
            &target_path,
            &expected_signature,
            &expected_output_digest,
            plan,
        )
    })
    .await
    .map_err(|error| format!("PDF 可靠另存任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_pdf_page_range_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
    pages: Vec<u32>,
) -> Result<PdfSavedPagePlanReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let source_path = guard.resolve_existing_file(path, &["pdf"])?;
    let target_file_name = validate_pdf_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(source_path.with_file_name(target_file_name), &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        let plan = pdf_page_range_plan_for_path(&source_path, &expected_signature, &pages)?;
        save_pdf_page_plan_copy_to_path(
            &source_path,
            &target_path,
            &expected_signature,
            &expected_output_digest,
            plan,
        )
    })
    .await
    .map_err(|error| format!("PDF 页面提取可靠另存任务失败: {error}"))?
}

fn save_pdf_merge_copy_to_path(
    resolved_inputs: Vec<(PathBuf, String)>,
    target_path: &Path,
    expected_output_digest: &str,
) -> Result<PdfSavedMergeReport, String> {
    if resolved_inputs.iter().any(|(path, _)| path == target_path) {
        return Err("可靠合并禁止覆盖任一源 PDF".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠合并不会覆盖现有文件".into());
    }
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if expected_output_digest.len() != 64
        || !expected_output_digest
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err("隔离合并摘要无效，请重新验证输入顺序".into());
    }
    let (report, output) = build_pdf_merge_isolated(resolved_inputs.clone())?;
    if report.status != "isolated_verified" {
        return Err(format!(
            "合并输入包含尚未验证的 PDF 特性：{}",
            report.blockers.join(", ")
        ));
    }
    let output = output.ok_or("隔离合并未生成可保存字节")?;
    if report.output_digest.as_deref() != Some(expected_output_digest.as_str()) {
        return Err("PDF 输入、顺序或隔离输出已变化，请重新验证后再保存".into());
    }
    write_new_bytes(target_path, &output)?;
    let saved = fs::read(target_path)
        .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
    let target_digest = format!("{:x}", Sha256::digest(&saved));
    if saved != output || target_digest != expected_output_digest {
        return Err("目标已创建，但落盘字节与验证合并副本不一致；请保留文件并人工检查".into());
    }
    let saved_document = Document::load_mem(&saved)
        .map_err(|error| format!("目标已创建，但合并 PDF 结构复读失败: {error}"))?;
    let structural_reopen_verified = saved_document.get_pages().len() == report.output_pages;
    if !structural_reopen_verified {
        return Err("目标已创建，但重开页数与合并计划不一致".into());
    }
    let saved_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&saved)
            .map_err(|error| format!("目标已创建，但合并文本复读失败: {error}"))?,
        report.output_pages,
    );
    let rebuilt_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("保存前合并文本复读失败: {error}"))?,
        report.output_pages,
    );
    let text_reopen_verified = saved_text == rebuilt_text;
    if !text_reopen_verified {
        return Err("目标已创建，但重开文本页序与合并计划不一致".into());
    }
    let saved_geometry = saved_document
        .get_pages()
        .values()
        .map(|page_id| pdf_page_geometry(&saved_document, *page_id))
        .collect::<Vec<_>>();
    let output_document =
        Document::load_mem(&output).map_err(|error| format!("保存前合并结构复读失败: {error}"))?;
    let output_geometry = output_document
        .get_pages()
        .values()
        .map(|page_id| pdf_page_geometry(&output_document, *page_id))
        .collect::<Vec<_>>();
    let page_geometry_verified = saved_geometry == output_geometry;
    if !page_geometry_verified {
        return Err("目标已创建，但重开页面尺寸或旋转不一致".into());
    }
    let sources_unchanged =
        resolved_inputs
            .iter()
            .zip(&report.inputs)
            .all(|((path, signature), input)| {
                path.metadata().is_ok_and(|metadata| {
                    pdf_signature(&metadata) == *signature
                        && fs::read(path).is_ok_and(|bytes| {
                            format!("{:x}", Sha256::digest(bytes)) == input.digest
                        })
                })
            });
    if !sources_unchanged {
        return Err("目标已创建，但检测到合并输入同时发生变化；请重新检查源文件".into());
    }
    let target_metadata = target_path
        .metadata()
        .map_err(|error| format!("读取已保存合并 PDF 元数据失败: {error}"))?;
    Ok(PdfSavedMergeReport {
        status: "saved_verified".into(),
        engine: report.engine,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature: pdf_signature(&target_metadata),
        target_digest,
        sources_unchanged,
        input_count: report.inputs.len(),
        output_pages: report.output_pages,
        output_bytes: saved.len(),
        structural_reopen_verified,
        text_reopen_verified,
        page_geometry_verified,
    })
}

fn save_pdf_insert_copy_to_path(
    resolved_inputs: Vec<(PathBuf, String)>,
    target_path: &Path,
    expected_output_digest: &str,
    source_pages: Vec<u32>,
    insert_after_page: u32,
) -> Result<PdfSavedInsertReport, String> {
    if resolved_inputs.iter().any(|(path, _)| path == target_path) {
        return Err("可靠插页禁止覆盖当前或来源 PDF".into());
    }
    if target_path.exists() {
        return Err("目标文件已存在；可靠插页不会覆盖现有文件".into());
    }
    let expected_output_digest = expected_output_digest.trim().to_ascii_lowercase();
    if expected_output_digest.len() != 64
        || !expected_output_digest
            .bytes()
            .all(|value| value.is_ascii_hexdigit())
    {
        return Err("隔离插页摘要无效，请重新验证插入计划".into());
    }
    let (report, output) =
        build_pdf_insert_isolated(resolved_inputs.clone(), source_pages, insert_after_page)?;
    if report.status != "isolated_verified" {
        return Err(format!(
            "插页输入包含尚未验证的 PDF 特性：{}",
            report.blockers.join(", ")
        ));
    }
    let output = output.ok_or("隔离插页未生成可保存字节")?;
    if report.output_digest.as_deref() != Some(expected_output_digest.as_str()) {
        return Err("PDF 插入范围、位置或隔离输出已变化，请重新验证后再保存".into());
    }
    write_new_bytes(target_path, &output)?;
    let saved = fs::read(target_path)
        .map_err(|error| format!("目标已创建，但无法复读保存字节: {error}"))?;
    let target_digest = format!("{:x}", Sha256::digest(&saved));
    if saved != output || target_digest != expected_output_digest {
        return Err("目标已创建，但落盘字节与验证插页副本不一致；请保留文件并人工检查".into());
    }
    let saved_document = Document::load_mem(&saved)
        .map_err(|error| format!("目标已创建，但插页 PDF 结构复读失败: {error}"))?;
    let structural_reopen_verified = saved_document.get_pages().len() == report.output_pages;
    if !structural_reopen_verified {
        return Err("目标已创建，但重开页数与插页计划不一致".into());
    }
    let saved_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&saved)
            .map_err(|error| format!("目标已创建，但插页文本复读失败: {error}"))?,
        report.output_pages,
    );
    let rebuilt_text = normalized_pdf_page_text(
        pdf_extract::extract_text_from_mem_by_pages(&output)
            .map_err(|error| format!("保存前插页文本复读失败: {error}"))?,
        report.output_pages,
    );
    let text_reopen_verified = saved_text == rebuilt_text;
    if !text_reopen_verified {
        return Err("目标已创建，但重开文本页序与插页计划不一致".into());
    }
    let saved_geometry = saved_document
        .get_pages()
        .values()
        .map(|page_id| pdf_page_geometry(&saved_document, *page_id))
        .collect::<Vec<_>>();
    let output_document =
        Document::load_mem(&output).map_err(|error| format!("保存前插页结构复读失败: {error}"))?;
    let output_geometry = output_document
        .get_pages()
        .values()
        .map(|page_id| pdf_page_geometry(&output_document, *page_id))
        .collect::<Vec<_>>();
    let page_geometry_verified = saved_geometry == output_geometry;
    if !page_geometry_verified {
        return Err("目标已创建，但重开页面尺寸或旋转不一致".into());
    }
    let summaries = [&report.base, &report.source];
    let sources_unchanged =
        resolved_inputs
            .iter()
            .zip(summaries)
            .all(|((path, signature), input)| {
                path.metadata().is_ok_and(|metadata| {
                    pdf_signature(&metadata) == *signature
                        && fs::read(path).is_ok_and(|bytes| {
                            format!("{:x}", Sha256::digest(bytes)) == input.digest
                        })
                })
            });
    if !sources_unchanged {
        return Err("目标已创建，但检测到插页输入同时发生变化；请重新检查源文件".into());
    }
    let target_metadata = target_path
        .metadata()
        .map_err(|error| format!("读取已保存插页 PDF 元数据失败: {error}"))?;
    Ok(PdfSavedInsertReport {
        status: "saved_verified".into(),
        engine: report.engine,
        target_path: target_path.to_string_lossy().into_owned(),
        target_signature: pdf_signature(&target_metadata),
        target_digest,
        sources_unchanged,
        inserted_pages: report.source_pages.len(),
        insert_after_page: report.insert_after_page,
        output_pages: report.output_pages,
        output_bytes: saved.len(),
        structural_reopen_verified,
        text_reopen_verified,
        page_geometry_verified,
    })
}

#[tauri::command]
pub async fn preview_pdf_merge_isolated_copy(
    library_root: String,
    inputs: Vec<PdfMergeInputRequest>,
) -> Result<PdfIsolatedMergeReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let resolved_inputs = resolve_pdf_merge_inputs(&guard, inputs)?;
    tauri::async_runtime::spawn_blocking(move || {
        build_pdf_merge_isolated(resolved_inputs).map(|(report, _)| report)
    })
    .await
    .map_err(|error| format!("PDF 隔离合并任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_pdf_merge_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_output_digest: String,
    inputs: Vec<PdfMergeInputRequest>,
) -> Result<PdfSavedMergeReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let anchor_path = guard.resolve_existing_file(path, &["pdf"])?;
    let resolved_inputs = resolve_pdf_merge_inputs(&guard, inputs)?;
    if !resolved_inputs
        .iter()
        .any(|(input_path, _)| input_path == &anchor_path)
    {
        return Err("PDF 合并输入必须包含当前打开的文件".into());
    }
    let target_file_name = validate_pdf_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(anchor_path.with_file_name(target_file_name), &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_pdf_merge_copy_to_path(resolved_inputs, &target_path, &expected_output_digest)
    })
    .await
    .map_err(|error| format!("PDF 合并可靠保存任务失败: {error}"))?
}

#[tauri::command]
pub async fn preview_pdf_insert_isolated_copy(
    library_root: String,
    path: String,
    expected_signature: String,
    source_path: String,
    source_expected_signature: String,
    source_pages: Vec<u32>,
    insert_after_page: u32,
) -> Result<PdfIsolatedInsertReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let resolved_inputs = resolve_pdf_merge_inputs(
        &guard,
        vec![
            PdfMergeInputRequest {
                path,
                expected_signature,
            },
            PdfMergeInputRequest {
                path: source_path,
                expected_signature: source_expected_signature,
            },
        ],
    )?;
    tauri::async_runtime::spawn_blocking(move || {
        build_pdf_insert_isolated(resolved_inputs, source_pages, insert_after_page)
            .map(|(report, _)| report)
    })
    .await
    .map_err(|error| format!("PDF 隔离插页任务失败: {error}"))?
}

#[tauri::command]
pub async fn save_pdf_insert_copy(
    library_root: String,
    path: String,
    target_file_name: String,
    expected_signature: String,
    expected_output_digest: String,
    source_path: String,
    source_expected_signature: String,
    source_pages: Vec<u32>,
    insert_after_page: u32,
) -> Result<PdfSavedInsertReport, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let base_path = guard.resolve_existing_file(&path, &["pdf"])?;
    let resolved_inputs = resolve_pdf_merge_inputs(
        &guard,
        vec![
            PdfMergeInputRequest {
                path,
                expected_signature,
            },
            PdfMergeInputRequest {
                path: source_path,
                expected_signature: source_expected_signature,
            },
        ],
    )?;
    if resolved_inputs[0].0 != base_path {
        return Err("PDF 插页当前文件解析不一致".into());
    }
    let target_file_name = validate_pdf_copy_file_name(&target_file_name)?;
    let target_path =
        guard.resolve_file_for_write(base_path.with_file_name(target_file_name), &["pdf"])?;
    tauri::async_runtime::spawn_blocking(move || {
        save_pdf_insert_copy_to_path(
            resolved_inputs,
            &target_path,
            &expected_output_digest,
            source_pages,
            insert_after_page,
        )
    })
    .await
    .map_err(|error| format!("PDF 插页可靠保存任务失败: {error}"))?
}

fn annotation_path(pdf_path: &Path) -> Result<PathBuf, String> {
    let name = pdf_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("PDF 文件名无效")?;
    Ok(pdf_path.with_file_name(format!("{}.annotations.json", name)))
}

pub(crate) fn ocr_path(pdf_path: &Path) -> Result<PathBuf, String> {
    let name = pdf_path
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("PDF 文件名无效")?;
    Ok(pdf_path.with_file_name(format!("{}.ocr.json", name)))
}

fn ocr_source(pdf_path: &Path, fingerprint: Option<String>) -> Result<PdfOcrSource, String> {
    let metadata = pdf_path
        .metadata()
        .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    Ok(PdfOcrSource {
        pdf_file: pdf_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("PDF 文件名无效")?
            .to_string(),
        size: metadata.len(),
        modified_at,
        fingerprint,
    })
}

#[tauri::command]
pub async fn read_pdf_ocr(
    library_root: String,
    pdf_path: String,
) -> Result<PdfOcrDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf = guard.resolve_existing_file(pdf_path, &["pdf"])?;
    let path = ocr_path(&pdf)?;
    recover_interrupted_write(&path)?;
    if !path.exists() {
        return Ok(PdfOcrDocument::empty(ocr_source(&pdf, None)?));
    }
    if path.metadata().map_err(|error| error.to_string())?.len() > MAX_OCR_SIDECAR_BYTES {
        return Err("PDF OCR sidecar 超过 24 MB 上限".into());
    }
    let content = fs::read_to_string(&path)
        .map_err(|error| format!("读取 PDF OCR sidecar 失败: {}", error))?;
    let document: PdfOcrDocument = serde_json::from_str(&content)
        .map_err(|error| format!("PDF OCR sidecar JSON 损坏: {}", error))?;
    validate_pdf_ocr(&document)?;
    if document.source.pdf_file != ocr_source(&pdf, None)?.pdf_file {
        return Err("PDF OCR sidecar 与当前 PDF 不匹配".into());
    }
    Ok(document)
}

#[tauri::command]
pub async fn write_pdf_ocr(
    library_root: String,
    pdf_path: String,
    mut document: PdfOcrDocument,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf = guard.resolve_existing_file(pdf_path, &["pdf"])?;
    let fingerprint = document.source.fingerprint.take();
    document.source = ocr_source(&pdf, fingerprint)?;
    document.pages.sort_by_key(|page| page.page);
    validate_pdf_ocr(&document)?;
    let content = serde_json::to_string_pretty(&document).map_err(|error| error.to_string())?;
    if content.len() as u64 > MAX_OCR_SIDECAR_BYTES {
        return Err("PDF OCR sidecar 超过 24 MB 上限".into());
    }
    write_utf8(ocr_path(&pdf)?, &format!("{}\n", content))
}

fn annotation_source(
    pdf_path: &Path,
    fingerprint: Option<String>,
) -> Result<PdfAnnotationSource, String> {
    let metadata = pdf_path
        .metadata()
        .map_err(|error| format!("读取 PDF 元数据失败: {}", error))?;
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|value| value.as_secs())
        .unwrap_or(0);
    Ok(PdfAnnotationSource {
        pdf_file: pdf_path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or("PDF 文件名无效")?
            .to_string(),
        size: metadata.len(),
        modified_at,
        fingerprint,
    })
}

#[tauri::command]
pub async fn read_pdf_annotations(
    library_root: String,
    pdf_path: String,
) -> Result<PdfAnnotationDocument, String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf = guard.resolve_existing_file(pdf_path, &["pdf"])?;
    let path = annotation_path(&pdf)?;
    recover_interrupted_write(&path)?;
    if !path.exists() {
        return Ok(PdfAnnotationDocument::empty(annotation_source(&pdf, None)?));
    }
    let size = path.metadata().map_err(|error| error.to_string())?.len();
    if size > MAX_ANNOTATION_FILE_BYTES {
        return Err("PDF 批注文件超过 5 MB 上限".into());
    }
    let content =
        fs::read_to_string(&path).map_err(|error| format!("读取 PDF 批注失败: {}", error))?;
    let document: PdfAnnotationDocument =
        serde_json::from_str(&content).map_err(|error| format!("PDF 批注 JSON 损坏: {}", error))?;
    validate_pdf_annotations(&document)?;
    if document.source.pdf_file != annotation_source(&pdf, None)?.pdf_file {
        return Err("PDF 批注源文件与当前 PDF 不匹配".into());
    }
    Ok(document)
}

#[tauri::command]
pub async fn write_pdf_annotations(
    library_root: String,
    pdf_path: String,
    mut document: PdfAnnotationDocument,
) -> Result<(), String> {
    let guard = WorkspaceGuard::new(library_root)?;
    let pdf = guard.resolve_existing_file(pdf_path, &["pdf"])?;
    let fingerprint = document.source.fingerprint.take();
    document.source = annotation_source(&pdf, fingerprint)?;
    validate_pdf_annotations(&document)?;
    let content = serde_json::to_string_pretty(&document).map_err(|error| error.to_string())?;
    if content.len() as u64 > MAX_ANNOTATION_FILE_BYTES {
        return Err("PDF 批注文件超过 5 MB 上限".into());
    }
    write_utf8(annotation_path(&pdf)?, &format!("{}\n", content))
}

#[tauri::command]
pub async fn build_pdf_annotation_reference(
    library_root: String,
    pdf_path: String,
    annotation_id: String,
) -> Result<PdfAnnotationReference, String> {
    let guard = WorkspaceGuard::new(library_root.clone())?;
    let pdf = guard.resolve_existing_file(pdf_path.clone(), &["pdf"])?;
    let relative_path = pdf
        .strip_prefix(guard.root())
        .map_err(|_| "PDF 不在当前知识库内")?
        .to_string_lossy()
        .replace('\\', "/");
    let document = read_pdf_annotations(library_root, pdf_path).await?;
    let annotation = document
        .annotations
        .iter()
        .find(|item| item.id == annotation_id)
        .ok_or("PDF 批注不存在或已被删除")?;
    let uri = format!(
        "longedit://pdf?path={}&page={}&annotation={}",
        encode_uri_component(&relative_path),
        annotation.page,
        encode_uri_component(&annotation.id)
    );
    let kind = match annotation.kind {
        PdfAnnotationKind::Highlight => "高亮",
        PdfAnnotationKind::Area => "区域批注",
        PdfAnnotationKind::Comment => "页评论",
    };
    let pdf_name = pdf
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or("PDF 文件名无效")?;
    let label = format!("{} · 第 {} 页 · {}", pdf_name, annotation.page, kind);
    let excerpt = reference_excerpt(if annotation.quote.trim().is_empty() {
        &annotation.comment
    } else {
        &annotation.quote
    });
    let source_link = format!("[来源：{}]({})", markdown_label(&label), uri);
    let markdown = if excerpt.is_empty() {
        source_link
    } else {
        format!("> {}\n>\n> {}", excerpt.replace('\n', "\n> "), source_link)
    };
    Ok(PdfAnnotationReference {
        uri,
        markdown,
        label,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::formats::pdf_annotations::{PdfAnnotation, PdfAnnotationKind, PdfAnnotationRect};
    use crate::formats::pdf_ocr::PdfOcrPage;
    use lopdf::{EncryptionState, EncryptionVersion, Permissions, Stream, StringFormat};
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn external_pdf_format_gate_rejects_other_preview_formats() {
        assert!(ensure_pdf_format(Path::new("document.pdf")).is_ok());
        assert!(ensure_pdf_format(Path::new("photo.png")).is_err());
        assert!(ensure_pdf_format(Path::new("clip.mp4")).is_err());
    }

    struct TestWorkspace {
        base: PathBuf,
        root: PathBuf,
    }
    impl TestWorkspace {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let base = std::env::temp_dir().join(format!(
                "longedit-pdf-test-{}-{}",
                std::process::id(),
                nonce
            ));
            let root = base.join("library");
            fs::create_dir_all(&root).unwrap();
            Self { base, root }
        }
        fn root_string(&self) -> String {
            self.root.to_string_lossy().into_owned()
        }
    }
    impl Drop for TestWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.base);
        }
    }

    fn write_two_page_pdf(path: &Path) -> Vec<u8> {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let resources_id = document.add_object(dictionary! {
            "Font" => dictionary! { "F1" => Object::Reference(font_id) },
        });
        let mut page_ids = Vec::new();
        for text in ["First Page Alpha", "Second Page Beta"] {
            let content = format!("BT /F1 12 Tf 40 250 Td ({text}) Tj ET");
            let content_id =
                document.add_object(Stream::new(Dictionary::new(), content.into_bytes()));
            let page_id = document.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 300.into(), 300.into()],
                "Resources" => Object::Reference(resources_id),
                "Contents" => Object::Reference(content_id),
            });
            page_ids.push(page_id);
        }
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
                "Count" => page_ids.len() as i64,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        document.trailer.set(
            "TestMarker",
            Object::String(b"isolated".to_vec(), StringFormat::Literal),
        );
        document.compress();
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        fs::write(path, &bytes).unwrap();
        bytes
    }

    fn write_single_page_pdf(
        path: &Path,
        text: &str,
        width: i64,
        height: i64,
        rotation: i64,
    ) -> Vec<u8> {
        let mut document = Document::with_version("1.6");
        let pages_id = document.new_object_id();
        let font_id = document.add_object(dictionary! {
            "Type" => "Font",
            "Subtype" => "Type1",
            "BaseFont" => "Helvetica",
        });
        let resources_id = document.add_object(dictionary! {
            "Font" => dictionary! { "F1" => Object::Reference(font_id) },
        });
        let content_id = document.add_object(Stream::new(
            Dictionary::new(),
            format!("BT /F1 12 Tf 40 250 Td ({text}) Tj ET").into_bytes(),
        ));
        let page_id = document.add_object(dictionary! {
            "Type" => "Page",
            "Parent" => Object::Reference(pages_id),
            "MediaBox" => vec![0.into(), 0.into(), width.into(), height.into()],
            "Resources" => Object::Reference(resources_id),
            "Contents" => Object::Reference(content_id),
            "Rotate" => rotation,
        });
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => vec![Object::Reference(page_id)],
                "Count" => 1,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        fs::write(path, &bytes).unwrap();
        bytes
    }

    fn set_pdf_producer(document: &mut Document, producer: &str) {
        let info_id = document.add_object(dictionary! {
            "Producer" => Object::String(producer.as_bytes().to_vec(), StringFormat::Literal),
        });
        document.trailer.set("Info", Object::Reference(info_id));
    }

    fn write_scan_pdf(path: &Path) -> Vec<u8> {
        let mut document = Document::with_version("1.7");
        let pages_id = document.new_object_id();
        let image_id = document.add_object(Stream::new(
            dictionary! {
                "Type" => "XObject",
                "Subtype" => "Image",
                "Width" => 1,
                "Height" => 1,
                "ColorSpace" => "DeviceGray",
                "BitsPerComponent" => 8,
            },
            vec![128],
        ));
        let resources_id = document.add_object(dictionary! {
            "XObject" => dictionary! { "Im1" => Object::Reference(image_id) },
        });
        let mut page_ids = Vec::new();
        for _ in 0..2 {
            let content_id = document.add_object(Stream::new(
                Dictionary::new(),
                b"q 200 0 0 100 0 0 cm /Im1 Do Q".to_vec(),
            ));
            page_ids.push(document.add_object(dictionary! {
                "Type" => "Page",
                "Parent" => Object::Reference(pages_id),
                "MediaBox" => vec![0.into(), 0.into(), 400.into(), 200.into()],
                "Resources" => Object::Reference(resources_id),
                "Contents" => Object::Reference(content_id),
            }));
        }
        document.objects.insert(
            pages_id,
            Object::Dictionary(dictionary! {
                "Type" => "Pages",
                "Kids" => page_ids.iter().copied().map(Object::Reference).collect::<Vec<_>>(),
                "Count" => page_ids.len() as i64,
            }),
        );
        let catalog_id = document.add_object(dictionary! {
            "Type" => "Catalog",
            "Pages" => Object::Reference(pages_id),
        });
        document.trailer.set("Root", Object::Reference(catalog_id));
        set_pdf_producer(&mut document, "LongEdit Scan Fixture");
        let mut bytes = Vec::new();
        document.save_to(&mut bytes).unwrap();
        fs::write(path, &bytes).unwrap();
        bytes
    }

    fn pdf_plan(source_pages: &[(u32, i16, bool)]) -> Vec<PdfPagePlanItem> {
        source_pages
            .iter()
            .map(|(source_page, rotation, removed)| PdfPagePlanItem {
                source_page: *source_page,
                rotation: *rotation,
                removed: *removed,
            })
            .collect()
    }

    #[test]
    fn b2a_page_range_plan_preserves_requested_order_and_rejects_invalid_ranges() {
        let plan = pdf_page_range_plan(5, &[2, 4, 5]).unwrap();
        assert_eq!(
            plan.iter()
                .map(|item| (item.source_page, item.removed))
                .collect::<Vec<_>>(),
            vec![(2, false), (4, false), (5, false), (1, true), (3, true)]
        );
        assert!(pdf_page_range_plan(5, &[]).is_err());
        assert!(pdf_page_range_plan(5, &[2, 2]).is_err());
        assert!(pdf_page_range_plan(5, &[0]).is_err());
        assert!(pdf_page_range_plan(5, &[6]).is_err());
        assert!(pdf_page_range_plan(5, &[1, 2, 3, 4, 5]).is_err());
    }

    #[test]
    fn b2a_extracts_selected_pages_to_verified_copy_without_touching_source() {
        let workspace = TestWorkspace::new();
        let source = workspace.root.join("source.pdf");
        let original = write_two_page_pdf(&source);
        let signature = pdf_signature(&source.metadata().unwrap());
        let (preview, output) =
            build_pdf_page_range_extract_isolated(&source, &signature, vec![2]).unwrap();
        let output = output.expect("verified extraction must produce isolated bytes");
        assert_eq!(preview.status, "isolated_verified");
        assert_eq!(preview.source_pages, 2);
        assert_eq!(preview.output_pages, 1);
        assert_eq!(preview.removed_pages, 1);
        assert_eq!(preview.page_mapping[0].source_page, 2);
        assert!(preview.source_unchanged);
        assert!(pdf_extract::extract_text_from_mem(&output)
            .unwrap()
            .contains("Second Page Beta"));

        let target = workspace.root.join("source-extracted.pdf");
        let saved = save_pdf_page_plan_copy_to_path(
            &source,
            &target,
            &signature,
            preview.output_digest.as_deref().unwrap(),
            pdf_page_range_plan(2, &[2]).unwrap(),
        )
        .unwrap();
        assert_eq!(saved.output_pages, 1);
        assert!(saved.structural_reopen_verified);
        assert!(saved.text_reopen_verified);
        assert!(saved.source_unchanged);
        assert_eq!(fs::read(&source).unwrap(), original);
        assert!(save_pdf_page_plan_copy_to_path(
            &source,
            &target,
            &signature,
            &saved.target_digest,
            pdf_page_range_plan(2, &[2]).unwrap(),
        )
        .unwrap_err()
        .contains("不会覆盖"));
    }

    #[test]
    fn b2b_merges_ordered_inputs_to_verified_copy_without_touching_sources() {
        let workspace = TestWorkspace::new();
        let first = workspace.root.join("first.pdf");
        let second = workspace.root.join("second.pdf");
        let first_bytes = write_two_page_pdf(&first);
        let second_bytes = write_single_page_pdf(&second, "Merge Gamma", 420, 240, 90);
        let first_signature = pdf_signature(&first.metadata().unwrap());
        let second_signature = pdf_signature(&second.metadata().unwrap());
        let inputs = vec![
            (second.clone(), second_signature.clone()),
            (first.clone(), first_signature.clone()),
        ];

        let (preview, output) = build_pdf_merge_isolated(inputs.clone()).unwrap();
        let output = output.expect("verified merge must produce isolated bytes");
        assert_eq!(preview.status, "isolated_verified");
        assert_eq!(preview.inputs.len(), 2);
        assert_eq!(preview.output_pages, 3);
        assert!(preview.structural_reparse_verified);
        assert!(preview.text_order_verified);
        assert!(preview.page_geometry_verified);
        assert!(preview.sources_unchanged);
        assert_eq!(
            preview
                .page_mapping
                .iter()
                .map(|item| (item.output_page, item.input_index, item.source_page))
                .collect::<Vec<_>>(),
            vec![(1, 1, 1), (2, 2, 1), (3, 2, 2)]
        );
        let output_text = pdf_extract::extract_text_from_mem_by_pages(&output).unwrap();
        assert!(output_text[0].contains("Merge Gamma"));
        assert!(output_text[1].contains("First Page Alpha"));
        assert!(output_text[2].contains("Second Page Beta"));

        let target = workspace.root.join("merged.pdf");
        let saved =
            save_pdf_merge_copy_to_path(inputs, &target, preview.output_digest.as_deref().unwrap())
                .unwrap();
        assert_eq!(saved.input_count, 2);
        assert_eq!(saved.output_pages, 3);
        assert!(saved.structural_reopen_verified);
        assert!(saved.text_reopen_verified);
        assert!(saved.page_geometry_verified);
        assert!(saved.sources_unchanged);
        assert_eq!(fs::read(&first).unwrap(), first_bytes);
        assert_eq!(fs::read(&second).unwrap(), second_bytes);
        assert!(save_pdf_merge_copy_to_path(
            vec![(second, second_signature), (first, first_signature),],
            &target,
            &saved.target_digest,
        )
        .unwrap_err()
        .contains("不会覆盖"));
    }

    #[test]
    fn b2b_rejects_duplicate_stale_and_encrypted_merge_inputs() {
        let workspace = TestWorkspace::new();
        let first = workspace.root.join("first.pdf");
        let second = workspace.root.join("second.pdf");
        write_two_page_pdf(&first);
        write_single_page_pdf(&second, "Merge Delta", 300, 300, 0);
        let guard = WorkspaceGuard::new(workspace.root_string()).unwrap();
        let first_signature = pdf_signature(&first.metadata().unwrap());
        assert!(resolve_pdf_merge_inputs(
            &guard,
            vec![
                PdfMergeInputRequest {
                    path: first.to_string_lossy().into_owned(),
                    expected_signature: first_signature.clone(),
                },
                PdfMergeInputRequest {
                    path: first.to_string_lossy().into_owned(),
                    expected_signature: first_signature.clone(),
                },
            ],
        )
        .unwrap_err()
        .contains("不能重复"));
        assert!(build_pdf_merge_isolated(vec![
            (first.clone(), "stale".into()),
            (second.clone(), pdf_signature(&second.metadata().unwrap()),),
        ])
        .unwrap_err()
        .contains("外部修改"));

        let encrypted = workspace.root.join("encrypted.pdf");
        write_two_page_pdf(&encrypted);
        let mut encrypted_document = Document::load(&encrypted).unwrap();
        let file_id = Object::String(
            b"longedit-b2b-encrypted-fixture".to_vec(),
            StringFormat::Hexadecimal,
        );
        encrypted_document
            .trailer
            .set("ID", Object::Array(vec![file_id.clone(), file_id]));
        let state = EncryptionState::try_from(EncryptionVersion::V1 {
            document: &encrypted_document,
            owner_password: "owner",
            user_password: "user",
            permissions: Permissions::default(),
        })
        .unwrap();
        encrypted_document.encrypt(&state).unwrap();
        encrypted_document.save(&encrypted).unwrap();
        let (blocked, output) = build_pdf_merge_isolated(vec![
            (first, first_signature),
            (
                encrypted.clone(),
                pdf_signature(&encrypted.metadata().unwrap()),
            ),
        ])
        .unwrap();
        assert_eq!(blocked.status, "blocked");
        assert!(blocked
            .blockers
            .contains(&"input_2:encrypted_pdf_unverified".into()));
        assert!(output.is_none());
    }

    #[test]
    fn b2c_inserts_selected_source_pages_at_verified_boundary_without_touching_sources() {
        let workspace = TestWorkspace::new();
        let base = workspace.root.join("base.pdf");
        let source = workspace.root.join("insert.pdf");
        let base_bytes = write_two_page_pdf(&base);
        let source_bytes = write_single_page_pdf(&source, "Inserted Gamma", 420, 240, 90);
        let base_signature = pdf_signature(&base.metadata().unwrap());
        let source_signature = pdf_signature(&source.metadata().unwrap());
        let inputs = vec![
            (base.clone(), base_signature.clone()),
            (source.clone(), source_signature.clone()),
        ];

        let (preview, output) = build_pdf_insert_isolated(inputs.clone(), vec![1], 1).unwrap();
        let output = output.expect("verified insert must produce isolated bytes");
        assert_eq!(preview.status, "isolated_verified");
        assert_eq!(preview.output_pages, 3);
        assert_eq!(preview.insert_after_page, 1);
        assert_eq!(preview.source_pages, vec![1]);
        assert!(preview.structural_reparse_verified);
        assert!(preview.text_order_verified);
        assert!(preview.page_geometry_verified);
        assert!(preview.sources_unchanged);
        assert_eq!(
            preview
                .page_mapping
                .iter()
                .map(|item| {
                    (
                        item.output_page,
                        item.source_kind.as_str(),
                        item.source_page,
                    )
                })
                .collect::<Vec<_>>(),
            vec![(1, "base", 1), (2, "insert", 1), (3, "base", 2)]
        );
        let output_text = pdf_extract::extract_text_from_mem_by_pages(&output).unwrap();
        assert!(output_text[0].contains("First Page Alpha"));
        assert!(output_text[1].contains("Inserted Gamma"));
        assert!(output_text[2].contains("Second Page Beta"));

        let target = workspace.root.join("inserted.pdf");
        let saved = save_pdf_insert_copy_to_path(
            inputs,
            &target,
            preview.output_digest.as_deref().unwrap(),
            vec![1],
            1,
        )
        .unwrap();
        assert_eq!(saved.inserted_pages, 1);
        assert_eq!(saved.output_pages, 3);
        assert!(saved.structural_reopen_verified);
        assert!(saved.text_reopen_verified);
        assert!(saved.page_geometry_verified);
        assert!(saved.sources_unchanged);
        assert_eq!(fs::read(&base).unwrap(), base_bytes);
        assert_eq!(fs::read(&source).unwrap(), source_bytes);
        assert!(save_pdf_insert_copy_to_path(
            vec![(base, base_signature), (source, source_signature)],
            &target,
            &saved.target_digest,
            vec![1],
            1,
        )
        .unwrap_err()
        .contains("不会覆盖"));
    }

    #[test]
    fn b2c_rejects_invalid_changed_and_encrypted_insert_sources() {
        let workspace = TestWorkspace::new();
        let base = workspace.root.join("base.pdf");
        let source = workspace.root.join("source.pdf");
        write_two_page_pdf(&base);
        let source_bytes = write_single_page_pdf(&source, "Insert Delta", 300, 300, 0);
        let base_signature = pdf_signature(&base.metadata().unwrap());
        let source_signature = pdf_signature(&source.metadata().unwrap());
        assert!(validate_pdf_insert_plan(2, 1, &[], 1)
            .unwrap_err()
            .contains("至少一个"));
        assert!(validate_pdf_insert_plan(2, 1, &[1, 1], 1)
            .unwrap_err()
            .contains("重复"));
        assert!(validate_pdf_insert_plan(2, 1, &[2], 1)
            .unwrap_err()
            .contains("1～1"));
        assert!(validate_pdf_insert_plan(2, 1, &[1], 3)
            .unwrap_err()
            .contains("0～2"));
        assert!(build_pdf_insert_isolated(
            vec![
                (base.clone(), base_signature.clone()),
                (source.clone(), "stale".into()),
            ],
            vec![1],
            0,
        )
        .unwrap_err()
        .contains("外部修改"));

        let encrypted = workspace.root.join("encrypted.pdf");
        write_two_page_pdf(&encrypted);
        let mut encrypted_document = Document::load(&encrypted).unwrap();
        let file_id = Object::String(
            b"longedit-b2c-encrypted-fixture".to_vec(),
            StringFormat::Hexadecimal,
        );
        encrypted_document
            .trailer
            .set("ID", Object::Array(vec![file_id.clone(), file_id]));
        let state = EncryptionState::try_from(EncryptionVersion::V1 {
            document: &encrypted_document,
            owner_password: "owner",
            user_password: "user",
            permissions: Permissions::default(),
        })
        .unwrap();
        encrypted_document.encrypt(&state).unwrap();
        encrypted_document.save(&encrypted).unwrap();
        let (blocked, output) = build_pdf_insert_isolated(
            vec![
                (base, base_signature),
                (
                    encrypted.clone(),
                    pdf_signature(&encrypted.metadata().unwrap()),
                ),
            ],
            vec![1],
            0,
        )
        .unwrap();
        assert_eq!(blocked.status, "blocked");
        assert!(blocked
            .blockers
            .contains(&"source:encrypted_pdf_unverified".into()));
        assert!(output.is_none());
        assert_eq!(fs::read(&source).unwrap(), source_bytes);
        assert_eq!(source_signature, pdf_signature(&source.metadata().unwrap()));
    }

    #[test]
    fn reads_pdf_inside_library_and_rejects_other_extensions() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("paper.pdf");
        fs::write(&pdf, b"%PDF-1.7 fixture").unwrap();
        let bytes = tauri::async_runtime::block_on(read_pdf_file(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(bytes, b"%PDF-1.7 fixture");
        let markdown = workspace.root.join("paper.md");
        fs::write(&markdown, b"not a pdf").unwrap();
        assert!(tauri::async_runtime::block_on(read_pdf_file(
            workspace.root_string(),
            markdown.to_string_lossy().into_owned()
        ))
        .is_err());
    }

    #[test]
    fn rejects_pdf_outside_library() {
        let workspace = TestWorkspace::new();
        let outside = workspace.base.join("outside.pdf");
        fs::write(&outside, b"%PDF-1.7 fixture").unwrap();
        assert!(tauri::async_runtime::block_on(read_pdf_file(
            workspace.root_string(),
            outside.to_string_lossy().into_owned()
        ))
        .is_err());
    }

    #[test]
    fn isolated_page_plan_reorders_rotates_removes_and_preserves_source() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("source.pdf");
        let original = write_two_page_pdf(&pdf);
        let signature = pdf_signature(&pdf.metadata().unwrap());
        let plan = pdf_plan(&[(2, 90, false), (1, 0, true)]);
        let (report, output) = build_pdf_page_plan_isolated(&pdf, &signature, plan).unwrap();
        let output = output.expect("verified plan must produce isolated bytes");

        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.source_pages, 2);
        assert_eq!(report.output_pages, 1);
        assert_eq!(report.rotated_pages, 1);
        assert!(report.reordered);
        assert_eq!(report.removed_pages, 1);
        assert!(report.structural_reparse_verified);
        assert!(report.text_order_verified);
        assert!(report.source_unchanged);
        assert_eq!(report.page_mapping[0].source_page, 2);
        assert_eq!(report.page_mapping[0].rotation, 90);
        assert_eq!(fs::read(&pdf).unwrap(), original);

        let output_document = Document::load_mem(&output).unwrap();
        let output_page = output_document.get_pages()[&1];
        let rotation = inherited_page_value(&output_document, output_page, b"Rotate")
            .unwrap()
            .as_i64()
            .unwrap();
        assert_eq!(rotation, 90);
        let output_text = pdf_extract::extract_text_from_mem_by_pages(&output).unwrap();
        assert_eq!(output_text.len(), 1);
        assert!(output_text[0].contains("Second Page Beta"));
    }

    #[test]
    fn b1c_accepts_modern_object_and_xref_streams_from_multiple_producers() {
        let workspace = TestWorkspace::new();
        for (index, (version, producer, modern)) in [
            ("1.4", "Legacy Producer Fixture", false),
            ("1.7", "Modern Producer Fixture", true),
            ("2.0", "PDF 2 Producer Fixture", false),
        ]
        .into_iter()
        .enumerate()
        {
            let pdf = workspace.root.join(format!("producer-{index}.pdf"));
            write_two_page_pdf(&pdf);
            let mut document = Document::load(&pdf).unwrap();
            document.version = version.into();
            set_pdf_producer(&mut document, producer);
            let mut bytes = Vec::new();
            if modern {
                document.save_modern(&mut bytes).unwrap();
            } else {
                document.save_to(&mut bytes).unwrap();
            }
            fs::write(&pdf, &bytes).unwrap();

            let signature = pdf_signature(&pdf.metadata().unwrap());
            let (report, output) = build_pdf_page_plan_isolated(
                &pdf,
                &signature,
                pdf_plan(&[(2, 90, false), (1, 0, true)]),
            )
            .unwrap();
            assert_eq!(report.status, "isolated_verified");
            assert_eq!(report.compatibility.pdf_version, version);
            assert_eq!(report.compatibility.producer.as_deref(), Some(producer));
            if modern {
                assert_eq!(report.compatibility.xref_kind, "stream");
                assert!(report.compatibility.compressed_objects > 0);
            }
            assert!(output.is_some());
        }
    }

    #[test]
    fn b1c_materializes_inherited_boxes_resources_and_rotation() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("inherited.pdf");
        write_two_page_pdf(&pdf);
        let mut document = Document::load(&pdf).unwrap();
        let pages_id = document
            .catalog()
            .unwrap()
            .get(b"Pages")
            .unwrap()
            .as_reference()
            .unwrap();
        let page_ids: Vec<ObjectId> = document.get_pages().into_values().collect();
        let resources = document
            .get_dictionary(page_ids[0])
            .unwrap()
            .get(b"Resources")
            .unwrap()
            .clone();
        for page_id in &page_ids {
            let page = document.get_dictionary_mut(*page_id).unwrap();
            page.remove(b"Resources");
            page.remove(b"MediaBox");
        }
        let pages = document.get_dictionary_mut(pages_id).unwrap();
        pages.set("Resources", resources);
        pages.set(
            "MediaBox",
            Object::Array(vec![0.into(), 0.into(), 500.into(), 300.into()]),
        );
        pages.set(
            "CropBox",
            Object::Array(vec![20.into(), 10.into(), 480.into(), 290.into()]),
        );
        pages.set("Rotate", Object::Integer(90));
        document.save(&pdf).unwrap();

        let signature = pdf_signature(&pdf.metadata().unwrap());
        let (report, output) = build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(2, 90, false), (1, 0, true)]),
        )
        .unwrap();
        let output = output.unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.compatibility.inherited_page_values, 8);

        let verified = Document::load_mem(&output).unwrap();
        let page_id = verified.get_pages()[&1];
        let page = verified.get_dictionary(page_id).unwrap();
        for key in [b"Resources".as_slice(), b"MediaBox", b"CropBox", b"Rotate"] {
            assert!(
                page.has(key),
                "output page must materialize inherited {key:?}"
            );
        }
        assert_eq!(page.get(b"Rotate").unwrap().as_i64().unwrap(), 180);
        assert_eq!(page.get(b"MediaBox").unwrap().as_array().unwrap().len(), 4);
    }

    #[test]
    fn b1c_accepts_textless_scanned_pages_and_reliable_save() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("scan-source.pdf");
        let target = workspace.root.join("scan-saved.pdf");
        let original = write_scan_pdf(&pdf);
        let signature = pdf_signature(&pdf.metadata().unwrap());
        let plan = pdf_plan(&[(2, 90, false), (1, 0, true)]);
        let (report, output) =
            build_pdf_page_plan_isolated(&pdf, &signature, plan.clone()).unwrap();
        assert_eq!(report.status, "isolated_verified");
        assert_eq!(report.compatibility.textless_pages, Some(2));
        assert!(report.text_order_verified);
        assert!(output.is_some());

        let saved = save_pdf_page_plan_copy_to_path(
            &pdf,
            &target,
            &signature,
            report.output_digest.as_deref().unwrap(),
            plan,
        )
        .unwrap();
        assert_eq!(saved.status, "saved_verified");
        assert!(saved.text_reopen_verified);
        assert_eq!(Document::load(&target).unwrap().get_pages().len(), 1);
        assert_eq!(fs::read(&pdf).unwrap(), original);
    }

    #[test]
    fn isolated_page_plan_blocks_unverified_interactive_pdf_features() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("form.pdf");
        write_two_page_pdf(&pdf);
        let mut document = Document::load(&pdf).unwrap();
        document
            .catalog_mut()
            .unwrap()
            .set("AcroForm", Object::Dictionary(Dictionary::new()));
        document.save(&pdf).unwrap();
        let source = fs::read(&pdf).unwrap();
        let signature = pdf_signature(&pdf.metadata().unwrap());
        let (report, output) = build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(2, 0, false), (1, 0, false)]),
        )
        .unwrap();

        assert_eq!(report.status, "blocked");
        assert!(report.blockers.contains(&"acroform_unverified".into()));
        assert!(output.is_none());
        assert!(report.source_unchanged);
        assert_eq!(fs::read(&pdf).unwrap(), source);
    }

    #[test]
    fn b1c_high_risk_compatibility_matrix_is_stably_blocked() {
        let workspace = TestWorkspace::new();
        let cases = [
            ("acroform", "acroform_unverified"),
            ("portfolio", "pdf_portfolio_unverified"),
            ("embedded", "embedded_files_unverified"),
            ("signature", "digital_signature_unverified"),
            ("outline", "outline_migration_unverified"),
            ("labels", "page_labels_migration_unverified"),
            ("tagged", "tagged_structure_migration_unverified"),
            ("destinations", "named_destinations_migration_unverified"),
        ];
        for (case, expected_blocker) in cases {
            let pdf = workspace.root.join(format!("{case}.pdf"));
            write_two_page_pdf(&pdf);
            let mut document = Document::load(&pdf).unwrap();
            match case {
                "acroform" => document
                    .catalog_mut()
                    .unwrap()
                    .set("AcroForm", Object::Dictionary(Dictionary::new())),
                "portfolio" => document
                    .catalog_mut()
                    .unwrap()
                    .set("Collection", Object::Dictionary(Dictionary::new())),
                "embedded" => document.catalog_mut().unwrap().set(
                    "Names",
                    Object::Dictionary(dictionary! {
                        "EmbeddedFiles" => Object::Dictionary(Dictionary::new()),
                    }),
                ),
                "signature" => {
                    document.add_object(dictionary! { "Type" => "Sig" });
                }
                "outline" => document
                    .catalog_mut()
                    .unwrap()
                    .set("Outlines", Object::Dictionary(Dictionary::new())),
                "labels" => document
                    .catalog_mut()
                    .unwrap()
                    .set("PageLabels", Object::Dictionary(Dictionary::new())),
                "tagged" => document
                    .catalog_mut()
                    .unwrap()
                    .set("StructTreeRoot", Object::Dictionary(Dictionary::new())),
                "destinations" => document.catalog_mut().unwrap().set(
                    "Names",
                    Object::Dictionary(dictionary! {
                        "Dests" => Object::Dictionary(Dictionary::new()),
                    }),
                ),
                _ => unreachable!(),
            }
            document.save(&pdf).unwrap();
            let source = fs::read(&pdf).unwrap();
            let signature = pdf_signature(&pdf.metadata().unwrap());
            let (report, output) = build_pdf_page_plan_isolated(
                &pdf,
                &signature,
                pdf_plan(&[(2, 0, false), (1, 0, false)]),
            )
            .unwrap();
            assert_eq!(report.status, "blocked", "{case}");
            assert!(
                report
                    .blockers
                    .iter()
                    .any(|value| value == expected_blocker),
                "{case}: {:?}",
                report.blockers
            );
            assert!(output.is_none());
            assert!(report.source_unchanged);
            assert_eq!(fs::read(&pdf).unwrap(), source);
        }
    }

    #[test]
    fn b1c_structural_carriers_allow_rotation_only_but_block_page_migration() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("outline-rotation.pdf");
        write_two_page_pdf(&pdf);
        let mut document = Document::load(&pdf).unwrap();
        document
            .catalog_mut()
            .unwrap()
            .set("Outlines", Object::Dictionary(Dictionary::new()));
        document.save(&pdf).unwrap();
        let signature = pdf_signature(&pdf.metadata().unwrap());

        let (rotation_report, rotation_output) = build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(1, 90, false), (2, 0, false)]),
        )
        .unwrap();
        assert_eq!(rotation_report.status, "isolated_verified");
        assert!(rotation_output.is_some());

        let (migration_report, migration_output) = build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(2, 0, false), (1, 0, false)]),
        )
        .unwrap();
        assert_eq!(migration_report.status, "blocked");
        assert!(migration_report
            .blockers
            .contains(&"outline_migration_unverified".into()));
        assert!(migration_output.is_none());
    }

    #[test]
    fn b1c_encrypted_pdf_and_resource_limits_are_blocked_before_output() {
        let workspace = TestWorkspace::new();
        let encrypted = workspace.root.join("encrypted.pdf");
        write_two_page_pdf(&encrypted);
        let mut document = Document::load(&encrypted).unwrap();
        let file_id = Object::String(
            b"longedit-b1c-encrypted-fixture".to_vec(),
            StringFormat::Hexadecimal,
        );
        document
            .trailer
            .set("ID", Object::Array(vec![file_id.clone(), file_id]));
        let state = EncryptionState::try_from(EncryptionVersion::V1 {
            document: &document,
            owner_password: "owner",
            user_password: "user",
            permissions: Permissions::default(),
        })
        .unwrap();
        document.encrypt(&state).unwrap();
        document.save(&encrypted).unwrap();
        let source = fs::read(&encrypted).unwrap();
        let signature = pdf_signature(&encrypted.metadata().unwrap());
        let (report, output) = build_pdf_page_plan_isolated(
            &encrypted,
            &signature,
            pdf_plan(&[(1, 90, false), (2, 0, false)]),
        )
        .unwrap();
        assert_eq!(report.status, "blocked");
        assert!(report.blockers.contains(&"encrypted_pdf_unverified".into()));
        assert!(output.is_none());
        assert_eq!(fs::read(&encrypted).unwrap(), source);

        let oversized = workspace.root.join("oversized.pdf");
        let oversized_file = File::create(&oversized).unwrap();
        oversized_file
            .set_len(MAX_PDF_ISOLATED_INPUT_BYTES + 1)
            .unwrap();
        let oversized_signature = pdf_signature(&oversized.metadata().unwrap());
        let error = build_pdf_page_plan_isolated(
            &oversized,
            &oversized_signature,
            pdf_plan(&[(1, 0, false)]),
        )
        .unwrap_err();
        assert!(error.contains("128 MB"));

        let excessive_plan = (1..=MAX_PDF_PAGE_PLAN_ITEMS as u32 + 1)
            .map(|source_page| PdfPagePlanItem {
                source_page,
                rotation: 0,
                removed: false,
            })
            .collect::<Vec<_>>();
        assert!(
            validate_pdf_page_plan(&excessive_plan, excessive_plan.len())
                .unwrap_err()
                .contains("20000")
        );
    }

    #[test]
    fn isolated_page_plan_rejects_stale_or_invalid_plans() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("invalid.pdf");
        write_two_page_pdf(&pdf);
        let signature = pdf_signature(&pdf.metadata().unwrap());

        assert!(build_pdf_page_plan_isolated(
            &pdf,
            "stale-signature",
            pdf_plan(&[(1, 0, false), (2, 0, false)]),
        )
        .is_err());
        assert!(build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(1, 0, false), (1, 0, false)]),
        )
        .is_err());
        assert!(build_pdf_page_plan_isolated(
            &pdf,
            &signature,
            pdf_plan(&[(1, 0, true), (2, 0, true)]),
        )
        .is_err());
    }

    #[test]
    fn reliable_page_plan_save_creates_verified_copy_and_never_overwrites() {
        let workspace = TestWorkspace::new();
        let source = workspace.root.join("source.pdf");
        let original = write_two_page_pdf(&source);
        let signature = pdf_signature(&source.metadata().unwrap());
        let plan = pdf_plan(&[(2, 90, false), (1, 0, true)]);
        let (preview, _) = build_pdf_page_plan_isolated(&source, &signature, plan.clone()).unwrap();
        let expected_digest = preview.output_digest.unwrap();
        let target = workspace.root.join("source-页面整理.pdf");

        let saved = save_pdf_page_plan_copy_to_path(
            &source,
            &target,
            &signature,
            &expected_digest,
            plan.clone(),
        )
        .unwrap();
        assert_eq!(saved.status, "saved_verified");
        assert_eq!(saved.target_path, target.to_string_lossy());
        assert_eq!(saved.target_digest, expected_digest);
        assert_eq!(saved.output_pages, 1);
        assert!(saved.structural_reopen_verified);
        assert!(saved.text_reopen_verified);
        assert!(saved.source_unchanged);
        assert_eq!(fs::read(&source).unwrap(), original);
        let saved_bytes = fs::read(&target).unwrap();
        assert!(pdf_extract::extract_text_from_mem(&saved_bytes)
            .unwrap()
            .contains("Second Page Beta"));

        let overwrite_error = save_pdf_page_plan_copy_to_path(
            &source,
            &target,
            &signature,
            &expected_digest,
            plan.clone(),
        )
        .unwrap_err();
        assert!(overwrite_error.contains("不会覆盖"));
        assert_eq!(fs::read(&target).unwrap(), saved_bytes);
        assert!(save_pdf_page_plan_copy_to_path(
            &source,
            &source,
            &signature,
            &expected_digest,
            plan,
        )
        .unwrap_err()
        .contains("禁止覆盖源"));
        assert_eq!(fs::read(&source).unwrap(), original);
    }

    #[test]
    fn reliable_page_plan_save_requires_current_preview_digest_and_safe_name() {
        let workspace = TestWorkspace::new();
        let source = workspace.root.join("source.pdf");
        write_two_page_pdf(&source);
        let signature = pdf_signature(&source.metadata().unwrap());
        let plan = pdf_plan(&[(1, 0, false), (2, 90, false)]);
        let target = workspace.root.join("copy.pdf");

        assert!(save_pdf_page_plan_copy_to_path(
            &source,
            &target,
            &signature,
            &"0".repeat(64),
            plan,
        )
        .unwrap_err()
        .contains("重新验证"));
        assert!(!target.exists());
        assert_eq!(
            validate_pdf_copy_file_name("  日常资料-页面整理.PDF  ").unwrap(),
            "日常资料-页面整理.PDF"
        );
        for invalid in [
            "source.pdf",
            "../copy.pdf",
            "folder/copy.pdf",
            "copy?.pdf",
            "copy.txt",
            ".pdf",
        ] {
            if invalid == "source.pdf" {
                continue;
            }
            assert!(
                validate_pdf_copy_file_name(invalid).is_err(),
                "{invalid} should be rejected"
            );
        }
    }

    #[test]
    fn annotation_commands_round_trip_without_modifying_pdf() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("paper.pdf");
        let original = b"%PDF-1.7 immutable";
        fs::write(&pdf, original).unwrap();
        let now = 10;
        let document = PdfAnnotationDocument {
            schema_version: 1,
            source: PdfAnnotationSource {
                pdf_file: "ignored.pdf".into(),
                size: 0,
                modified_at: 0,
                fingerprint: Some("fingerprint".into()),
            },
            annotations: vec![PdfAnnotation {
                id: "a-1".into(),
                kind: PdfAnnotationKind::Area,
                page: 2,
                color: "blue".into(),
                rects: vec![PdfAnnotationRect {
                    x: 0.1,
                    y: 0.1,
                    width: 0.2,
                    height: 0.2,
                }],
                quote: String::new(),
                comment: "figure".into(),
                created_at: now,
                updated_at: now,
            }],
        };
        tauri::async_runtime::block_on(write_pdf_annotations(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            document,
        ))
        .unwrap();
        let loaded = tauri::async_runtime::block_on(read_pdf_annotations(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(loaded.annotations.len(), 1);
        assert_eq!(loaded.source.pdf_file, "paper.pdf");
        assert_eq!(loaded.source.fingerprint.as_deref(), Some("fingerprint"));
        assert_eq!(fs::read(&pdf).unwrap(), original);
        assert!(annotation_path(&pdf).unwrap().exists());
        let reference = tauri::async_runtime::block_on(build_pdf_annotation_reference(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            "a-1".into(),
        ))
        .unwrap();
        assert_eq!(
            reference.uri,
            "longedit://pdf?path=paper.pdf&page=2&annotation=a-1"
        );
        assert!(reference
            .markdown
            .contains("[来源：paper.pdf · 第 2 页 · 区域批注]"));
        assert!(reference.markdown.contains("> figure"));
        assert!(!reference.markdown.contains(&workspace.root_string()));
        assert!(
            tauri::async_runtime::block_on(build_pdf_annotation_reference(
                workspace.root_string(),
                pdf.to_string_lossy().into_owned(),
                "missing".into(),
            ))
            .is_err()
        );
    }

    #[test]
    fn rejects_damaged_annotation_sidecar() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("paper.pdf");
        fs::write(&pdf, b"%PDF").unwrap();
        fs::write(
            annotation_path(&pdf).unwrap(),
            include_str!("../../tests/fixtures/pdf/damaged.annotations.json"),
        )
        .unwrap();
        assert!(tauri::async_runtime::block_on(read_pdf_annotations(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .is_err());
    }

    #[test]
    fn ocr_sidecar_round_trips_without_modifying_pdf() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("scan.pdf");
        let original = b"%PDF-1.7 scanned immutable";
        fs::write(&pdf, original).unwrap();
        let mut document = PdfOcrDocument::empty(ocr_source(&pdf, Some("fp-1".into())).unwrap());
        document.updated_at = 20;
        document.pages.push(PdfOcrPage {
            page: 2,
            text: "knowledge map from scan".into(),
            confidence: 91.2,
            processed_at: 20,
            width: 1600,
            height: 2200,
        });
        tauri::async_runtime::block_on(write_pdf_ocr(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            document,
        ))
        .unwrap();
        let loaded = tauri::async_runtime::block_on(read_pdf_ocr(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(loaded.pages[0].page, 2);
        assert_eq!(loaded.source.fingerprint.as_deref(), Some("fp-1"));
        assert_eq!(fs::read(&pdf).unwrap(), original);
        assert!(ocr_path(&pdf).unwrap().exists());
    }

    #[test]
    fn small_pdf_descriptor_keeps_fast_full_read_path() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("small.pdf");
        let original = b"%PDF-1.7 small fixture";
        fs::write(&pdf, original).unwrap();
        let descriptor = tauri::async_runtime::block_on(read_pdf_info(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(descriptor.length, original.len() as u64);
        assert_eq!(descriptor.full_data.as_deref(), Some(original.as_slice()));
        assert!(descriptor.initial_data.is_empty());
    }

    #[test]
    fn hundred_megabyte_pdf_descriptor_only_reads_initial_chunk() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("large.pdf");
        let mut file = File::create(&pdf).unwrap();
        use std::io::Write as _;
        file.write_all(b"%PDF-1.7\n").unwrap();
        file.set_len(100 * 1024 * 1024).unwrap();
        drop(file);
        let started = std::time::Instant::now();
        let descriptor = tauri::async_runtime::block_on(read_pdf_info(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        assert_eq!(descriptor.length, 100 * 1024 * 1024);
        assert!(descriptor.full_data.is_none());
        assert_eq!(descriptor.initial_data.len(), PDF_INITIAL_BYTES as usize);
        assert!(started.elapsed() < std::time::Duration::from_secs(2));
    }

    #[test]
    fn range_read_is_exact_bounded_and_rejects_stale_file() {
        let workspace = TestWorkspace::new();
        let pdf = workspace.root.join("range.pdf");
        let mut contents = vec![0u8; (MAX_PDF_FULL_READ_BYTES + 1024) as usize];
        for (index, value) in contents.iter_mut().enumerate() {
            *value = (index % 251) as u8;
        }
        contents[..5].copy_from_slice(b"%PDF-");
        fs::write(&pdf, &contents).unwrap();
        let descriptor = tauri::async_runtime::block_on(read_pdf_info(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
        ))
        .unwrap();
        let begin = 700_000;
        let end = begin + 123_456;
        let bytes = tauri::async_runtime::block_on(read_pdf_range(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            begin,
            end,
            descriptor.signature.clone(),
        ))
        .unwrap();
        assert_eq!(bytes, contents[begin as usize..end as usize]);
        assert!(tauri::async_runtime::block_on(read_pdf_range(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            0,
            MAX_PDF_RANGE_BYTES + 1,
            descriptor.signature.clone(),
        ))
        .is_err());
        let file = fs::OpenOptions::new().write(true).open(&pdf).unwrap();
        file.set_len(contents.len() as u64 + 1).unwrap();
        assert!(tauri::async_runtime::block_on(read_pdf_range(
            workspace.root_string(),
            pdf.to_string_lossy().into_owned(),
            0,
            1024,
            descriptor.signature,
        ))
        .is_err());
    }
}
