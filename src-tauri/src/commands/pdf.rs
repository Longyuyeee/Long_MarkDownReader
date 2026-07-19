use crate::formats::pdf_annotations::{
    validate_pdf_annotations, PdfAnnotationDocument, PdfAnnotationKind, PdfAnnotationSource,
    MAX_ANNOTATION_FILE_BYTES,
};
use crate::formats::pdf_ocr::{
    validate_pdf_ocr, PdfOcrDocument, PdfOcrSource, MAX_OCR_SIDECAR_BYTES,
};
use crate::services::reliable_write::{recover_interrupted_write, write_utf8};
use crate::services::workspace_guard::WorkspaceGuard;
use std::fs;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

pub const MAX_PDF_DOCUMENT_BYTES: u64 = 2 * 1024 * 1024 * 1024;
pub const MAX_PDF_FULL_READ_BYTES: u64 = 4 * 1024 * 1024;
pub const PDF_INITIAL_BYTES: u64 = 256 * 1024;
pub const PDF_RANGE_CHUNK_BYTES: u64 = 256 * 1024;
pub const MAX_PDF_RANGE_BYTES: u64 = 1024 * 1024;

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
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

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
